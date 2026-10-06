import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { v4 as uuidv4 } from "uuid";
import dbConnect from "@/lib/dbConnect";
import defaultOrganizationService, { OrganizationService } from "@/services/organization.service";
import { CreateOrganizationDto, UpdateOrganizationDto } from "@/dto/organization.dto";
import { authorizeRequest } from "@/lib/rbac/guard";
import { PERMISSION_KEYS } from "@/types/rbac";

export class OrganizationController {
    constructor(private organizationService: OrganizationService = defaultOrganizationService) { }

    async createOrganization(request: NextRequest): Promise<NextResponse> {
        try {
            await dbConnect();

            const authResult = await authorizeRequest(request, PERMISSION_KEYS.ORGANIZATION_CREATE, "Organization");
            if (!authResult.isAuthorized) return authResult.response;

            const data: CreateOrganizationDto = await request.json();
            const organizationId = uuidv4();
            data.organizationId = organizationId;

            if (data.headQuarter) {
                const parentOrganization = await this.organizationService.getOrganizationById(data.headQuarter);
                if (!parentOrganization) {
                    return NextResponse.json(
                        {
                            success: false,
                            message: "Parent organization not found"
                        },
                        { status: 404 }
                    );
                }
            }
            const organization = await this.organizationService.createOrganization(data);

            return NextResponse.json(
                {
                    success: true,
                    message: "Organization created successfully",
                    data: organization
                },
                { status: 201 }
            );
        } catch (error: unknown) {
            const err = error as { message?: string };
            return NextResponse.json(
                {
                    success: false,
                    message: err?.message || "Failed to create organization"
                },
                { status: 500 }
            );
        }
    }

    async getOrganizations(request: NextRequest): Promise<NextResponse> {
        try {
            await dbConnect();

            const authResult = await authorizeRequest(request, PERMISSION_KEYS.ORGANIZATION_VIEW, "Organization");
            if (!authResult.isAuthorized) return authResult.response;

            const organizations = await this.organizationService.getAllOrganizations();
            return NextResponse.json(
                {
                    success: true,
                    count: organizations.length,
                    data: organizations
                },
                { status: 200 }
            );
        } catch (error: unknown) {
            const err = error as { statusCode?: number; message?: string };
            const statusCode = err?.statusCode || 500;
            return NextResponse.json(
                {
                    success: false,
                    message: err?.message || "Failed to fetch organizations"
                },
                { status: statusCode }
            );
        }
    }

    async updateOrganization(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
        try {
            await dbConnect();

            const authResult = await authorizeRequest(request, PERMISSION_KEYS.ORGANIZATION_UPDATE, "Organization");
            if (!authResult.isAuthorized) return authResult.response;

            const { id } = await params;
            const data: UpdateOrganizationDto = await request.json();

            if (!id.match(/^[0-9a-fA-F]{24}$/)) {
                return NextResponse.json({ success: false, message: "Invalid organization ID format" }, { status: 400 });
            }

            const updatedOrg = await this.organizationService.updateOrganization(id as unknown as Types.ObjectId, data);

            if (!updatedOrg) {
                return NextResponse.json({ success: false, message: "Organization not found" }, { status: 404 });
            }

            return NextResponse.json({ success: true, message: "Organization updated successfully", data: updatedOrg }, { status: 200 });
        } catch (error: unknown) {
            const err = error as { message?: string };
            return NextResponse.json({ success: false, message: err?.message || "Failed to update organization" }, { status: 500 });
        }
    }

    async deleteOrganization(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
        try {
            await dbConnect();

            const authResult = await authorizeRequest(request, PERMISSION_KEYS.ORGANIZATION_DELETE, "Organization");
            if (!authResult.isAuthorized) return authResult.response;

            const { id } = await params;

            if (!id.match(/^[0-9a-fA-F]{24}$/)) {
                return NextResponse.json({ success: false, message: "Invalid organization ID format" }, { status: 400 });
            }

            const deletedOrg = await this.organizationService.deleteOrganization(id as unknown as Types.ObjectId);

            if (!deletedOrg) {
                return NextResponse.json({ success: false, message: "Organization not found" }, { status: 404 });
            }

            return NextResponse.json({ success: true, message: "Organization deleted successfully", data: deletedOrg }, { status: 200 });
        } catch (error: unknown) {
            const err = error as { message?: string };
            return NextResponse.json({ success: false, message: err?.message || "Failed to delete organization" }, { status: 500 });
        }
    }
}

const organizationController = new OrganizationController();
export default organizationController;