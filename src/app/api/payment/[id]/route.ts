import { NextRequest, NextResponse } from "next/server";
import PaymentController from "@/controllers/payment.controller";
import { requirePermission } from "@/lib/rbac/guard";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
    const denied = await requirePermission(request, "billing.payments:view");
    if (denied) return denied;

    try {
        const { id } = await params;
        return await PaymentController.getPaymentById(id, request);
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Failed to fetch payment";
        return NextResponse.json({
            success: false,
            message
        }, { status: 500 });
    }
}
