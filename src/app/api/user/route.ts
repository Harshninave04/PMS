import { NextRequest, NextResponse } from "next/server";
import UserController from "@/controllers/user.controller";
import { requirePermission } from "@/lib/rbac/guard";

/**
 * @route POST /api/user
 * @desc Create a new user
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
    const denied = await requirePermission(request, "admin.users:create");
    if (denied) return denied;

    try {
        return UserController.createUser(request);
    } catch (e: any) {
        return NextResponse.json({
            success: false,
            message: e?.message || "Failed to create user"
        }, { status: 500 });
    }
}

/**
 * @route GET /api/user
 * @desc Get all users (supports ?organizationId=...)
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
    const denied = await requirePermission(request, "admin.users:view");
    if (denied) return denied;

    try {
        return UserController.getUsers(request);
    } catch (e: any) {
        return NextResponse.json({
            success: false,
            message: e?.message || "Failed to fetch users"
        }, { status: 500 });
    }
}
