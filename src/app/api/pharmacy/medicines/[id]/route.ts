import { NextResponse } from "next/server";
import { MedicineController } from "@/controllers/medicine.controller";
import dbConnect from "@/lib/dbConnect";
import { requirePermission } from "@/lib/rbac/guard";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const denied = await requirePermission(request, "pharmacy.medicines:view");
    if (denied) return denied;

    await dbConnect();
    const { id } = await params;
    return MedicineController.getById(request, { params: { id } });
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const denied = await requirePermission(request, "pharmacy.medicines:update");
    if (denied) return denied;

    await dbConnect();
    const { id } = await params;
    return MedicineController.update(request, { params: { id } });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const denied = await requirePermission(request, "pharmacy.medicines:delete");
    if (denied) return denied;

    await dbConnect();
    const { id } = await params;
    return MedicineController.delete(request, { params: { id } });
}
