import { NextRequest } from "next/server";
import prescriptionController from "@/controllers/prescription.controller";
import { requirePermission } from "@/lib/rbac/guard";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const denied = await requirePermission(request, "pharmacy.prescriptions:view");
    if (denied) return denied;

    const { id } = await params;
    return prescriptionController.getPrescriptionById(id, request);
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const denied = await requirePermission(request, "pharmacy.dispensing:dispense");
    if (denied) return denied;

    const { id } = await params;
    return prescriptionController.updatePrescription(request, id);
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const denied = await requirePermission(request, "pharmacy.prescriptions:delete");
    if (denied) return denied;

    const { id } = await params;
    return prescriptionController.deletePrescription(id, request);
}

