import { NextRequest, NextResponse } from "next/server";
import RoomController from "@/controllers/room.controller";

/**
 * @route POST /api/room
 * @desc Create a new room
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
    try {
        return await RoomController.createRoom(request);
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Failed to create room";
        return NextResponse.json({
            success: false,
            message
        }, { status: 500 });
    }
}

/**
 * @route GET /api/room
 * @desc Get all rooms (supports ?wardId=...)
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
    try {
        return await RoomController.getRooms(request);
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Failed to fetch rooms";
        return NextResponse.json({
            success: false,
            message
        }, { status: 500 });
    }
}
