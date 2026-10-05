import { NextRequest, NextResponse } from "next/server";
import InvoiceController from "@/controllers/invoice.controller";
import { requirePermission } from "@/lib/rbac/guard";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Params): Promise<NextResponse> {
    const denied = await requirePermission(request, "billing.invoices:view");
    if (denied) return denied;

    try {
        const { id } = await params;
        return await InvoiceController.getInvoiceById(id, request);
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Failed to fetch invoice";
        return NextResponse.json({
            success: false,
            message
        }, { status: 500 });
    }
}

export async function PUT(request: NextRequest, { params }: Params): Promise<NextResponse> {
    const denied = await requirePermission(request, "billing.invoices:update");
    if (denied) return denied;

    try {
        const { id } = await params;
        return await InvoiceController.updateInvoice(request, id);
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Failed to update invoice";
        return NextResponse.json({
            success: false,
            message
        }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest, { params }: Params): Promise<NextResponse> {
    const denied = await requirePermission(request, "billing.invoices:delete");
    if (denied) return denied;

    try {
        const { id } = await params;
        return await InvoiceController.deleteInvoice(id, request);
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Failed to delete invoice";
        return NextResponse.json({
            success: false,
            message
        }, { status: 500 });
    }
}
