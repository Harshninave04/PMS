import { NextRequest, NextResponse } from "next/server";
import RoleController from "@/controllers/role.controller";
import { requirePermission } from "@/lib/rbac/guard";

/**
 * GET /api/role/admin — every role with its permission summary and user count.
 *
 * Separate from `GET /api/role`, which stays open to any authenticated user so
 * the role dropdowns on the user screens keep working. This one exposes what
 * each role can actually reach, so it requires `admin.roles:view`.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
    try {
        return await RoleController.getRolesForManagement(request);
    } catch (e: unknown) {
        const err = e as { message?: string };
        return NextResponse.json(
            { success: false, message: err?.message || "Failed to fetch roles" },
            { status: 500 }
        );
    }
}