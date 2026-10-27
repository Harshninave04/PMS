import { Types } from "mongoose";
import PaymentModel from "@/models/payment.model";
import InvoiceModel from "@/models/invoice.model";
import { IPayment } from "@/interfaces/payment.interface";
import { CreatePaymentDto, UpdatePaymentDto } from "@/dto/payment.dto";
import { nextBillingNumber } from "@/lib/billing-numbers";
import { fmtMoney, num, round2 } from "@/lib/money";

export class PaymentService {
    async createPayment(data: CreatePaymentDto): Promise<IPayment> {
        // Server-side payment guardrails: amount must be a positive number and
        // cannot exceed the invoice balance. Cancelled and fully paid invoices
        // reject further payments.
        const amount = round2(num(data.amount));
        if (!data.amount || amount <= 0) {
            throw {
                statusCode: 400,
                message: "Payment amount must be greater than zero",
            };
        }

        if (!data.receiptNumber) {
            data.receiptNumber = await nextBillingNumber("REC");
        }

        const invoiceId = data.invoiceId ? new Types.ObjectId(data.invoiceId.toString()) : null;
        if (invoiceId) {
            const invoice = await InvoiceModel.findById(invoiceId);
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
            const balance = round2(Math.max(0, finalAmount - paidAmount));
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

            data.amount = amount;
            const payment = new PaymentModel(data);
            const savedPayment = await payment.save();

            // Automatically update the associated Invoice
            const newPaid = round2(paidAmount + amount);
            const newBalance = round2(Math.max(0, finalAmount - newPaid));
            const newStatus = newBalance <= 0 ? "PAID" : "PARTIALLY_PAID";

            invoice.paidAmount = newPaid;
            invoice.balanceAmount = newBalance;
            invoice.status = newStatus;
            if (data.method) {
                invoice.paymentMethod = data.method;
            }
            await invoice.save();

            return savedPayment;
        }

        // Payments without an invoice (not supported by this flow yet) keep
        // their legacy behaviour: a bare ledger row with no balance update.
        data.amount = amount;
        const payment = new PaymentModel(data);
        return await payment.save();
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
