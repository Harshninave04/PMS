import { NextRequest, NextResponse } from "next/server";
import RoomController from "@/controllers/room.controller";
import { requirePermission } from "@/lib/rbac/guard";

type Params = { params: Promise<{ id: string }> };

/**
 * @route GET /api/room/:id
 * @desc Get a room by ID
 */
export async function GET(request: NextRequest, { params }: Params): Promise<NextResponse> {
    const denied = await requirePermission(request, "wards.rooms:view");
    if (denied) return denied;

    try {
        const { id } = await params;
        return await RoomController.getRoomById(id, request);
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Failed to fetch room";
        return NextResponse.json({
            success: false,
            message
        }, { status: 500 });
    }
}

/**
 * @route PUT /api/room/:id
 * @desc Update a room by ID
 */
export async function PUT(request: NextRequest, { params }: Params): Promise<NextResponse> {
    const denied = await requirePermission(request, "wards.rooms:update");
    if (denied) return denied;

    try {
        const { id } = await params;
        return await RoomController.updateRoom(request, id);
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Failed to update room";
        return NextResponse.json({
            success: false,
            message
        }, { status: 500 });
    }
}

/**
 * @route DELETE /api/room/:id
 * @desc Delete a room by ID
 */
export async function DELETE(request: NextRequest, { params }: Params): Promise<NextResponse> {
    const denied = await requirePermission(request, "wards.rooms:delete");
    if (denied) return denied;

    try {
        const { id } = await params;
        return await RoomController.deleteRoom(id, request);
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Failed to delete room";
        return NextResponse.json({
            success: false,
            message
        }, { status: 500 });
    }
}
