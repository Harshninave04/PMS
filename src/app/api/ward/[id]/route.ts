import { NextRequest, NextResponse } from "next/server";
import WardController from "@/controllers/ward.controller";
import { requirePermission } from "@/lib/rbac/guard";

type Params = { params: Promise<{ id: string }> };

/**
 * @route GET /api/ward/:id
 * @desc Get a ward by ID
 */
export async function GET(request: NextRequest, { params }: Params): Promise<NextResponse> {
    const denied = await requirePermission(request, "wards.list:view");
    if (denied) return denied;

    try {
        const { id } = await params;
        return WardController.getWardById(id, request);
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Failed to fetch ward";
        return NextResponse.json({
            success: false,
            message
        }, { status: 500 });
    }
}

/**
 * @route PUT /api/ward/:id
 * @desc Update a ward by ID
 */
export async function PUT(request: NextRequest, { params }: Params): Promise<NextResponse> {
    const denied = await requirePermission(request, "wards.list:update");
    if (denied) return denied;

    try {
        const { id } = await params;
        return WardController.updateWard(request, id);
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Failed to update ward";
        return NextResponse.json({
            success: false,
            message
        }, { status: 500 });
    }
}

/**
 * @route DELETE /api/ward/:id
 * @desc Delete a ward by ID
 */
export async function DELETE(request: NextRequest, { params }: Params): Promise<NextResponse> {
    const denied = await requirePermission(request, "wards.list:delete");
    if (denied) return denied;

    try {
        const { id } = await params;
        return WardController.deleteWard(id, request);
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Failed to delete ward";
        return NextResponse.json({
            success: false,
            message
        }, { status: 500 });
    }
}
