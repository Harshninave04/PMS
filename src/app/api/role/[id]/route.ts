import { NextRequest, NextResponse } from "next/server";
import RoleController from "@/controllers/role.controller";

type Params = { params: Promise<{ id: string }> };

/**
 * @route GET /api/role/:id
 * @desc Get a role by ID
 */
export async function GET(request: NextRequest, { params }: Params): Promise<NextResponse> {
    try {
        const { id } = await params;
        return RoleController.getRoleById(request, id);
    } catch (e: unknown) {
        const err = e as { message?: string };
        return NextResponse.json({
            success: false,
            message: err?.message || "Failed to fetch role"
        }, { status: 500 });
    }
}

/**
 * @route PUT /api/role/:id
 * @desc Update a role by ID
 */
export async function PUT(request: NextRequest, { params }: Params): Promise<NextResponse> {
    try {
        const { id } = await params;
        return RoleController.updateRole(request, id);
    } catch (e: unknown) {
        const err = e as { message?: string };
        return NextResponse.json({
            success: false,
            message: err?.message || "Failed to update role"
        }, { status: 500 });
    }
}

/**
 * @route POST /api/role/:id/reset
 * @desc Hand the role back to the code defaults
 */
export async function POST(request: NextRequest, { params }: Params): Promise<NextResponse> {
    try {
        const { id } = await params;
        return RoleController.resetRole(request, id);
    } catch (e: unknown) {
        const err = e as { message?: string };
        return NextResponse.json({
            success: false,
            message: err?.message || "Failed to reset role"
        }, { status: 500 });
    }
}