import { NextRequest, NextResponse } from "next/server";
import hrService from "@/services/hr.service";
import { authorizeRequest } from "@/lib/rbac/guard";
import { PERMISSION_KEYS } from "@/types/rbac";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await authorizeRequest(request, PERMISSION_KEYS.STAFF_UPDATE);
  if (!authResult.isAuthorized) return authResult.response;

  try {
    const { id } = await params;
    const body = await request.json();
    const updated = await hrService.updateLeaveStatus(
      id,
      body.status,
      body.approverId,
      body.rejectionReason
    );
    return NextResponse.json({
      success: true,
      message: `Leave request ${body.status.toLowerCase()} successfully`,
      data: updated,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error?.message || "Failed to update leave status" },
      { status: 400 }
    );
  }
}
