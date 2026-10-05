import { NextRequest, NextResponse } from "next/server";
import PatientController from "@/controllers/patient.controller";
import { requirePermission } from "@/lib/rbac/guard";

export async function GET(request: NextRequest): Promise<NextResponse> {
    const denied = await requirePermission(request, "patients.profile:view");
    if (denied) return denied;

    try {
        return PatientController.getStats(request);
    } catch (e: any) {
        return NextResponse.json({
            success: false,
            message: e?.message || "Failed to fetch patient reports"
        }, { status: 500 });
    }
}
