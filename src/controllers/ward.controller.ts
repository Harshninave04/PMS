import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import dbConnect from "@/lib/dbConnect";
import defaultWardService, { WardService } from "@/services/ward.service";
import { CreateWardDto, UpdateWardDto } from "@/dto/ward.dto";
import Ward from "@/models/ward.model";
import Room from "@/models/room.model";
import Bed from "@/models/bed.model";
import { authorizeRequest } from "@/lib/rbac/guard";
import { PERMISSION_KEYS } from "@/types/rbac";

// Billing rates must stay money-safe: undefined keeps the field unset
// ("fall back to the ward rate"), anything set must be finite and >= 0.
// Returns NaN to signal an unusable value the caller must reject.
function sanitiseRateField(value: unknown): number | undefined {
    if (value === undefined || value === null || value === "") return undefined;
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric >= 0) return numeric;
    return Number.NaN;
}

export class WardController {
    constructor(private wardService: WardService = defaultWardService) { }

    async createWard(request: NextRequest): Promise<NextResponse> {
        try {
            await dbConnect();
            const auth = await authorizeRequest(request, PERMISSION_KEYS.WARD_MANAGE, "Ward");
            if (!auth.isAuthorized) return auth.response;

            const raw = await request.json() as Partial<CreateWardDto>;
            const data = {
                ...raw,
                wardName: typeof raw.wardName === "string" ? raw.wardName.trim() : "",
                wardCode: typeof raw.wardCode === "string" ? raw.wardCode.trim().toUpperCase() : "",
                wardType: typeof raw.wardType === "string" ? raw.wardType.trim().toUpperCase().replace(/[ -]+/g, "_") : "GENERAL",
                floor: Number(raw.floor),
            } as CreateWardDto;

            // Assign the ward to the same organizational boundary used by scoped reads.
            if (auth.grant.orgScope === "BRANCH") {
                const branchId = auth.context.branchId || auth.context.organizationId;
                data.organizationId = branchId?.toString() || "";
            } else if (auth.grant.orgScope === "ORGANIZATION") {
                data.organizationId = auth.context.organizationId?.toString() || "";
            }
            if (typeof data.organizationId === "string") data.organizationId = data.organizationId.trim();

            if (!data.wardName || !data.wardCode || data.floor === undefined || !data.organizationId) {
                return NextResponse.json(
                    { success: false, message: "Fields 'wardName', 'wardCode', 'floor', and 'organizationId' are required" },
                    { status: 400 }
                );
            }

            if (!Types.ObjectId.isValid(data.organizationId)) {
                return NextResponse.json(
                    { success: false, message: "Invalid organization ID format" },
                    { status: 400 }
                );
            }

            const allowedWardTypes = ["GENERAL", "ICU", "CCU", "NICU", "PICU", "MATERNITY", "PEDIATRIC", "PRIVATE", "SEMI_PRIVATE", "EMERGENCY", "OTHER"];
            if (!allowedWardTypes.includes(data.wardType || "GENERAL")) {
                return NextResponse.json({ success: false, message: "Invalid ward type" }, { status: 400 });
            }
            if (!Number.isFinite(data.floor)) {
                return NextResponse.json({ success: false, message: "Floor must be a number" }, { status: 400 });
            }
            if (!/^[A-Z0-9_-]+$/.test(data.wardCode)) {
                return NextResponse.json({ success: false, message: "Ward code must use uppercase letters or numbers, with no spaces" }, { status: 400 });
            }

            const bedRate = sanitiseRateField(raw.bedRatePerDay);
            const nursingRate = sanitiseRateField(raw.nursingRatePerDay);
            if (Number.isNaN(bedRate) || Number.isNaN(nursingRate)) {
                return NextResponse.json({ success: false, message: "Rates must be zero or positive numbers" }, { status: 400 });
            }
            if (bedRate !== undefined) data.bedRatePerDay = bedRate;
            if (nursingRate !== undefined) data.nursingRatePerDay = nursingRate;

            const ward = await this.wardService.createWard(data);

            return NextResponse.json(
                { success: true, message: "Ward created successfully", data: ward },
                { status: 201 }
            );
        } catch (error: unknown) {
            const err = error as { name?: string; code?: number; keyValue?: Record<string, unknown>; statusCode?: number; message?: string; stack?: string };
            if (err?.code === 11000) {
                const code = String(err.keyValue?.wardCode || "").toUpperCase();
                return NextResponse.json({ success: false, message: `Ward code ${code || "already in use"} already exists` }, { status: 409 });
            }
            if (err?.name === "ValidationError" || err?.name === "CastError") {
                return NextResponse.json({ success: false, message: err.message || "Invalid ward details" }, { status: 400 });
            }
            if (err?.statusCode) {
                return NextResponse.json({ success: false, message: err.message || "Ward operation failed" }, { status: err.statusCode });
            }
            console.error("[WardController.createWard] Unexpected error:", err?.stack || error);
            const message = err?.message || "Failed to create ward";
            return NextResponse.json(
                { success: false, message },
                { status: 500 }
            );
        }
    }

    async getWards(request: NextRequest): Promise<NextResponse> {
        try {
            await dbConnect();
            const auth = await authorizeRequest(request, PERMISSION_KEYS.WARD_VIEW, "Ward");
            if (!auth.isAuthorized) return auth.response;

            const requestedOrganizationId = new URL(request.url).searchParams.get("organizationId");
            let wards;

            if (requestedOrganizationId && auth.grant.orgScope === "GLOBAL") {
                if (!Types.ObjectId.isValid(requestedOrganizationId)) {
                    return NextResponse.json(
                        { success: false, message: "Invalid organization ID" },
                        { status: 400 }
                    );
                }
                wards = await this.wardService.getWardsByOrganizationId(new Types.ObjectId(requestedOrganizationId));
            } else {
                wards = await Ward.find(auth.filter).populate("organizationId").lean();
            }

            return NextResponse.json(
                { success: true, count: wards.length, data: wards },
                { status: 200 }
            );
        } catch (error: unknown) {
            const err = error as { stack?: string; message?: string };
            console.error("[WardController.getWards] Unexpected error:", err?.stack || error);
            const message = err?.message || "Failed to fetch wards";
            return NextResponse.json(
                { success: false, message },
                { status: 500 }
            );
        }
    }

    async getAdmissionWards(
        request: NextRequest,
        permission: string = PERMISSION_KEYS.WARD_VIEW,
    ): Promise<NextResponse> {
        try {
            await dbConnect();
            const auth = await authorizeRequest(request, permission, "Ward");
            if (!auth.isAuthorized) return auth.response;

            const wards = await Ward.find({ ...auth.filter, isActive: { $ne: false } })
                .select("wardName wardType floor")
                .sort({ floor: 1, wardName: 1 })
                .lean();

            const wardIds = wards.map((ward) => ward._id);
            const rooms = wardIds.length
                ? await Room.find({ wardId: { $in: wardIds }, isActive: { $ne: false } })
                    .select("wardId")
                    .lean()
                : [];
            const roomToWard = new Map(
                rooms.map((room) => [room._id.toString(), room.wardId.toString()]),
            );
            const roomIds = rooms.map((room) => room._id);
            const beds = roomIds.length
                ? await Bed.find({
                    roomId: { $in: roomIds },
                    status: "AVAILABLE",
                    isActive: { $ne: false },
                })
                    .select("roomId")
                    .lean()
                : [];
            const availableByWard = new Map<string, number>();

            for (const bed of beds) {
                const wardId = roomToWard.get(bed.roomId.toString());
                if (wardId) availableByWard.set(wardId, (availableByWard.get(wardId) ?? 0) + 1);
            }

            const data = wards.map((ward) => ({
                _id: ward._id.toString(),
                wardName: ward.wardName,
                wardType: ward.wardType,
                floor: ward.floor,
                availableBeds: availableByWard.get(ward._id.toString()) ?? 0,
            }));

            return NextResponse.json({ success: true, count: data.length, data }, { status: 200 });
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Failed to fetch admission wards";
            return NextResponse.json({ success: false, message }, { status: 500 });
        }
    }

    async getWardById(id: string, request?: NextRequest): Promise<NextResponse> {
        try {
            await dbConnect();
            if (request) {
                const auth = await authorizeRequest(request, PERMISSION_KEYS.WARD_VIEW, "Ward");
                if (!auth.isAuthorized) return auth.response;
            }

            if (!Types.ObjectId.isValid(id)) {
                return NextResponse.json(
                    { success: false, message: "Invalid ward ID" },
                    { status: 400 }
                );
            }

            const ward = await this.wardService.getWardById(new Types.ObjectId(id));
            if (!ward) {
                return NextResponse.json(
                    { success: false, message: "Ward not found" },
                    { status: 404 }
                );
            }

            return NextResponse.json(
                { success: true, data: ward },
                { status: 200 }
            );
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Failed to fetch ward";
            return NextResponse.json(
                { success: false, message },
                { status: 500 }
            );
        }
    }

    async updateWard(request: NextRequest, id: string): Promise<NextResponse> {
        try {
            await dbConnect();
            const auth = await authorizeRequest(request, PERMISSION_KEYS.WARD_MANAGE, "Ward");
            if (!auth.isAuthorized) return auth.response;

            if (!Types.ObjectId.isValid(id)) {
                return NextResponse.json(
                    { success: false, message: "Invalid ward ID" },
                    { status: 400 }
                );
            }

            const data: UpdateWardDto = await request.json();

            if (data.organizationId && !Types.ObjectId.isValid(data.organizationId)) {
                return NextResponse.json(
                    { success: false, message: "Invalid organization ID format" },
                    { status: 400 }
                );
            }

            const bedRate = sanitiseRateField(data.bedRatePerDay);
            const nursingRate = sanitiseRateField(data.nursingRatePerDay);
            if (Number.isNaN(bedRate) || Number.isNaN(nursingRate)) {
                return NextResponse.json({ success: false, message: "Rates must be zero or positive numbers" }, { status: 400 });
            }
            if (bedRate === undefined) delete data.bedRatePerDay; else data.bedRatePerDay = bedRate;
            if (nursingRate === undefined) delete data.nursingRatePerDay; else data.nursingRatePerDay = nursingRate;

            const ward = await this.wardService.updateWard(new Types.ObjectId(id), data);

            return NextResponse.json(
                { success: true, message: "Ward updated successfully", data: ward },
                { status: 200 }
            );
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Failed to update ward";
            return NextResponse.json(
                { success: false, message },
                { status: 500 }
            );
        }
    }

    async deleteWard(id: string, request?: NextRequest): Promise<NextResponse> {
        try {
            await dbConnect();
            if (request) {
                const auth = await authorizeRequest(request, PERMISSION_KEYS.WARD_MANAGE, "Ward");
                if (!auth.isAuthorized) return auth.response;
            }

            if (!Types.ObjectId.isValid(id)) {
                return NextResponse.json(
                    { success: false, message: "Invalid ward ID" },
                    { status: 400 }
                );
            }

            await this.wardService.deleteWard(new Types.ObjectId(id));

            return NextResponse.json(
                { success: true, message: "Ward deleted successfully" },
                { status: 200 }
            );
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Failed to delete ward";
            return NextResponse.json(
                { success: false, message },
                { status: 500 }
            );
        }
    }
}

const wardController = new WardController();
export default wardController;
