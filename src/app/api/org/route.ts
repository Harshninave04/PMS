import { NextRequest, NextResponse } from "next/server";
import OrganizationController from "@/controllers/organization.controller";
import { requirePermission } from "@/lib/rbac/guard";

export async function POST(request: NextRequest): Promise<NextResponse> {
    const denied = await requirePermission(request, "admin.hospital:create");
    if (denied) return denied;

    try {
        return OrganizationController.createOrganization(request);
    } catch (e: any) {
        return NextResponse.json({
            success: false,
            message: e?.message || "Failed to create organization"
        }, { status: 500 });
    }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
    const denied = await requirePermission(request, null);
    if (denied) return denied;

    try {
        return OrganizationController.getOrganizations(request);
    } catch (e: unknown) {
        const err = e as { message?: string };
        return NextResponse.json({
            success: false,
            message: err?.message || "Failed to fetch organizations"
        }, { status: 500 });
    }
}
