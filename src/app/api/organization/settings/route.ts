import { NextResponse } from "next/server";
import { OrganizationMgmtService } from "@/services/organization-mgmt.service";
import { authorizeRequest, requireAnyPermission, requirePermission } from "@/lib/rbac/guard";
import { PERMISSION_KEYS } from "@/types/rbac";

export async function GET(request: Request) {
  const denied = await requireAnyPermission(request, [
    "admin.hospital:view",
    "billing.invoices:view",
    "billing.payments:view",
    "admissions.summary:print",
  ]);
  if (denied) return denied;

  const authResult = await authorizeRequest(request, PERMISSION_KEYS.ORGANIZATION_VIEW);
  if (!authResult.isAuthorized) return authResult.response;

  try {
    const settings = await OrganizationMgmtService.getOrgSettings();
    return NextResponse.json({ success: true, data: settings });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const denied = await requirePermission(request, "admin.hospital:update");
  if (denied) return denied;

  const authResult = await authorizeRequest(request, PERMISSION_KEYS.ORGANIZATION_UPDATE);
  if (!authResult.isAuthorized) return authResult.response;

  try {
    const body = await request.json();
    if (body.timeZone !== undefined) {
      if (typeof body.timeZone !== "string" || !body.timeZone.trim()) {
        return NextResponse.json({ success: false, message: "Hospital time zone is required." }, { status: 400 });
      }
      try {
        new Intl.DateTimeFormat("en", { timeZone: body.timeZone.trim() });
      } catch {
        return NextResponse.json({ success: false, message: "Enter a valid IANA time zone." }, { status: 400 });
      }
      body.timeZone = body.timeZone.trim();
    }
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
