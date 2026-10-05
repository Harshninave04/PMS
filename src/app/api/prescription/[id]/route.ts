import { NextRequest, NextResponse } from "next/server";
import PrescriptionController from "@/controllers/prescription.controller";
import { requirePermission } from "@/lib/rbac/guard";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Params): Promise<NextResponse> {
    const denied = await requirePermission(request, "clinical.prescriptions:view");
    if (denied) return denied;

    try {
        const { id } = await params;
        return PrescriptionController.getPrescriptionById(id, request);
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Failed to fetch prescription";
        return NextResponse.json({
            success: false,
            message
        }, { status: 500 });
    }
}

export async function PUT(request: NextRequest, { params }: Params): Promise<NextResponse> {
    const denied = await requirePermission(request, "clinical.prescriptions:update");
    if (denied) return denied;

    try {
        const { id } = await params;
        return PrescriptionController.updatePrescription(request, id);
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Failed to update prescription";
        return NextResponse.json({
            success: false,
            message
        }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest, { params }: Params): Promise<NextResponse> {
    const denied = await requirePermission(request, "clinical.prescriptions:delete");
    if (denied) return denied;

    try {
        const { id } = await params;
        return PrescriptionController.deletePrescription(id, request);
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Failed to delete prescription";
        return NextResponse.json({
            success: false,
            message
        }, { status: 500 });
    }
}

