import { NextRequest, NextResponse } from "next/server";
import AdmissionController from "@/controllers/admission.controller";
import { requirePermission } from "@/lib/rbac/guard";

type Params = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, { params }: Params): Promise<NextResponse> {
    const denied = await requirePermission(request, "admissions.current:update");
    if (denied) return denied;

    try {
        const { id } = await params;
        return AdmissionController.assignCareTeam(request, id);
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Failed to update care team";
        return NextResponse.json(
            {
                success: false,
                message,
            },
            { status: 500 }
        );
    }
}
