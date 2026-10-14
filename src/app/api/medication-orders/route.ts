import { NextRequest } from "next/server";
import medicationOrderController from "@/controllers/medication-order.controller";
import { requireAnyPermission } from "@/lib/rbac/guard";

export async function GET(request: NextRequest) {
    const denied = await requireAnyPermission(request, [
        "clinical.rounds:view",
        "clinical.prescriptions:view",
        "nursing.medications:view",
        "dashboard.main:view",
    ]);
    if (denied) return denied;

    return medicationOrderController.listOrders(request);
}

export async function POST(request: NextRequest) {
    const denied = await requireAnyPermission(request, [
        "clinical.rounds:create",
        "clinical.prescriptions:prescribe",
    ]);
    if (denied) return denied;

    return medicationOrderController.createOrder(request);
}
