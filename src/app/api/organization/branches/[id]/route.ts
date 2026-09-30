import { NextResponse } from "next/server";
import { OrganizationMgmtService } from "@/services/organization-mgmt.service";
import { authorizeRequest } from "@/lib/rbac/guard";
import { PERMISSION_KEYS } from "@/types/rbac";

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await authorizeRequest(req, PERMISSION_KEYS.ORGANIZATION_UPDATE);
  if (!authResult.isAuthorized) return authResult.response;

  try {
    const { id } = await params;
    const body = await req.json();
    const updated = await OrganizationMgmtService.updateBranch(id, body);
    return NextResponse.json({
      success: true,
      message: "Satellite branch updated successfully.",
      data: updated,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await authorizeRequest(req, PERMISSION_KEYS.ORGANIZATION_DELETE);
  if (!authResult.isAuthorized) return authResult.response;

  try {
    const { id } = await params;
    const deleted = await OrganizationMgmtService.deleteBranch(id);
    return NextResponse.json({
      success: true,
      message: "Satellite branch removed.",
      data: deleted,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
