import { NextRequest, NextResponse } from "next/server";
import careTaskController from "@/controllers/care-task.controller";
import { requireAnyPermission } from "@/lib/rbac/guard";

type Params = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, { params }: Params): Promise<NextResponse> {
    const denied = await requireAnyPermission(request, [
        "nursing.medications:update",
        "nursing.notes:update",
        "opd.queue:update",
        "clinical.consultations:update",
    ]);
    if (denied) return denied;

    try {
        const { id } = await params;
        return careTaskController.updateTask(request, id);
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Failed to update instruction";
        return NextResponse.json(
            {
                success: false,
                message,
            },
            { status: 500 }
        );
    }
}
