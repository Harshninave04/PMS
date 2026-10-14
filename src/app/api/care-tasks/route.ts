import { NextRequest } from "next/server";
import careTaskController from "@/controllers/care-task.controller";
import { requireAnyPermission } from "@/lib/rbac/guard";

export async function GET(request: NextRequest) {
    const denied = await requireAnyPermission(request, [
        "nursing.medications:view",
        "nursing.patients:view",
        "nursing.notes:view",
        "opd.queue:view",
        "clinical.consultations:view",
        "dashboard.main:view",
    ]);
    if (denied) return denied;

    return careTaskController.listTasks(request);
}

export async function POST(request: NextRequest) {
    const denied = await requireAnyPermission(request, [
        "nursing.medications:create",
        "nursing.notes:create",
        "opd.queue:update",
        "clinical.consultations:create",
    ]);
    if (denied) return denied;

    return careTaskController.createTask(request);
}
