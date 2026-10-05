import { NextRequest, NextResponse } from "next/server";
import UserController from "@/controllers/user.controller";
import { requirePermission } from "@/lib/rbac/guard";

type Params = { params: Promise<{ id: string }> };

/**
 * @route GET /api/user/:id
 * @desc Get a user by ID
 */
export async function GET(request: NextRequest, { params }: Params): Promise<NextResponse> {
    const denied = await requirePermission(request, "admin.users:view");
    if (denied) return denied;

    try {
        const { id } = await params;
        return UserController.getUserById(id, request);
    } catch (e: any) {
        return NextResponse.json({
            success: false,
            message: e?.message || "Failed to fetch user"
        }, { status: 500 });
    }
}

/**
 * @route PUT /api/user/:id
 * @desc Update a user by ID
 */
export async function PUT(request: NextRequest, { params }: Params): Promise<NextResponse> {
    const denied = await requirePermission(request, "admin.users:update");
    if (denied) return denied;

    try {
        const { id } = await params;
        return UserController.updateUser(request, id);
    } catch (e: any) {
        return NextResponse.json({
            success: false,
            message: e?.message || "Failed to update user"
        }, { status: 500 });
    }
}

/**
 * @route DELETE /api/user/:id
 * @desc Delete a user by ID
 */
export async function DELETE(request: NextRequest, { params }: Params): Promise<NextResponse> {
    const denied = await requirePermission(request, "admin.users:delete");
    if (denied) return denied;

    try {
        const { id } = await params;
        return UserController.deleteUser(id, request);
    } catch (e: unknown) {
        const err = e as { message?: string };
        return NextResponse.json({
            success: false,
            message: err?.message || "Failed to delete user"
        }, { status: 500 });
    }
}
