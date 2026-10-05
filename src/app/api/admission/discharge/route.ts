import { NextRequest, NextResponse } from "next/server";
import AdmissionController from "@/controllers/admission.controller";
import { requirePermission } from "@/lib/rbac/guard";

export async function POST(request: NextRequest): Promise<NextResponse> {
    const denied = await requirePermission(request, "admissions.discharge:discharge");
    if (denied) return denied;

    try {
        return await AdmissionController.dischargePatient(request);
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Failed to discharge patient";
        return NextResponse.json({
            success: false,
            message
        }, { status: 500 });
    }
}

