import { NextRequest, NextResponse } from "next/server";
import PatientController from "@/controllers/patient.controller";
import { requirePermission } from "@/lib/rbac/guard";

export async function POST(request: NextRequest): Promise<NextResponse> {
    const denied = await requirePermission(request, "patients.documents:upload");
    if (denied) return denied;

    try {
        return PatientController.addDocument(request);
    } catch (e: any) {
        return NextResponse.json({
            success: false,
            message: e?.message || "Failed to add document"
        }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
    const denied = await requirePermission(request, "patients.documents:delete");
    if (denied) return denied;

    try {
        return PatientController.deleteDocument(request);
    } catch (e: any) {
        return NextResponse.json({
            success: false,
            message: e?.message || "Failed to delete document"
        }, { status: 500 });
    }
}
