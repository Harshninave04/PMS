import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import dbConnect from "@/lib/dbConnect";
import defaultPaymentService, { PaymentService } from "@/services/payment.service";
import { CreatePaymentDto } from "@/dto/payment.dto";
import { authorizeRequest } from "@/lib/rbac/guard";
import { PERMISSION_KEYS } from "@/types/rbac";

export class PaymentController {
    constructor(private paymentService: PaymentService = defaultPaymentService) { }

    async createPayment(request: NextRequest): Promise<NextResponse> {
        try {
            await dbConnect();
            const auth = await authorizeRequest(request, PERMISSION_KEYS.BILLING_PAYMENT_CREATE, "Payment");
            if (!auth.isAuthorized) return auth.response;

            const data: CreatePaymentDto = await request.json();

            if (!data.invoiceId || !data.patientId || data.amount === undefined || !data.method) {
                return NextResponse.json(
                    { success: false, message: "Required fields are missing: invoiceId, patientId, amount, method" },
                    { status: 400 }
                );
            }

            // Enforce branch boundary
            if (auth.context.branchId && auth.grant.orgScope !== "GLOBAL") {
                data.branchId = auth.context.branchId.toString();
            } else if (data.branchId && !Types.ObjectId.isValid(data.branchId as string)) {
                delete (data as { branchId?: unknown }).branchId;
            }

            const payment = await this.paymentService.createPayment(data);

            return NextResponse.json(
                { success: true, message: "Payment created successfully", data: payment },
                { status: 201 }
            );
        } catch (error: unknown) {
            const err = error as { statusCode?: number; message?: string };
            const statusCode = err?.statusCode || 500;
            return NextResponse.json(
                { success: false, message: err?.message || "Failed to create payment" },
                { status: statusCode }
            );
        }
    }

    async getPayments(request: NextRequest): Promise<NextResponse> {
        try {
            await dbConnect();
            const auth = await authorizeRequest(request, PERMISSION_KEYS.BILLING_PAYMENT_VIEW, "Payment");
            if (!auth.isAuthorized) return auth.response;

            const { searchParams } = new URL(request.url);
            let branchId = searchParams.get('branchId');
            const invoiceId = searchParams.get('invoiceId');

            // Force branch boundary if user is branch-scoped
            if (auth.context.branchId && auth.grant.orgScope === "BRANCH") {
                branchId = auth.context.branchId.toString();
            }

            let payments;

            if (branchId) {
                if (!Types.ObjectId.isValid(branchId)) return NextResponse.json({ success: false, message: "Invalid branch ID" }, { status: 400 });
                payments = await this.paymentService.getPaymentsByBranchId(new Types.ObjectId(branchId));
            } else if (invoiceId) {
                if (!Types.ObjectId.isValid(invoiceId)) return NextResponse.json({ success: false, message: "Invalid invoice ID" }, { status: 400 });
                payments = await this.paymentService.getPaymentsByInvoiceId(new Types.ObjectId(invoiceId));
                if (auth.context.branchId && auth.grant.orgScope === "BRANCH") {
                    payments = payments.filter(p => p.branchId && p.branchId.toString() === auth.context.branchId!.toString());
                }
            } else {
                payments = await this.paymentService.getAllPayments();
                if (auth.context.branchId && auth.grant.orgScope === "BRANCH") {
                    payments = payments.filter(p => p.branchId && p.branchId.toString() === auth.context.branchId!.toString());
                }
            }

            return NextResponse.json(
                { success: true, count: payments.length, data: payments },
                { status: 200 }
            );
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Failed to fetch payments";
            return NextResponse.json(
                { success: false, message },
                { status: 500 }
            );
        }
    }

    async getPaymentById(id: string, request?: NextRequest): Promise<NextResponse> {
        try {
            await dbConnect();
            if (request) {
                const auth = await authorizeRequest(request, PERMISSION_KEYS.BILLING_PAYMENT_VIEW, "Payment");
                if (!auth.isAuthorized) return auth.response;

                if (!Types.ObjectId.isValid(id)) {
                    return NextResponse.json(
                        { success: false, message: "Invalid payment ID" },
                        { status: 400 }
                    );
                }

                const payment = await this.paymentService.getPaymentById(new Types.ObjectId(id));
                if (!payment) {
                    return NextResponse.json(
                        { success: false, message: "Payment not found" },
                        { status: 404 }
                    );
                }

                if (auth.context.branchId && auth.grant.orgScope === "BRANCH") {
                    if (payment.branchId && payment.branchId.toString() !== auth.context.branchId.toString()) {
                        return NextResponse.json(
                            { success: false, message: "Forbidden: Payment belongs to another branch" },
                            { status: 403 }
                        );
                    }
                }

                return NextResponse.json(
                    { success: true, data: payment },
                    { status: 200 }
                );
            }

            if (!Types.ObjectId.isValid(id)) {
                return NextResponse.json(
                    { success: false, message: "Invalid payment ID" },
                    { status: 400 }
                );
            }

            const payment = await this.paymentService.getPaymentById(new Types.ObjectId(id));
            if (!payment) {
                return NextResponse.json(
                    { success: false, message: "Payment not found" },
                    { status: 404 }
                );
            }

            return NextResponse.json(
                { success: true, data: payment },
                { status: 200 }
            );
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Failed to fetch payment";
            return NextResponse.json(
                { success: false, message },
                { status: 500 }
            );
        }
    }
}

const paymentController = new PaymentController();
export default paymentController;
