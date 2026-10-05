import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/dbConnect";
import { MedicineService } from "@/services/medicine.service";
import PharmacyController from "@/controllers/pharmacy.controller";
import { authorizeRequest, requirePermission } from "@/lib/rbac/guard";
import { PERMISSION_KEYS } from "@/types/rbac";

export async function GET(request: NextRequest) {
    const denied = await requirePermission(request, "pharmacy.stock:view");
    if (denied) return denied;

    await dbConnect();
    const auth = await authorizeRequest(request, PERMISSION_KEYS.PHARMACY_STOCK_VIEW, "Medicine");
    if (!auth.isAuthorized) return auth.response;

    try {
        const medicines = await MedicineService.getAll();
        return NextResponse.json({ success: true, data: medicines }, { status: 200 });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Failed to fetch stock";
        return NextResponse.json({ success: false, message }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    const denied = await requirePermission(request, "pharmacy.stock:update");
    if (denied) return denied;

    await dbConnect();
    return PharmacyController.adjustStock(request);
}
