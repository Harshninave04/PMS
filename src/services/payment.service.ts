import { Types, ClientSession } from "mongoose";
import mongoose from "mongoose";
import PaymentModel from "@/models/payment.model";
import InvoiceModel from "@/models/invoice.model";
import AdmissionModel from "@/models/admission.model";
import { IPayment } from "@/interfaces/payment.interface";
import { CreatePaymentDto, UpdatePaymentDto } from "@/dto/payment.dto";
import { nextBillingNumber } from "@/lib/billing-numbers";
import { fmtMoney, num, round2 } from "@/lib/money";
import { supportsMongoTransactions } from "@/lib/mongo-transaction-support";

export class PaymentService {
    async createPayment(data: CreatePaymentDto): Promise<IPayment> {
        // Server-side payment guardrails: amount must be a positive number and,
        // for invoice payments, cannot exceed the invoice balance. Cancelled
        // and fully paid invoices reject further payments.
        const amount = round2(num(data.amount));
        if (!data.amount || amount <= 0) {
            throw {
                statusCode: 400,
                message: "Payment amount must be greater than zero",
            };
        }
        data.type = data.type || "PAYMENT";

        if (!data.receiptNumber) {
            data.receiptNumber = await nextBillingNumber("REC");
        }

        // ADVANCE: a deposit received for a stay before any bill exists. It is
        // ledger-only here; the invoice creation applies unconsumed advances.
        if (data.type === "ADVANCE") {
            if (data.invoiceId) {
                throw {
                    statusCode: 400,
                    message: "Record regular payments against the invoice instead — an advance is received before billing",
                };
            }
            if (!data.admissionId || !Types.ObjectId.isValid(String(data.admissionId))) {
                throw {
                    statusCode: 400,
                    message: "An advance needs the admission (stay) it covers",
                };
            }
            const admission = await AdmissionModel.findById(String(data.admissionId)).select("patientId status");
            if (!admission) {
                throw {
                    statusCode: 404,
                    message: "Admission not found for this advance",
                };
            }
            if (String(admission.patientId) !== String(data.patientId)) {
                throw {
                    statusCode: 409,
                    message: "The advance patient does not match the admission",
                };
            }
            data.amount = amount;
            const advance = new PaymentModel(data);
            return await advance.save();
        }

        const invoiceId = data.invoiceId ? new Types.ObjectId(data.invoiceId.toString()) : null;
        if (invoiceId) {
            // Receipt writes + the invoice update go in one transaction when the
            // deployment supports it — a payment must never land without its
            // invoice-side balance update (or vice versa).
            const mongoClient = mongoose.connection.getClient() as ReturnType<
                typeof mongoose.connection.getClient
            > & { topology?: { description?: { type?: string } } };
            const usedTransaction = supportsMongoTransactions(mongoClient.topology?.description?.type);
            const session: ClientSession | null = usedTransaction ? await mongoose.startSession() : null;

            try {
                if (session) await session.startTransaction();

                const invoice = await InvoiceModel.findById(invoiceId).session(session as ClientSession);
                if (!invoice) {
                    throw {
                        statusCode: 404,
                        message: "Invoice not found for this payment",
                    };
                }
                if (invoice.status === "CANCELLED") {
                    throw {
                        statusCode: 409,
                        message: "This invoice is cancelled — payments cannot be recorded against it",
                    };
                }
                const finalAmount = round2(num(invoice.finalAmount));
                const paidAmount = round2(num(invoice.paidAmount));

                // REFUND: returns collected money; capped at what is actually paid.
                if (data.type === "REFUND") {
                    if (paidAmount <= 0) {
                        throw {
                            statusCode: 409,
                            message: "Nothing has been collected on this invoice yet — there is nothing to refund",
                        };
                    }
                    if (amount > paidAmount) {
                        throw {
                            statusCode: 400,
                            message: `Refund cannot exceed the collected amount of ${fmtMoney(paidAmount)}`,
                        };
                    }
                }

                const balance = round2(Math.max(0, finalAmount - paidAmount));
                if (data.type !== "REFUND") {
                    if (balance <= 0) {
                        throw {
                            statusCode: 409,
                            message: "This invoice is already fully paid",
                        };
                    }
                    if (amount > balance) {
                        throw {
                            statusCode: 400,
                            message: `Payment exceeds the pending balance of ${fmtMoney(balance)}`,
                        };
                    }
                }

                // Phase 3.7: split collection — each line becomes its own receipt
                // sharing one receiptGroupId; the invoice is updated once with the
                // line total.
                let savedPayment: IPayment;
                if (data.type !== "REFUND" && Array.isArray(data.lines) && data.lines.length > 0) {
                    for (const line of data.lines) {
                        const lineAmount = round2(num(line.amount));
                        if (!lineAmount || lineAmount <= 0) {
                            throw {
                                statusCode: 400,
                                message: "Every payment line needs an amount greater than zero",
                            };
                        }
                        if (!line.method) {
                            throw {
                                statusCode: 400,
                                message: "Every payment line needs a payment method",
                            };
                        }
                    }
                    const lineTotal = round2(data.lines.reduce((sum, line) => sum + round2(num(line.amount)), 0));
                    if (lineTotal > balance) {
                        throw {
                            statusCode: 400,
                            message: `Payment lines total ${fmtMoney(lineTotal)} exceeds the pending balance of ${fmtMoney(balance)}`,
                        };
                    }

                    const receiptGroupId = new Types.ObjectId().toString();
                    let firstPayment: IPayment | undefined;
                    for (const line of data.lines) {
                        const linePayment = new PaymentModel({
                            ...data,
                            lines: undefined,
                            amount: round2(num(line.amount)),
                            method: line.method,
                            notes: line.notes || undefined,
                            receiptGroupId,
                        });
                        linePayment.receiptNumber = await nextBillingNumber("REC");
                        const saved = await linePayment.save(session ? { session } : undefined);
                        if (!firstPayment) firstPayment = saved;
                    }

                    const newPaid = round2(paidAmount + lineTotal);
                    const newBalance = round2(Math.max(0, finalAmount - newPaid));
                    const newStatus =
                        newBalance <= 0
                            ? newPaid > 0 ? "PAID" : "UNPAID"
                            : "PARTIALLY_PAID";

                    invoice.paidAmount = newPaid;
                    invoice.balanceAmount = newBalance;
                    invoice.status = newStatus;
                    invoice.paymentMethod = data.lines[0].method;
                    await invoice.save(session ? { session } : undefined);

                    savedPayment = firstPayment as IPayment;
                } else {
                    data.amount = amount;
                    const payment = new PaymentModel(data);
                    savedPayment = await payment.save(session ? { session } : undefined);

                    // Automatically update the associated Invoice
                    const newPaid = data.type === "REFUND" ? round2(paidAmount - amount) : round2(paidAmount + amount);
                    const newBalance = round2(Math.max(0, finalAmount - newPaid));
                    const newStatus =
                        newBalance <= 0
                            ? newPaid > 0 ? "PAID" : "UNPAID"
                            : "PARTIALLY_PAID";

                    invoice.paidAmount = newPaid;
                    invoice.balanceAmount = newBalance;
                    invoice.status = newStatus;
                    if (data.type !== "REFUND" && data.method) {
                        invoice.paymentMethod = data.method;
                    }
                    await invoice.save(session ? { session } : undefined);
                }

                if (session) await session.commitTransaction();
                return savedPayment;
            } catch (txError) {
                if (session) {
                    try {
                        await session.abortTransaction();
                    } catch {}
                }
                throw txError;
            } finally {
                session?.endSession();
            }
        }

        throw {
            statusCode: 400,
            message: data.type === "REFUND"
                ? "A refund needs the invoice it refunds"
                : "Payments without an invoice are not supported — record an ADVANCE against the admission instead",
        };
    }

    async getPaymentById(id: Types.ObjectId): Promise<IPayment | null> {
        return await PaymentModel.findById(id).populate("patientId").populate("invoiceId");
    }

    async getAllPayments(): Promise<IPayment[]> {
        return await PaymentModel.find().populate("patientId").populate("invoiceId").sort({ createdAt: -1 });
    }

    async getPaymentsByInvoiceId(invoiceId: Types.ObjectId): Promise<IPayment[]> {
        return await PaymentModel.find({ invoiceId }).populate("patientId").populate("invoiceId").sort({ createdAt: -1 });
    }

    async getPaymentsByBranchId(branchId: Types.ObjectId): Promise<IPayment[]> {
        return await PaymentModel.find({ branchId }).populate("patientId").populate("invoiceId").sort({ createdAt: -1 });
    }

    async updatePayment(id: Types.ObjectId, data: UpdatePaymentDto): Promise<IPayment | null> {
        return await PaymentModel.findByIdAndUpdate(id, data, { new: true });
    }

    async deletePayment(id: Types.ObjectId): Promise<IPayment | null> {
        return await PaymentModel.findByIdAndDelete(id);
    }
}

export default new PaymentService();
