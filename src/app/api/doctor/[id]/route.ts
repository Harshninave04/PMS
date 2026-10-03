import { NextRequest, NextResponse } from "next/server";
import DoctorController from "@/controllers/doctor.controller";
import { requirePermission } from "@/lib/rbac/guard";

type Params = { params: Promise<{ id: string }> };

/**
 * @route GET /api/doctor/:id
 * @desc Get a doctor by ID
 */
export async function GET(request: NextRequest, { params }: Params): Promise<NextResponse> {
    const denied = await requirePermission(request, "admin.doctors:view");
    if (denied) return denied;

    try {
        const { id } = await params;
        return DoctorController.getDoctorById(id, request);
    } catch (e: unknown) {
        const err = e as { message?: string };
        return NextResponse.json({
            success: false,
            message: err?.message || "Failed to fetch doctor"
        }, { status: 500 });
    }
}

/**
 * @route PUT /api/doctor/:id
 * @desc Update a doctor by ID
 */
export async function PUT(request: NextRequest, { params }: Params): Promise<NextResponse> {
    const denied = await requirePermission(request, "admin.doctors:update");
    if (denied) return denied;

    try {
        const { id } = await params;
        return DoctorController.updateDoctor(request, id);
    } catch (e: unknown) {
        const err = e as { message?: string };
        return NextResponse.json({
            success: false,
            message: err?.message || "Failed to update doctor"
        }, { status: 500 });
    }
}

/**
 * @route DELETE /api/doctor/:id
 * @desc Delete a doctor by ID
 */
export async function DELETE(request: NextRequest, { params }: Params): Promise<NextResponse> {
    const denied = await requirePermission(request, "admin.doctors:delete");
    if (denied) return denied;

    try {
        const { id } = await params;
        return DoctorController.deleteDoctor(id, request);
    } catch (e: unknown) {
        const err = e as { message?: string };
        return NextResponse.json({
            success: false,
            message: err?.message || "Failed to delete doctor"
        }, { status: 500 });
    }
}
