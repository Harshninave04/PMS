import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import dbConnect from "@/lib/dbConnect";
import defaultBedService, { BedService } from "@/services/bed.service";
import { CreateBedDto, UpdateBedDto } from "@/dto/bed.dto";
import { authorizeRequest } from "@/lib/rbac/guard";
import { PERMISSION_KEYS } from "@/types/rbac";
import Room from "@/models/room.model";
import Ward from "@/models/ward.model";

export class BedController {
    constructor(private bedService: BedService = defaultBedService) { }

    async createBed(request: NextRequest): Promise<NextResponse> {
        try {
            await dbConnect();
            const auth = await authorizeRequest(request, PERMISSION_KEYS.WARD_MANAGE, "Bed");
            if (!auth.isAuthorized) return auth.response;

            const raw = await request.json() as Partial<CreateBedDto>;
            const data = {
                ...raw,
                bedNumber: typeof raw.bedNumber === "string" ? raw.bedNumber.trim() : "",
                bedType: typeof raw.bedType === "string" ? raw.bedType.trim().toUpperCase().replace(/[ -]+/g, "_") : "NORMAL",
                status: typeof raw.status === "string" ? raw.status.trim().toUpperCase().replace(/[ -]+/g, "_") : "AVAILABLE",
            } as CreateBedDto;

            if (!data.bedNumber || !data.roomId) {
                return NextResponse.json(
                    { success: false, message: "Fields 'bedNumber' and 'roomId' are required" },
                    { status: 400 }
                );
            }

            if (!Types.ObjectId.isValid(data.roomId)) {
                return NextResponse.json(
                    { success: false, message: "Invalid room ID format" },
                    { status: 400 }
                );
            }

            const room = await Room.findById(data.roomId).select("wardId").lean();
            if (!room) {
                return NextResponse.json({ success: false, message: "Room not found" }, { status: 404 });
            }
            const ward = await Ward.findOne({ ...auth.filter, _id: room.wardId }).select("_id").lean();
            if (!ward) {
                return NextResponse.json({ success: false, message: "Room is outside your organization scope" }, { status: 403 });
            }

            const bed = await this.bedService.createBed(data);

            return NextResponse.json(
                { success: true, message: "Bed created successfully", data: bed },
                { status: 201 }
            );
        } catch (error: unknown) {
            const err = error as { name?: string; code?: number; keyValue?: Record<string, unknown>; statusCode?: number; message?: string; stack?: string };
            if (err?.code === 11000) {
                return NextResponse.json({ success: false, message: `Bed number ${String(err.keyValue?.bedNumber || "already in use")} already exists` }, { status: 409 });
            }
            if (err?.name === "ValidationError" || err?.name === "CastError") {
                return NextResponse.json({ success: false, message: err.message || "Invalid bed details" }, { status: 400 });
            }
            if (!err?.statusCode) console.error("[BedController.createBed] Unexpected error:", err?.stack || error);
            const statusCode = err?.statusCode || 500;
            return NextResponse.json(
                { success: false, message: err?.message || "Failed to create bed" },
                { status: statusCode }
            );
        }
    }

    async getBeds(request: NextRequest): Promise<NextResponse> {
        try {
            await dbConnect();
            const auth = await authorizeRequest(request, PERMISSION_KEYS.WARD_VIEW, "Bed");
            if (!auth.isAuthorized) return auth.response;

            const { searchParams } = new URL(request.url);
            const roomId = searchParams.get('roomId');
            const status = searchParams.get('status');
            const bedType = searchParams.get('bedType');
            
            const scopedWards = await Ward.find({ ...auth.filter, isActive: { $ne: false } }).select("_id").lean();
            const scopedWardIds = scopedWards.map((ward) => ward._id);
            const scopedRooms = scopedWardIds.length
                ? await Room.find({ wardId: { $in: scopedWardIds }, isActive: { $ne: false } }).select("_id").lean()
                : [];
            const scopedRoomIds = scopedRooms.map((room) => room._id);
            const query: Record<string, unknown> = { roomId: { $in: scopedRoomIds } };
            if (roomId) {
                if (!Types.ObjectId.isValid(roomId)) {
                    return NextResponse.json(
                        { success: false, message: "Invalid room ID" },
                        { status: 400 }
                    );
                }
                if (!scopedRoomIds.some((id) => id.toString() === roomId)) {
                    return NextResponse.json({ success: false, message: "Room not found in your organization scope" }, { status: 404 });
                }
                query.roomId = new Types.ObjectId(roomId);
            }
            if (status) {
                query.status = status;
            }
            if (bedType) {
                query.bedType = bedType;
            }

            const beds = await this.bedService.getAllBeds(query);

            return NextResponse.json(
                { success: true, count: beds.length, data: beds },
                { status: 200 }
            );
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Failed to fetch beds";
            return NextResponse.json(
                { success: false, message },
                { status: 500 }
            );
        }
    }

    async getBedById(id: string, request?: NextRequest): Promise<NextResponse> {
        try {
            await dbConnect();
            if (request) {
                const auth = await authorizeRequest(request, PERMISSION_KEYS.WARD_VIEW, "Bed");
                if (!auth.isAuthorized) return auth.response;
            }

            if (!Types.ObjectId.isValid(id)) {
                return NextResponse.json(
                    { success: false, message: "Invalid bed ID" },
                    { status: 400 }
                );
            }

            const bed = await this.bedService.getBedById(new Types.ObjectId(id));
            if (!bed) {
                return NextResponse.json(
                    { success: false, message: "Bed not found" },
                    { status: 404 }
                );
            }

            return NextResponse.json(
                { success: true, data: bed },
                { status: 200 }
            );
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Failed to fetch bed";
            return NextResponse.json(
                { success: false, message },
                { status: 500 }
            );
        }
    }

    async updateBed(request: NextRequest, id: string): Promise<NextResponse> {
        try {
            await dbConnect();
            const auth = await authorizeRequest(request, PERMISSION_KEYS.WARD_MANAGE, "Bed");
            if (!auth.isAuthorized) return auth.response;

            if (!Types.ObjectId.isValid(id)) {
                return NextResponse.json(
                    { success: false, message: "Invalid bed ID" },
                    { status: 400 }
                );
            }

            const data: UpdateBedDto = await request.json();
            
            if (data.roomId && !Types.ObjectId.isValid(data.roomId)) {
                 return NextResponse.json(
                    { success: false, message: "Invalid room ID format" },
                    { status: 400 }
                );
            }
            
            const bed = await this.bedService.updateBed(new Types.ObjectId(id), data);

            return NextResponse.json(
                { success: true, message: "Bed updated successfully", data: bed },
                { status: 200 }
            );
        } catch (error: unknown) {
            const err = error as { statusCode?: number; message?: string };
            const statusCode = err?.statusCode || 500;
            return NextResponse.json(
                { success: false, message: err?.message || "Failed to update bed" },
                { status: statusCode }
            );
        }
    }

    async deleteBed(id: string, request?: NextRequest): Promise<NextResponse> {
        try {
            await dbConnect();
            if (request) {
                const auth = await authorizeRequest(request, PERMISSION_KEYS.WARD_MANAGE, "Bed");
                if (!auth.isAuthorized) return auth.response;
            }

            if (!Types.ObjectId.isValid(id)) {
                return NextResponse.json(
                    { success: false, message: "Invalid bed ID" },
                    { status: 400 }
                );
            }

            await this.bedService.deleteBed(new Types.ObjectId(id));

            return NextResponse.json(
                { success: true, message: "Bed deleted successfully" },
                { status: 200 }
            );
        } catch (error: unknown) {
            const err = error as { statusCode?: number; message?: string };
            const statusCode = err?.statusCode || 500;
            return NextResponse.json(
                { success: false, message: err?.message || "Failed to delete bed" },
                { status: statusCode }
            );
        }
    }
}

const bedController = new BedController();
export default bedController;
