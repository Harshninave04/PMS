import { NextRequest, NextResponse } from "next/server";
import OrganizationController from "@/controllers/organization.controller";
import { requirePermission } from "@/lib/rbac/guard";

export async function PUT(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
    const denied = await requirePermission(request, "admin.hospital:update");
    if (denied) return denied;

    return OrganizationController.updateOrganization(request, context);
}

export async function DELETE(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
    const denied = await requirePermission(request, "admin.hospital:delete");
    if (denied) return denied;

    return OrganizationController.deleteOrganization(request, context);
}
