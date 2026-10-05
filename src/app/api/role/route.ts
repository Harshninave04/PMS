import { NextRequest, NextResponse } from "next/server";
import RoleController from "@/controllers/role.controller";

/**
 * GET /api/role        — the bare role list. Any authenticated, active account may
 *                        read it because the user forms need to populate a role
 *                        picker; it exposes names and user counts, not permissions.
 * GET /api/role/admin  — the full roles table with permission summaries.
 *                        Requires `admin.roles:view`.
 * POST /api/role       — create a custom role. Requires `admin.roles:update`.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
    try {
        return await RoleController.getRoles(request);
    } catch (e: unknown) {
        const err = e as { message?: string };
        return NextResponse.json(
            { success: false, message: err?.message || "Failed to fetch roles" },
            { status: 500 }
        );
    }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
    try {
        return await RoleController.createRole(request);
    } catch (e: unknown) {
        const err = e as { message?: string };
        return NextResponse.json(
            { success: false, message: err?.message || "Failed to create role" },
            { status: 500 }
        );
    }
}