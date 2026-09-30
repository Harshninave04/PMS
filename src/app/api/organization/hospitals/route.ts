import { NextResponse } from "next/server";
import { OrganizationMgmtService } from "@/services/organization-mgmt.service";
import { authorizeRequest } from "@/lib/rbac/guard";
import { PERMISSION_KEYS } from "@/types/rbac";

export async function GET(request: Request) {
  const authResult = await authorizeRequest(request, PERMISSION_KEYS.ORGANIZATION_VIEW);
  if (!authResult.isAuthorized) return authResult.response;

  try {
    const hospitals = await OrganizationMgmtService.getHospitals();
    return NextResponse.json({ success: true, data: hospitals });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const authResult = await authorizeRequest(req, PERMISSION_KEYS.ORGANIZATION_CREATE);
  if (!authResult.isAuthorized) return authResult.response;

  try {
    const body = await req.json();
    if (!body.organizationName || !body.organizationId) {
      return NextResponse.json(
        { success: false, message: "Organization name and ID are required." },
        { status: 400 }
      );
    }
    const hospital = await OrganizationMgmtService.createHospital(body);
    return NextResponse.json({ success: true, data: hospital }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
