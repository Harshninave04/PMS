import { NextRequest, NextResponse } from "next/server";
import DepartmentController from "@/controllers/department.controller";
import { requirePermission } from "@/lib/rbac/guard";

type Params = { params: Promise<{ id: string }> };

/**
 * @route GET /api/department/:id
 * @desc Get a department by ID
 */
export async function GET(request: NextRequest, { params }: Params): Promise<NextResponse> {
    const denied = await requirePermission(request, "admin.departments:view");
    if (denied) return denied;

    try {
        const { id } = await params;
        return DepartmentController.getDepartmentById(id, request);
    } catch (e: unknown) {
        const err = e as { message?: string };
        return NextResponse.json({
            success: false,
            message: err?.message || "Failed to fetch department"
        }, { status: 500 });
    }
}

/**
 * @route PUT /api/department/:id
 * @desc Update a department by ID
 */
export async function PUT(request: NextRequest, { params }: Params): Promise<NextResponse> {
    const denied = await requirePermission(request, "admin.departments:update");
    if (denied) return denied;

    try {
        const { id } = await params;
        return DepartmentController.updateDepartment(request, id);
    } catch (e: unknown) {
        const err = e as { message?: string };
        return NextResponse.json({
            success: false,
            message: err?.message || "Failed to update department"
        }, { status: 500 });
    }
}

/**
 * @route DELETE /api/department/:id
 * @desc Delete a department by ID
 */
export async function DELETE(request: NextRequest, { params }: Params): Promise<NextResponse> {
    const denied = await requirePermission(request, "admin.departments:delete");
    if (denied) return denied;

    try {
        const { id } = await params;
        return DepartmentController.deleteDepartment(id, request);
    } catch (e: unknown) {
        const err = e as { message?: string };
        return NextResponse.json({
            success: false,
            message: err?.message || "Failed to delete department"
        }, { status: 500 });
    }
}
