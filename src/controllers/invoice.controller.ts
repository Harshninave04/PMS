import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import dbConnect from "@/lib/dbConnect";
import defaultInvoiceService, { InvoiceService } from "@/services/invoice.service";
import Invoice from "@/models/invoice.model";
import Admission from "@/models/admission.model";
import Organization from "@/models/organization.model";
import { CreateInvoiceDto, UpdateInvoiceDto } from "@/dto/invoice.dto";
import { authorizeRequest, hasRequestPermission } from "@/lib/rbac/guard";
import { PERMISSION_KEYS } from "@/types/rbac";
import { nextBillingNumber } from "@/lib/billing-numbers";
import { num, round2 } from "@/lib/money";

import {
    buildAdmissionDraft,
    getLinkedInvoice,
    BillingActor,
} from "@/services/billing-flow.service";
import { isSuperAdminRole } from "@/lib/rbac/default-permissions";

// Server-side money rules. The client's numbers are never trusted: these
// helpers reject NaN/negatives/zero quantities, validate line discounts and
// recompute every total from price * qty. Trade payment money stays 2-decimal.
function validateAndRecomputeTotals(data: CreateInvoiceDto): { ok: true } | { ok: false; message: string } {
    if (!Array.isArray(data.items) || data.items.length === 0) {
        return { ok: false, message: "At least one charge row is required" };
    }
    if (data.items.length > 500) {
        return { ok: false, message: "Too many charge rows (limit 500)" };
    }
    let totalAmount = 0;
    let taxAmount = 0;
    const items = [];
    for (let i = 0; i < data.items.length; i += 1) {
        const row = data.items[i];
        const name = typeof row?.name === "string" ? row.name.trim() : "";
        if (!name) {
            return { ok: false, message: `Row ${i + 1}: description is required` };
        }
        if (name.length > 300) {
            return { ok: false, message: `Row ${i + 1}: description is too long` };
        }
        const priceRaw: unknown = row?.price;
        const price = num(priceRaw);
        if (typeof priceRaw !== "number" && typeof priceRaw !== "string") {
            return { ok: false, message: `Row ${i + 1}: rate must be a number` };
        }
        if (typeof priceRaw === "string" && priceRaw.trim() === "") {
            return { ok: false, message: `Row ${i + 1}: rate must be a number` };
        }
        if (price < 0) {
            return { ok: false, message: `Row ${i + 1}: rate must be zero or a positive number` };
        }
        if (price === 0) {
            return { ok: false, message: `Row ${i + 1}: rate must be greater than zero — delete the row if it is not chargeable` };
        }
        const quantity = num(row?.quantity);
        const discount = num(row?.discount);
        const tax = num(row?.tax);
        if (quantity <= 0 || !Number.isFinite(Number(row?.quantity))) {
            return { ok: false, message: `Row ${i + 1}: quantity must be greater than zero` };
        }
        if (discount < 0) {
            return { ok: false, message: `Row ${i + 1}: discount cannot be negative` };
        }
        if (tax < 0 || tax > 100) {
            return { ok: false, message: `Row ${i + 1}: tax must be between 0 and 100%` };
        }
        const gross = round2(price * quantity);
        if (discount > gross) {
            return { ok: false, message: `Row ${i + 1}: discount exceeds the row amount` };
        }
        const taxValue = round2(round2(gross - discount) * (tax / 100));
        totalAmount = round2(totalAmount + gross);
        taxAmount = round2(taxAmount + taxValue);
        items.push({
            name,
            price,
            quantity,
            discount,
            tax,
            total: round2(gross - discount + taxValue),
        });
    }

    const requestedDiscount = num((data as { discount?: unknown }).discount);
    if (requestedDiscount < 0) {
        return { ok: false, message: "Bill discount cannot be negative" };
    }
    if (requestedDiscount > totalAmount) {
        return { ok: false, message: `Bill discount exceeds the gross amount (${totalAmount.toFixed(2)})` };
    }
    const discount = round2(requestedDiscount);
    if (discount > 0) {
        const reason = typeof data.discountReason === "string" ? data.discountReason.trim() : "";
        if (!reason) {
            return { ok: false, message: "A reason is required when a discount is applied" };
        }
        data.discountReason = reason.slice(0, 300);
    } else {
        delete (data as { discountReason?: string }).discountReason;
    }
    const finalAmount = round2(Math.max(0, totalAmount - discount + taxAmount));

    data.items = items as CreateInvoiceDto["items"];
    data.totalAmount = totalAmount;
    data.taxAmount = taxAmount;
    data.discount = discount;
    data.finalAmount = finalAmount;
    return { ok: true };
}

async function findActiveInvoiceByAdmission(admissionId: string) {
    return Invoice.findOne({
        admissionId: new Types.ObjectId(admissionId),
        status: { $ne: "CANCELLED" },
    })
        .select("invoiceNumber status finalAmount")
        .lean();
}

function isDuplicateAdmissionError(error: unknown): boolean {
    const err = error as { code?: number; keyValue?: Record<string, unknown> };
    return err?.code === 11000 && !!err?.keyValue && "admissionId" in err.keyValue;
}

export class InvoiceController {
    constructor(private invoiceService: InvoiceService = defaultInvoiceService) { }

    // GET /api/invoice/draft?admissionId=… — pre-computed charge rows for one
    // flagged stay (bed+nursing×days, doctor rounds, GIVEN eMAR doses).
    async getAdmissionDraft(request: NextRequest): Promise<NextResponse> {
        try {
            await dbConnect();
            const auth = await authorizeRequest(request, PERMISSION_KEYS.BILLING_INVOICE_VIEW, "Invoice");
            if (!auth.isAuthorized) return auth.response;

            const admissionId = new URL(request.url).searchParams.get("admissionId");
            if (!admissionId || !Types.ObjectId.isValid(admissionId)) {
                return NextResponse.json(
                    { success: false, message: "Valid admission ID is required" },
                    { status: 400 }
                );
            }

            const actor: BillingActor = {
                userId: auth.context.userId,
                roleName: auth.context.roleName,
                isSuperAdmin: isSuperAdminRole(auth.context.roleName),
                branchId: auth.context.branchId,
                organizationId: auth.context.organizationId,
                orgScope: auth.grant.orgScope,
            };
            const draft = await buildAdmissionDraft(admissionId, actor);
            const invoice = await getLinkedInvoice(admissionId);

            return NextResponse.json(
                { success: true, data: { ...draft, invoice } },
                { status: 200 }
            );
        } catch (error: unknown) {
            const err = error as { statusCode?: number; message?: string };
            const message = err?.message || (error instanceof Error ? error.message : "Failed to build the billing draft");
            return NextResponse.json(
                { success: false, message },
                { status: err?.statusCode ?? 500 }
            );
        }
    }

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

            if (data.admissionId && !Types.ObjectId.isValid(data.admissionId.toString())) {
                return NextResponse.json(
                    { success: false, message: "Invalid ID format for admission" },
                    { status: 400 }
                );
            }

            // An inpatient bill must belong to the exact patient and stay the
            // accountant is authorized to access. Do this before duplicate
            // lookup so an out-of-scope admission cannot be probed by ID.
            let linkedAdmission: { branchId?: Types.ObjectId } | null = null;
            if (data.admissionId) {
                const admissionId = new Types.ObjectId(data.admissionId.toString());
                const admissionQuery: Record<string, unknown> = {
                    _id: admissionId,
                    patientId: new Types.ObjectId(data.patientId),
                    status: { $in: ["ADMITTED", "TRANSFERRED"] },
                };
                if (auth.grant.orgScope === "BRANCH") {
                    const allowedBranch = auth.context.branchId?.toString() || auth.context.organizationId?.toString();
                    if (!allowedBranch || !Types.ObjectId.isValid(allowedBranch)) {
                        return NextResponse.json({ success: false, message: "Branch scope is missing" }, { status: 403 });
                    }
                    admissionQuery.branchId = new Types.ObjectId(allowedBranch);
                } else if (auth.grant.orgScope === "ORGANIZATION") {
                    const organizationId = auth.context.organizationId?.toString();
                    if (!organizationId || !Types.ObjectId.isValid(organizationId)) {
                        return NextResponse.json({ success: false, message: "Organization scope is missing" }, { status: 403 });
                    }
                    admissionQuery.branchId = {
                        $in: await Organization.find({
                            $or: [{ _id: new Types.ObjectId(organizationId) }, { headQuarter: new Types.ObjectId(organizationId) }],
                        }).distinct("_id"),
                    };
                }
                const admission = await Admission.findOne(admissionQuery).select("branchId").lean();
                if (!admission) {
                    return NextResponse.json(
                        { success: false, message: "The patient and active admission do not match or are outside your access scope" },
                        { status: 404 }
                    );
                }
                linkedAdmission = admission;
            }

            // Server does not trust client totals: validate rows and recompute
            // gross/discount/tax/final from price * quantity.
            const totals = validateAndRecomputeTotals(data);
            if (!totals.ok) {
                return NextResponse.json(
                    { success: false, message: totals.message },
                    { status: 400 }
                );
            }

            // Bill-discount cap: any discount above this share of the gross is a
            // management decision and needs the discount clearance ("Discount
            // above limit" on the Create Bill sub-item in the permission matrix).
            const cap = round2(data.totalAmount * 0.1);
            if (num(data.discount) > cap) {
                const allowed = await hasRequestPermission("billing.create:discount");
                if (!allowed) {
                    return NextResponse.json(
                        {
                            success: false,
                            message: `Discounts above 10% of the gross amount (${cap.toFixed(2)}) require the billing discount permission (billing.create:discount)`,
                        },
                        { status: 403 }
                    );
                }
            }

            // Duplicate-bill guard (friendly message up-front; the partial
            // unique index created by scripts/create-bill-unique-index.ts is
            // the race-proof backstop below).
            if (data.admissionId) {
                const existing = await findActiveInvoiceByAdmission(data.admissionId.toString());
                if (existing) {
                    return NextResponse.json(
                        {
                            success: false,
                            message: `An invoice already exists for this stay (${existing.invoiceNumber ?? "queued"}, ${existing.status}). Open the Bills list instead — a stay cannot be billed twice.`,
                        },
                        { status: 409 }
                    );
                }
            }

            // Enforce branch boundary
            if (linkedAdmission?.branchId) {
                data.branchId = linkedAdmission.branchId.toString();
            } else if (auth.context.branchId && auth.grant.orgScope !== "GLOBAL") {
                data.branchId = auth.context.branchId.toString();
            } else if (data.branchId && !Types.ObjectId.isValid(data.branchId)) {
                delete (data as { branchId?: string }).branchId;
            }

            if (!data.invoiceNumber) {
                data.invoiceNumber = await nextBillingNumber("INV");
            }

            if (data.paidAmount === undefined) {
                data.paidAmount = data.status === "PAID" ? data.finalAmount : 0;
            }
            if (data.balanceAmount === undefined) {
                data.balanceAmount = Math.max(0, round2(data.finalAmount - num(data.paidAmount)));
            }

            try {
                const invoice = await this.invoiceService.createInvoice(data);

                return NextResponse.json(
                    { success: true, message: "Invoice created successfully", data: invoice },
                    { status: 201 }
                );
            } catch (insertError) {
                if (isDuplicateAdmissionError(insertError)) {
                    const existing = data.admissionId
                        ? await findActiveInvoiceByAdmission(data.admissionId.toString()).catch(() => null)
                        : null;
                    return NextResponse.json(
                        {
                            success: false,
                            message: `A bill for this stay already exists${existing?.invoiceNumber ? ` (${existing.invoiceNumber})` : ""}. Refresh the queue — a stay cannot be billed twice.`,
                        },
                        { status: 409 }
                    );
                }
                throw insertError;
            }
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

            // Keep the isActive marker in sync with the status so the partial
            // unique index admits exactly one non-cancelled invoice per stay.
            if (typeof data.status === "string") {
                data.isActive = data.status !== "CANCELLED";
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
