import { NextRequest, NextResponse } from "next/server";
import InvoiceController from "@/controllers/invoice.controller";
import { requirePermission } from "@/lib/rbac/guard";

export async function POST(request: NextRequest): Promise<NextResponse> {
    const denied = await requirePermission(request, "billing.create:create");
    if (denied) return denied;

    try {
        return await InvoiceController.createInvoice(request);
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Failed to create invoice";
        return NextResponse.json({
            success: false,
            message
        }, { status: 500 });
    }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
    const denied = await requirePermission(request, "billing.invoices:view");
    if (denied) return denied;

    try {
        return await InvoiceController.getInvoices(request);
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Failed to fetch invoices";
        return NextResponse.json({
            success: false,
            message
        }, { status: 500 });
    }
}
