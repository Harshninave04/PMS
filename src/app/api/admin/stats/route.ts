import { NextResponse } from "next/server";
import { AdminService } from "@/services/admin.service";
import { authorizeRequest, requirePermission } from "@/lib/rbac/guard";
import { PERMISSION_KEYS } from "@/types/rbac";

export async function GET(request: Request) {
  const denied = await requirePermission(request, "admin.users:view");
  if (denied) return denied;

  const authResult = await authorizeRequest(request, PERMISSION_KEYS.USER_VIEW);
  if (!authResult.isAuthorized) return authResult.response;

  try {
    const stats = await AdminService.getAdminSummaryStats();
    return NextResponse.json({ success: true, data: stats });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
