import { NextRequest, NextResponse } from "next/server";
import AdmissionController from "@/controllers/admission.controller";
import { requirePermission } from "@/lib/rbac/guard";

export async function GET(request: NextRequest): Promise<NextResponse> {
    const denied = await requirePermission(request, "billing.invoices:view");
    if (denied) return denied;

    try {
        return await AdmissionController.getBillingQueue(request);
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Failed to load the billing queue";
        return NextResponse.json({
            success: false,
            message
        }, { status: 500 });
    }
}
