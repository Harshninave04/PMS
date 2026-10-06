import { NextRequest, NextResponse } from "next/server";
import PatientController from "@/controllers/patient.controller";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Params): Promise<NextResponse> {
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
    try {
        const { id } = await params;
        return PatientController.deletePatient(id, request);
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Failed to archive patient";
        return NextResponse.json({
            success: false,
            message
        }, { status: 500 });
    }
}

/** Restores a soft-deleted patient record. */
export async function PATCH(request: NextRequest, { params }: Params): Promise<NextResponse> {
    try {
        const { id } = await params;
        return PatientController.restorePatient(id, request);
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Failed to restore patient";
        return NextResponse.json({
            success: false,
            message
        }, { status: 500 });
    }
}

