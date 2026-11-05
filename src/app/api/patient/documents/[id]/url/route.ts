import { NextRequest, NextResponse } from "next/server";
import PatientController from "@/controllers/patient.controller";
import { requirePermission } from "@/lib/rbac/guard";

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
    const denied = await requirePermission(request, "patients.documents:view");
    if (denied) return denied;

    try {
        const { id } = await params;
        return PatientController.getDocumentSignedUrl(request, id);
    } catch (error: unknown) {
        return NextResponse.json({
            success: false,
            message: error instanceof Error ? error.message : "Failed to create the document link"
        }, { status: 500 });
    }
}
