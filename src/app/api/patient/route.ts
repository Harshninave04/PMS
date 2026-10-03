import { NextRequest, NextResponse } from "next/server";
import PatientController from "@/controllers/patient.controller";
import { requirePermission } from "@/lib/rbac/guard";

export async function POST(request: NextRequest): Promise<NextResponse> {
    const denied = await requirePermission(request, "patients.register:create");
    if (denied) return denied;

    try {
        return PatientController.createPatient(request);
    } catch (e: any) {
        return NextResponse.json({
            success: false,
            message: e?.message || "Failed to create patient"
        }, { status: 500 });
    }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
    const denied = await requirePermission(request, "patients.list:view");
    if (denied) return denied;

    try {
        return PatientController.getPatients(request);
    } catch (e: any) {
        return NextResponse.json({
            success: false,
            message: e?.message || "Failed to fetch patients"
        }, { status: 500 });
    }
}
