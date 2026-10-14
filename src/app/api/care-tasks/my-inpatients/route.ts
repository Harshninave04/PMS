import { NextRequest } from "next/server";
import careTaskController from "@/controllers/care-task.controller";
import { requireAnyPermission } from "@/lib/rbac/guard";

export async function GET(request: NextRequest) {
    const denied = await requireAnyPermission(request, [
        "nursing.patients:view",
        "opd.queue:view",
        "dashboard.main:view",
    ]);
    if (denied) return denied;

    return careTaskController.myInpatients(request);
}
