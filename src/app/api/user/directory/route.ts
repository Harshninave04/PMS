import { NextRequest, NextResponse } from "next/server";
import UserController from "@/controllers/user.controller";
import { requirePermission } from "@/lib/rbac/guard";

/**
 * @route GET /api/user/directory
 * @desc Active staff within the caller's scope, for dropdown pickers
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
    const denied = await requirePermission(request, null);
    if (denied) return denied;

    try {
        return UserController.getUserDirectory(request);
    } catch (e: unknown) {
        return NextResponse.json({
            success: false,
            message: e instanceof Error ? e.message : "Failed to fetch user directory"
        }, { status: 500 });
    }
}
