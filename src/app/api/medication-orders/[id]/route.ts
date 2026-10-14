import { NextRequest, NextResponse } from "next/server";
import medicationOrderController from "@/controllers/medication-order.controller";
import { requireAnyPermission } from "@/lib/rbac/guard";

type Params = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, { params }: Params): Promise<NextResponse> {
    const denied = await requireAnyPermission(request, [
        "clinical.rounds:update",
        "clinical.prescriptions:update",
    ]);
    if (denied) return denied;

    try {
        const { id } = await params;
        return medicationOrderController.discontinueOrder(request, id);
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Failed to discontinue order";
        return NextResponse.json(
            {
                success: false,
                message,
            },
            { status: 500 }
        );
    }
}
