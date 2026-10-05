import { NextRequest, NextResponse } from "next/server";
import PatientController from "@/controllers/patient.controller";
import { requirePermission } from "@/lib/rbac/guard";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Params): Promise<NextResponse> {
    const denied = await requirePermission(request, "patients.profile:view");
    if (denied) return denied;

    try {
        const { id } = await params;
        return PatientController.getPatientById(id, request);
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Failed to fetch patient";
        return NextResponse.json({
            success: false,
            message
        }, { status: 500 });
    }
}

export async function PUT(request: NextRequest, { params }: Params): Promise<NextResponse> {
    const denied = await requirePermission(request, "patients.profile:update");
    if (denied) return denied;

    try {
        const { id } = await params;
        return PatientController.updatePatient(request, id);
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Failed to update patient";
        return NextResponse.json({
            success: false,
            message
        }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest, { params }: Params): Promise<NextResponse> {
    const denied = await requirePermission(request, "patients.profile:delete");
    if (denied) return denied;

    try {
        const { id } = await params;
        return PatientController.deletePatient(id, request);
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Failed to delete patient";
        return NextResponse.json({
            success: false,
            message
        }, { status: 500 });
    }
}

