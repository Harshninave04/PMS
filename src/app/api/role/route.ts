import { NextRequest, NextResponse } from "next/server";
import RoleController from "@/controllers/role.controller";

/**
 * @route GET /api/role
 * @desc Get all roles
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
    try {
        return RoleController.getRoles(request);
    } catch (e: any) {
        return NextResponse.json({
            success: false,
            message: e?.message || "Failed to fetch roles"
        }, { status: 500 });
    }
}
