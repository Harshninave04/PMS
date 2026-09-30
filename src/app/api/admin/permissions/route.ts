import { NextResponse } from "next/server";
import { AdminService } from "@/services/admin.service";
import { authorizeRequest } from "@/lib/rbac/guard";
import { PERMISSION_KEYS } from "@/types/rbac";

export async function GET(request: Request) {
  const authResult = await authorizeRequest(request, PERMISSION_KEYS.ROLE_VIEW);
  if (!authResult.isAuthorized) return authResult.response;

  try {
    const matrix = await AdminService.getPermissionsMatrix();
    return NextResponse.json({ success: true, data: matrix });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
