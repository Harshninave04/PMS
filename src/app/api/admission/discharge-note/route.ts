import { NextRequest, NextResponse } from "next/server";
import AdmissionController from "@/controllers/admission.controller";
import { requirePermission } from "@/lib/rbac/guard";

export async function POST(request: NextRequest): Promise<NextResponse> {
    const denied = await requirePermission(request, "nursing.patients:update");
    if (denied) return denied;

    try {
        return await AdmissionController.addDischargeNote(request);
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Failed to add the discharge note";
        return NextResponse.json({
            success: false,
            message
        }, { status: 500 });
    }
}
