import { NextRequest, NextResponse } from "next/server";
import AdmissionController from "@/controllers/admission.controller";
import { requirePermission } from "@/lib/rbac/guard";

export async function POST(request: NextRequest): Promise<NextResponse> {
    const denied = await requirePermission(request, "clinical.rounds:update");
    if (denied) return denied;

    try {
        return await AdmissionController.requestDischarge(request);
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Failed to request discharge";
        return NextResponse.json({
            success: false,
            message
        }, { status: 500 });
    }
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
    const denied = await requirePermission(request, "clinical.rounds:update");
    if (denied) return denied;

    try {
        return await AdmissionController.withdrawDischargeRequest(request);
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Failed to withdraw the discharge request";
        return NextResponse.json({
            success: false,
            message
        }, { status: 500 });
    }
}
