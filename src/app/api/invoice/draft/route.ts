import { NextRequest, NextResponse } from "next/server";
import InvoiceController from "@/controllers/invoice.controller";
import { requirePermission } from "@/lib/rbac/guard";

export async function GET(request: NextRequest): Promise<NextResponse> {
    const denied = await requirePermission(request, "billing.invoices:view");
    if (denied) return denied;

    try {
        return await InvoiceController.getAdmissionDraft(request);
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Failed to build the billing draft";
        return NextResponse.json({
            success: false,
            message
        }, { status: 500 });
    }
}
