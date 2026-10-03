import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac/guard";
import { buildPermissionCatalogue } from "@/lib/rbac/permissions.config";

/**
 * GET /api/permissions — the whole permission catalogue, grouped
 * `module > sub-item > actions`.
 *
 * Derived from the sidebar, so it is always exactly what the matrix can render
 * and exactly what the guard checks. Requires `admin.roles:view`.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
    try {
        const denied = await requirePermission(request, "admin.roles:view");
        if (denied) return denied;

        return NextResponse.json(
            { success: true, data: buildPermissionCatalogue() },
            { status: 200 }
        );
    } catch (e: unknown) {
        const err = e as { message?: string };
        return NextResponse.json(
            { success: false, message: err?.message || "Failed to fetch permissions" },
            { status: 500 }
        );
    }
}