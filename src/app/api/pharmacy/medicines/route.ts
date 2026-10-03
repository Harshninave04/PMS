import { NextResponse } from "next/server";
import { MedicineController } from "@/controllers/medicine.controller";
import dbConnect from "@/lib/dbConnect";
import { requirePermission } from "@/lib/rbac/guard";

export async function GET(request: Request) {
    const denied = await requirePermission(request, "pharmacy.medicines:view");
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
