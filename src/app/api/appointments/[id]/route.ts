import { NextRequest } from "next/server";
import { AppointmentController } from "@/controllers/appointment.controller";
import { requirePermission } from "@/lib/rbac/guard";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const denied = await requirePermission(request, "opd.list:view");
    if (denied) return denied;

    const { id } = await params;
    return AppointmentController.getById(request, { params: { id } });
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const denied = await requirePermission(request, "opd.list:update");
    if (denied) return denied;

    const { id } = await params;
    return AppointmentController.update(request, { params: { id } });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const denied = await requirePermission(request, "opd.list:delete");
    if (denied) return denied;

    const { id } = await params;
    return AppointmentController.delete(request, { params: { id } });
}
