import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import dbConnect from "@/lib/dbConnect";
import defaultInvoiceService, { InvoiceService } from "@/services/invoice.service";
import { CreateInvoiceDto, UpdateInvoiceDto } from "@/dto/invoice.dto";
import { authorizeRequest } from "@/lib/rbac/guard";
import { PERMISSION_KEYS } from "@/types/rbac";

export class InvoiceController {
    constructor(private invoiceService: InvoiceService = defaultInvoiceService) { }

    async createInvoice(request: NextRequest): Promise<NextResponse> {
        try {
            await dbConnect();
            const auth = await authorizeRequest(request, PERMISSION_KEYS.BILLING_INVOICE_CREATE, "Invoice");
            if (!auth.isAuthorized) return auth.response;

            const data: CreateInvoiceDto = await request.json();

            if (!data.patientId || !data.items || !Array.isArray(data.items) || data.totalAmount === undefined || data.discount === undefined || data.finalAmount === undefined) {
                return NextResponse.json(
                    { success: false, message: "Required fields are missing: patientId, items, totalAmount, discount, finalAmount" },
                    { status: 400 }
                );
            }

            if (!Types.ObjectId.isValid(data.patientId)) {
                return NextResponse.json(
                    { success: false, message: "Invalid ID format for patient" },
                    { status: 400 }
                );
            }

            // Enforce branch boundary
            if (auth.context.branchId && auth.grant.orgScope !== "GLOBAL") {
                data.branchId = auth.context.branchId.toString();
            } else if (data.branchId && !Types.ObjectId.isValid(data.branchId)) {
                delete (data as { branchId?: string }).branchId;
            }

            if (!data.invoiceNumber) {
                const dateStr = new Date().toISOString().slice(0, 7).replace("-", "");
                const randomCode = Math.floor(1000 + Math.random() * 9000);
                data.invoiceNumber = `INV-${dateStr}-${randomCode}`;
            }

            if (data.paidAmount === undefined) {
                data.paidAmount = data.status === "PAID" ? data.finalAmount : 0;
            }
            if (data.balanceAmount === undefined) {
                data.balanceAmount = Math.max(0, data.finalAmount - data.paidAmount);
            }

            const invoice = await this.invoiceService.createInvoice(data);

            return NextResponse.json(
                { success: true, message: "Invoice created successfully", data: invoice },
                { status: 201 }
            );
        } catch (error: unknown) {
            const err = error as { statusCode?: number; message?: string };
            const statusCode = err?.statusCode || 500;
            return NextResponse.json(
                { success: false, message: err?.message || "Failed to create invoice" },
                { status: statusCode }
            );
        }
    }

    async getInvoices(request: NextRequest): Promise<NextResponse> {
        try {
            await dbConnect();
            const auth = await authorizeRequest(request, PERMISSION_KEYS.BILLING_INVOICE_VIEW, "Invoice");
            if (!auth.isAuthorized) return auth.response;

            const { searchParams } = new URL(request.url);
            let branchId = searchParams.get('branchId');
            const patientId = searchParams.get('patientId');

            // Force branch confinement if caller is branch scoped
            if (auth.context.branchId && auth.grant.orgScope === "BRANCH") {
                branchId = auth.context.branchId.toString();
            }

            let invoices;

            if (branchId) {
                if (!Types.ObjectId.isValid(branchId)) return NextResponse.json({ success: false, message: "Invalid branch ID" }, { status: 400 });
                invoices = await this.invoiceService.getInvoicesByBranchId(new Types.ObjectId(branchId));
            } else if (patientId) {
                if (!Types.ObjectId.isValid(patientId)) return NextResponse.json({ success: false, message: "Invalid patient ID" }, { status: 400 });
                invoices = await this.invoiceService.getInvoicesByPatientId(new Types.ObjectId(patientId));
                // Filter cross-branch if user has branch boundary
                if (auth.context.branchId && auth.grant.orgScope === "BRANCH") {
                    invoices = invoices.filter(inv => inv.branchId && inv.branchId.toString() === auth.context.branchId!.toString());
                }
            } else {
                invoices = await this.invoiceService.getAllInvoices();
                if (auth.context.branchId && auth.grant.orgScope === "BRANCH") {
                    invoices = invoices.filter(inv => inv.branchId && inv.branchId.toString() === auth.context.branchId!.toString());
                }
            }

            return NextResponse.json(
                { success: true, count: invoices.length, data: invoices },
                { status: 200 }
            );
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Failed to fetch invoices";
            return NextResponse.json(
                { success: false, message },
                { status: 500 }
            );
        }
    }

    async getInvoiceById(id: string, request?: NextRequest): Promise<NextResponse> {
        try {
            await dbConnect();
            if (request) {
                const auth = await authorizeRequest(request, PERMISSION_KEYS.BILLING_INVOICE_VIEW, "Invoice");
                if (!auth.isAuthorized) return auth.response;

                if (!Types.ObjectId.isValid(id)) {
                    return NextResponse.json(
                        { success: false, message: "Invalid invoice ID" },
                        { status: 400 }
                    );
                }

                const invoice = await this.invoiceService.getInvoiceById(new Types.ObjectId(id));
                if (!invoice) {
                    return NextResponse.json(
                        { success: false, message: "Invoice not found" },
                        { status: 404 }
                    );
                }

                // Check branch boundary
                if (auth.context.branchId && auth.grant.orgScope === "BRANCH") {
                    if (invoice.branchId && invoice.branchId.toString() !== auth.context.branchId.toString()) {
                        return NextResponse.json(
                            { success: false, message: "Forbidden: Invoice belongs to another branch" },
                            { status: 403 }
                        );
                    }
                }

                return NextResponse.json(
                    { success: true, data: invoice },
                    { status: 200 }
                );
            }

            if (!Types.ObjectId.isValid(id)) {
                return NextResponse.json(
                    { success: false, message: "Invalid invoice ID" },
                    { status: 400 }
                );
            }

            const invoice = await this.invoiceService.getInvoiceById(new Types.ObjectId(id));
            if (!invoice) {
                return NextResponse.json(
                    { success: false, message: "Invoice not found" },
                    { status: 404 }
                );
            }

            return NextResponse.json(
                { success: true, data: invoice },
                { status: 200 }
            );
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Failed to fetch invoice";
            return NextResponse.json(
                { success: false, message },
                { status: 500 }
            );
        }
    }

    async updateInvoice(request: NextRequest, id: string): Promise<NextResponse> {
        try {
            await dbConnect();
            const auth = await authorizeRequest(request, PERMISSION_KEYS.BILLING_INVOICE_UPDATE, "Invoice");
            if (!auth.isAuthorized) return auth.response;

            if (!Types.ObjectId.isValid(id)) {
                return NextResponse.json(
                    { success: false, message: "Invalid invoice ID" },
                    { status: 400 }
                );
            }

            // Check existing invoice branch boundary
            const existingInvoice = await this.invoiceService.getInvoiceById(new Types.ObjectId(id));
            if (!existingInvoice) {
                return NextResponse.json({ success: false, message: "Invoice not found" }, { status: 404 });
            }

            if (auth.context.branchId && auth.grant.orgScope === "BRANCH") {
                if (existingInvoice.branchId && existingInvoice.branchId.toString() !== auth.context.branchId.toString()) {
                    return NextResponse.json(
                        { success: false, message: "Forbidden: Cannot update invoice belonging to another branch" },
                        { status: 403 }
                    );
                }
            }

            const data: UpdateInvoiceDto = await request.json();

            if (data.patientId && !Types.ObjectId.isValid(data.patientId)) {
                return NextResponse.json({ success: false, message: "Invalid patient ID format" }, { status: 400 });
            }
            if (data.branchId && !Types.ObjectId.isValid(data.branchId)) {
                return NextResponse.json({ success: false, message: "Invalid branch ID format" }, { status: 400 });
            }

            const invoice = await this.invoiceService.updateInvoice(new Types.ObjectId(id), data);

            return NextResponse.json(
                { success: true, message: "Invoice updated successfully", data: invoice },
                { status: 200 }
            );
        } catch (error: unknown) {
            const err = error as { statusCode?: number; message?: string };
            const statusCode = err?.statusCode || 500;
            return NextResponse.json(
                { success: false, message: err?.message || "Failed to update invoice" },
                { status: statusCode }
            );
        }
    }

    async deleteInvoice(id: string, request?: NextRequest): Promise<NextResponse> {
        try {
            await dbConnect();
            if (request) {
                const auth = await authorizeRequest(request, PERMISSION_KEYS.BILLING_INVOICE_CANCEL, "Invoice");
                if (!auth.isAuthorized) return auth.response;

                const existingInvoice = await this.invoiceService.getInvoiceById(new Types.ObjectId(id));
                if (!existingInvoice) {
                    return NextResponse.json({ success: false, message: "Invoice not found" }, { status: 404 });
                }

                if (auth.context.branchId && auth.grant.orgScope === "BRANCH") {
                    if (existingInvoice.branchId && existingInvoice.branchId.toString() !== auth.context.branchId.toString()) {
                        return NextResponse.json(
                            { success: false, message: "Forbidden: Cannot cancel invoice belonging to another branch" },
                            { status: 403 }
                        );
                    }
                }
            }

            if (!Types.ObjectId.isValid(id)) {
                return NextResponse.json(
                    { success: false, message: "Invalid invoice ID" },
                    { status: 400 }
                );
            }

            await this.invoiceService.deleteInvoice(new Types.ObjectId(id));

            return NextResponse.json(
                { success: true, message: "Invoice deleted successfully" },
                { status: 200 }
            );
        } catch (error: unknown) {
            const err = error as { statusCode?: number; message?: string };
            const statusCode = err?.statusCode || 500;
            return NextResponse.json(
                { success: false, message: err?.message || "Failed to delete invoice" },
                { status: statusCode }
            );
        }
    }
}

const invoiceController = new InvoiceController();
export default invoiceController;
