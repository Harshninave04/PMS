import { NextRequest, NextResponse } from "next/server";
import AdmissionController from "@/controllers/admission.controller";
import { requirePermission } from "@/lib/rbac/guard";

export async function GET(request: NextRequest): Promise<NextResponse> {
    const denied = await requirePermission(request, "admissions.current:view");
    if (denied) return denied;

    try {
        return await AdmissionController.getAdmissionStats(request);
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Failed to fetch admission statistics";
        return NextResponse.json({
            success: false,
            message
        }, { status: 500 });
    }
}

