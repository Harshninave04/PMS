import { NextRequest } from "next/server";
import visitController from "@/controllers/visit.controller";
import { requireAnyPermission } from "@/lib/rbac/guard";

export async function GET(request: NextRequest) {
    const denied = await requireAnyPermission(request, [
        "clinical.rounds:view",
        "clinical.consultations:view",
        "nursing.notes:view",
        "dashboard.main:view",
    ]);
    if (denied) return denied;

    return visitController.listVisits(request);
}

export async function POST(request: NextRequest) {
    const denied = await requireAnyPermission(request, [
        "clinical.rounds:create",
        "clinical.consultations:create",
    ]);
    if (denied) return denied;

    return visitController.createVisit(request);
}
