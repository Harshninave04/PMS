import { NextRequest, NextResponse } from "next/server";
import AdmissionController from "@/controllers/admission.controller";
import { requirePermission } from "@/lib/rbac/guard";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Params): Promise<NextResponse> {
    const denied = await requirePermission(request, "admissions.current:view");
    if (denied) return denied;

    try {
        const { id } = await params;
        return AdmissionController.getAdmissionById(id, request);
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Failed to fetch admission";
        return NextResponse.json({
            success: false,
            message
        }, { status: 500 });
    }
}

export async function PUT(request: NextRequest, { params }: Params): Promise<NextResponse> {
    const denied = await requirePermission(request, "admissions.current:update");
    if (denied) return denied;

    try {
        const { id } = await params;
        return AdmissionController.updateAdmission(request, id);
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Failed to update admission";
        return NextResponse.json({
            success: false,
            message
        }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest, { params }: Params): Promise<NextResponse> {
    const denied = await requirePermission(request, "admissions.current:delete");
    if (denied) return denied;

    try {
        const { id } = await params;
        return AdmissionController.deleteAdmission(id, request);
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Failed to delete admission";
        return NextResponse.json({
            success: false,
            message
        }, { status: 500 });
    }
}

