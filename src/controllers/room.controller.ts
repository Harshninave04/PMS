import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import dbConnect from "@/lib/dbConnect";
import defaultRoomService, { RoomService } from "@/services/room.service";
import { CreateRoomDto, UpdateRoomDto } from "@/dto/room.dto";
import { authorizeRequest } from "@/lib/rbac/guard";
import { PERMISSION_KEYS } from "@/types/rbac";
import Ward from "@/models/ward.model";
import Room from "@/models/room.model";

export class RoomController {
    constructor(private roomService: RoomService = defaultRoomService) { }

    async createRoom(request: NextRequest): Promise<NextResponse> {
        try {
            await dbConnect();
            const auth = await authorizeRequest(request, PERMISSION_KEYS.WARD_MANAGE, "Room");
            if (!auth.isAuthorized) return auth.response;

            const raw = await request.json() as Partial<CreateRoomDto>;
            const data = {
                ...raw,
                roomNumber: typeof raw.roomNumber === "string" ? raw.roomNumber.trim() : "",
                roomType: typeof raw.roomType === "string" ? raw.roomType.trim().toUpperCase().replace(/[ -]+/g, "_") : "GENERAL",
            } as CreateRoomDto;

            if (!data.roomNumber || !data.wardId) {
                return NextResponse.json(
                    { success: false, message: "Fields 'roomNumber' and 'wardId' are required" },
                    { status: 400 }
                );
            }

            if (!Types.ObjectId.isValid(data.wardId)) {
                return NextResponse.json(
                    { success: false, message: "Invalid ward ID format" },
                    { status: 400 }
                );
            }

            const ward = await Ward.findOne({ ...auth.filter, _id: data.wardId }).select("_id").lean();
            if (!ward) {
                return NextResponse.json({ success: false, message: "Ward not found in your organization scope" }, { status: 404 });
            }

            const room = await this.roomService.createRoom(data);

            return NextResponse.json(
                { success: true, message: "Room created successfully", data: room },
                { status: 201 }
            );
        } catch (error: unknown) {
            const err = error as { name?: string; code?: number; keyValue?: Record<string, unknown>; statusCode?: number; message?: string; stack?: string };
            if (err?.code === 11000) {
                return NextResponse.json({ success: false, message: `Room number ${String(err.keyValue?.roomNumber || "already in use")} already exists` }, { status: 409 });
            }
            if (err?.name === "ValidationError" || err?.name === "CastError") {
                return NextResponse.json({ success: false, message: err.message || "Invalid room details" }, { status: 400 });
            }
            if (!err?.statusCode) console.error("[RoomController.createRoom] Unexpected error:", err?.stack || error);
            const statusCode = err?.statusCode || 500;
            return NextResponse.json(
                { success: false, message: err?.message || "Failed to create room" },
                { status: statusCode }
            );
        }
    }

    async getRooms(request: NextRequest): Promise<NextResponse> {
        try {
            await dbConnect();
            const auth = await authorizeRequest(request, PERMISSION_KEYS.WARD_VIEW, "Room");
            if (!auth.isAuthorized) return auth.response;

            const { searchParams } = new URL(request.url);
            const wardId = searchParams.get('wardId');
            
            if (wardId && !Types.ObjectId.isValid(wardId)) {
                    return NextResponse.json(
                        { success: false, message: "Invalid ward ID" },
                        { status: 400 }
                    );
            }
            const scopedWards = await Ward.find(auth.filter).select("_id").lean();
            const wardIds = scopedWards.map((ward) => ward._id);
            if (wardId && !wardIds.some((id) => id.toString() === wardId)) {
                return NextResponse.json({ success: false, message: "Ward not found in your organization scope" }, { status: 404 });
            }
            const rooms = wardIds.length
                ? await Room.find({ wardId: wardId ? new Types.ObjectId(wardId) : { $in: wardIds } })
                    .populate({ path: "wardId", populate: { path: "organizationId" } }).lean()
                : [];

            return NextResponse.json(
                { success: true, count: rooms.length, data: rooms },
                { status: 200 }
            );
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Failed to fetch rooms";
            return NextResponse.json(
                { success: false, message },
                { status: 500 }
            );
        }
    }

    async getRoomById(id: string, request?: NextRequest): Promise<NextResponse> {
        try {
            await dbConnect();
            if (request) {
                const auth = await authorizeRequest(request, PERMISSION_KEYS.WARD_VIEW, "Room");
                if (!auth.isAuthorized) return auth.response;
            }

            if (!Types.ObjectId.isValid(id)) {
                return NextResponse.json(
                    { success: false, message: "Invalid room ID" },
                    { status: 400 }
                );
            }

            const room = await this.roomService.getRoomById(new Types.ObjectId(id));
            if (!room) {
                return NextResponse.json(
                    { success: false, message: "Room not found" },
                    { status: 404 }
                );
            }

            return NextResponse.json(
                { success: true, data: room },
                { status: 200 }
            );
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Failed to fetch room";
            return NextResponse.json(
                { success: false, message },
                { status: 500 }
            );
        }
    }

    async updateRoom(request: NextRequest, id: string): Promise<NextResponse> {
        try {
            await dbConnect();
            const auth = await authorizeRequest(request, PERMISSION_KEYS.WARD_MANAGE, "Room");
            if (!auth.isAuthorized) return auth.response;

            if (!Types.ObjectId.isValid(id)) {
                return NextResponse.json(
                    { success: false, message: "Invalid room ID" },
                    { status: 400 }
                );
            }

            const data: UpdateRoomDto = await request.json();
            
            if (data.wardId && !Types.ObjectId.isValid(data.wardId)) {
                 return NextResponse.json(
                    { success: false, message: "Invalid ward ID format" },
                    { status: 400 }
                );
            }
            
            const room = await this.roomService.updateRoom(new Types.ObjectId(id), data);

            return NextResponse.json(
                { success: true, message: "Room updated successfully", data: room },
                { status: 200 }
            );
        } catch (error: unknown) {
            const err = error as { statusCode?: number; message?: string };
            const statusCode = err?.statusCode || 500;
            return NextResponse.json(
                { success: false, message: err?.message || "Failed to update room" },
                { status: statusCode }
            );
        }
    }

    async deleteRoom(id: string, request?: NextRequest): Promise<NextResponse> {
        try {
            await dbConnect();
            if (request) {
                const auth = await authorizeRequest(request, PERMISSION_KEYS.WARD_MANAGE, "Room");
                if (!auth.isAuthorized) return auth.response;
            }

            if (!Types.ObjectId.isValid(id)) {
                return NextResponse.json(
                    { success: false, message: "Invalid room ID" },
                    { status: 400 }
                );
            }

            await this.roomService.deleteRoom(new Types.ObjectId(id));

            return NextResponse.json(
                { success: true, message: "Room deleted successfully" },
                { status: 200 }
            );
        } catch (error: unknown) {
            const err = error as { statusCode?: number; message?: string };
            const statusCode = err?.statusCode || 500;
            return NextResponse.json(
                { success: false, message: err?.message || "Failed to delete room" },
                { status: statusCode }
            );
        }
    }
}

const roomController = new RoomController();
export default roomController;
