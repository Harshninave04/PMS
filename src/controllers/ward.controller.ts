import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import dbConnect from "@/lib/dbConnect";
import defaultWardService, { WardService } from "@/services/ward.service";
import { CreateWardDto, UpdateWardDto } from "@/dto/ward.dto";
import { authorizeRequest } from "@/lib/rbac/guard";
import { PERMISSION_KEYS } from "@/types/rbac";

export class WardController {
    constructor(private wardService: WardService = defaultWardService) { }

    async createWard(request: NextRequest): Promise<NextResponse> {
        try {
            await dbConnect();
            const auth = await authorizeRequest(request, PERMISSION_KEYS.WARD_MANAGE, "Ward");
            if (!auth.isAuthorized) return auth.response;

            const data: CreateWardDto = await request.json();

            // Enforce facility assignment: lock organizationId to branchId or organizationId if not global
            if (auth.context.branchId && auth.grant.orgScope !== "GLOBAL") {
                data.organizationId = auth.context.branchId.toString();
            }

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

            const ward = await this.wardService.createWard(data);

            return NextResponse.json(
                { success: true, message: "Ward created successfully", data: ward },
                { status: 201 }
            );
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Failed to create ward";
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

            const { searchParams } = new URL(request.url);
            let organizationId = searchParams.get('organizationId');

            if (auth.context.branchId && auth.grant.orgScope === "BRANCH") {
                organizationId = auth.context.branchId.toString();
            }

            let wards;

            if (organizationId) {
                if (!Types.ObjectId.isValid(organizationId)) {
                    return NextResponse.json(
                        { success: false, message: "Invalid organization ID" },
                        { status: 400 }
                    );
                }
                wards = await this.wardService.getWardsByOrganizationId(new Types.ObjectId(organizationId));
            } else {
                wards = await this.wardService.getAllWards();
            }

            return NextResponse.json(
                { success: true, count: wards.length, data: wards },
                { status: 200 }
            );
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Failed to fetch wards";
            return NextResponse.json(
                { success: false, message },
                { status: 500 }
            );
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
