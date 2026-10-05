import { NextRequest, NextResponse } from "next/server";
import { AppointmentController } from "@/controllers/appointment.controller";
import { requirePermission } from "@/lib/rbac/guard";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: Params): Promise<NextResponse> {
    const denied = await requirePermission(request, "opd.list:view");
    if (denied) return denied;

    try {
        return AppointmentController.getById(request, { params: await context.params });
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Failed to fetch appointment";
        return NextResponse.json({
            success: false,
            message
        }, { status: 500 });
    }
}

export async function PUT(request: NextRequest, context: Params): Promise<NextResponse> {
    const denied = await requirePermission(request, "opd.list:update");
    if (denied) return denied;

    try {
        return AppointmentController.update(request, { params: await context.params });
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Failed to update appointment";
        return NextResponse.json({
            success: false,
            message
        }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest, context: Params): Promise<NextResponse> {
    const denied = await requirePermission(request, "opd.list:delete");
    if (denied) return denied;

    try {
        return AppointmentController.delete(request, { params: await context.params });
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Failed to delete appointment";
        return NextResponse.json({
            success: false,
            message
        }, { status: 500 });
    }
}
