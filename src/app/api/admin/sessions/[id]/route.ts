import { NextResponse } from "next/server";
import { AdminService } from "@/services/admin.service";
import { authorizeRequest } from "@/lib/rbac/guard";
import { PERMISSION_KEYS } from "@/types/rbac";

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await authorizeRequest(req, PERMISSION_KEYS.USER_DISABLE);
  if (!authResult.isAuthorized) return authResult.response;

  try {
    const { id } = await params;
    const terminated = await AdminService.terminateSession(id);
    return NextResponse.json({
      success: true,
      message: "Session successfully terminated.",
      data: terminated,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
