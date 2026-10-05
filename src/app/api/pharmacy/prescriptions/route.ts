import { NextRequest } from "next/server";
import prescriptionController from "@/controllers/prescription.controller";
import { requirePermission } from "@/lib/rbac/guard";

export async function GET(request: NextRequest) {
    const denied = await requirePermission(request, "pharmacy.prescriptions:view");
    if (denied) return denied;

    return prescriptionController.getPrescriptions(request);
}

export async function POST(request: NextRequest) {
    const denied = await requirePermission(request, "pharmacy.dispensing:dispense");
    if (denied) return denied;

    return prescriptionController.createPrescription(request);
}
