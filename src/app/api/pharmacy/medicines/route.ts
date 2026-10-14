import { NextResponse } from "next/server";
import { MedicineController } from "@/controllers/medicine.controller";
import dbConnect from "@/lib/dbConnect";
import { requireAnyPermission, requirePermission } from "@/lib/rbac/guard";

export async function GET(request: Request) {
    // Doctors search live stock while prescribing on rounds; the controller
    // still enforces its data-layer permission.
    const denied = await requireAnyPermission(request, [
        "pharmacy.medicines:view",
        "clinical.rounds:view",
    ]);
    if (denied) return denied;

    await dbConnect();
    return MedicineController.getAll(request);
}

export async function POST(request: Request) {
    const denied = await requirePermission(request, "pharmacy.medicines:create");
    if (denied) return denied;

    await dbConnect();
    return MedicineController.create(request);
}
