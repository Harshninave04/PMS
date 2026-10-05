import { NextRequest } from "next/server";
import { AppointmentController } from "@/controllers/appointment.controller";
import { requirePermission } from "@/lib/rbac/guard";

export async function GET(request: NextRequest) {
    const denied = await requirePermission(request, "opd.list:view");
    if (denied) return denied;

    return AppointmentController.getAll(request);
}

export async function POST(request: NextRequest) {
    const denied = await requirePermission(request, "opd.book:create");
    if (denied) return denied;

    return AppointmentController.create(request);
}
