import { NextResponse } from "next/server";
import { OrganizationMgmtService } from "@/services/organization-mgmt.service";
import { authorizeRequest } from "@/lib/rbac/guard";
import { PERMISSION_KEYS } from "@/types/rbac";

export async function GET(req: Request) {
  const authResult = await authorizeRequest(req, PERMISSION_KEYS.ORGANIZATION_VIEW);
  if (!authResult.isAuthorized) return authResult.response;

  try {
    const { searchParams } = new URL(req.url);
    const branchId = searchParams.get("branchId") || undefined;
    const settings = await OrganizationMgmtService.getBranchSettings(branchId);
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
    const updated = await OrganizationMgmtService.updateBranchSettings(body);
    return NextResponse.json({
      success: true,
      message: "Satellite branch operating schedule and logistics updated.",
      data: updated,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
