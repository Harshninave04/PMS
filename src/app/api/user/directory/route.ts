import { NextRequest, NextResponse } from "next/server";
import UserController from "@/controllers/user.controller";

/**
 * @route GET /api/user/directory
 * @desc Active staff within the caller's scope, for dropdown pickers
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
    try {
        return UserController.getUserDirectory(request);
    } catch (e: unknown) {
        return NextResponse.json({
            success: false,
            message: e instanceof Error ? e.message : "Failed to fetch user directory"
        }, { status: 500 });
    }
}
