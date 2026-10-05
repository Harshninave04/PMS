import { NextRequest, NextResponse } from "next/server";
import AdmissionController from "@/controllers/admission.controller";
import { requirePermission } from "@/lib/rbac/guard";

export async function POST(request: NextRequest): Promise<NextResponse> {
    const denied = await requirePermission(request, "admissions.new:create");
    if (denied) return denied;

    try {
        return AdmissionController.createAdmission(request);
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Failed to create admission";
        return NextResponse.json({
            success: false,
            message
        }, { status: 500 });
    }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
    const denied = await requirePermission(request, "admissions.current:view");
    if (denied) return denied;

    try {
        return AdmissionController.getAdmissions(request);
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Failed to fetch admissions";
        return NextResponse.json({
            success: false,
            message
        }, { status: 500 });
    }
}
