import { NextRequest, NextResponse } from "next/server";
import WardController from "@/controllers/ward.controller";
import { requirePermission } from "@/lib/rbac/guard";

/**
 * @route POST /api/ward
 * @desc Create a new ward
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
    const denied = await requirePermission(request, "wards.list:create");
    if (denied) return denied;

    try {
        return WardController.createWard(request);
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Failed to create ward";
        return NextResponse.json({
            success: false,
            message
        }, { status: 500 });
    }
}

/**
 * @route GET /api/ward
 * @desc Get all wards (supports ?organizationId=...)
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
    const denied = await requirePermission(request, null);
    if (denied) return denied;

    try {
        return WardController.getWards(request);
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Failed to fetch wards";
        return NextResponse.json({
            success: false,
            message
        }, { status: 500 });
    }
}
