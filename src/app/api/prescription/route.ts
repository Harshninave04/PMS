import { NextRequest, NextResponse } from "next/server";
import PrescriptionController from "@/controllers/prescription.controller";
import { requirePermission } from "@/lib/rbac/guard";

export async function POST(request: NextRequest): Promise<NextResponse> {
    const denied = await requirePermission(request, "clinical.prescriptions:prescribe");
    if (denied) return denied;

    try {
        return PrescriptionController.createPrescription(request);
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Failed to create prescription";
        return NextResponse.json({
            success: false,
            message
        }, { status: 500 });
    }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
    const denied = await requirePermission(request, "clinical.prescriptions:view");
    if (denied) return denied;

    try {
        return PrescriptionController.getPrescriptions(request);
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Failed to fetch prescriptions";
        return NextResponse.json({
            success: false,
            message
        }, { status: 500 });
    }
}
