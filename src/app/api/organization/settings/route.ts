import { NextResponse } from "next/server";
import { OrganizationMgmtService } from "@/services/organization-mgmt.service";
import { authorizeRequest } from "@/lib/rbac/guard";
import { PERMISSION_KEYS } from "@/types/rbac";

export async function GET(request: Request) {
  const authResult = await authorizeRequest(request, PERMISSION_KEYS.ORGANIZATION_VIEW);
  if (!authResult.isAuthorized) return authResult.response;

  try {
    const settings = await OrganizationMgmtService.getOrgSettings();
    return NextResponse.json({ success: true, data: settings });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const authResult = await authorizeRequest(req, PERMISSION_KEYS.ORGANIZATION_UPDATE);
  if (!authResult.isAuthorized) return authResult.response;

  try {
    const body = await req.json();
    const updated = await OrganizationMgmtService.updateOrgSettings(body);
    return NextResponse.json({
      success: true,
      message: "Organization legal and corporate settings updated successfully.",
      data: updated,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
