import { NextRequest } from "next/server";
import { PharmacyController } from "@/controllers/pharmacy.controller";
import { requirePermission } from "@/lib/rbac/guard";

export async function GET(request: NextRequest) {
    const denied = await requirePermission(request, "pharmacy.medicines:view");
    if (denied) return denied;

    return PharmacyController.getOrderSuggestions(request);
}
