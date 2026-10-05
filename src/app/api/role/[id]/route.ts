import { NextRequest, NextResponse } from "next/server";
import RoleController from "@/controllers/role.controller";

type Params = { params: Promise<{ id: string }> };

/** GET /api/role/:id — a role with its full permission list. */
export async function GET(request: NextRequest, { params }: Params): Promise<NextResponse> {
    try {
        const { id } = await params;
        return await RoleController.getRoleById(request, id);
    } catch (e: unknown) {
        const err = e as { message?: string };
        return NextResponse.json(
            { success: false, message: err?.message || "Failed to fetch role" },
            { status: 500 }
        );
    }
}

/** PUT /api/role/:id — replace a role's permissions. Requires `admin.roles:update`. */
export async function PUT(request: NextRequest, { params }: Params): Promise<NextResponse> {
    try {
        const { id } = await params;
        return await RoleController.updateRole(request, id);
    } catch (e: unknown) {
        const err = e as { message?: string };
        return NextResponse.json(
            { success: false, message: err?.message || "Failed to update role" },
            { status: 500 }
        );
    }
}

/** DELETE /api/role/:id — custom roles only, and only while nobody holds them. */
export async function DELETE(request: NextRequest, { params }: Params): Promise<NextResponse> {
    try {
        const { id } = await params;
        return await RoleController.deleteRole(request, id);
    } catch (e: unknown) {
        const err = e as { message?: string };
        return NextResponse.json(
            { success: false, message: err?.message || "Failed to delete role" },
            { status: 500 }
        );
    }
}