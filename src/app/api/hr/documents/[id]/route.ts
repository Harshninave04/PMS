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
    const updated = await hrService.verifyDocument(
      id,
      body.verificationStatus,
      body.verifiedBy,
      body.notes
    );
    return NextResponse.json({
      success: true,
      message: `Document status updated to ${body.verificationStatus}`,
      data: updated,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error?.message || "Failed to update document status" },
      { status: 400 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await authorizeRequest(request, PERMISSION_KEYS.STAFF_UPDATE);
  if (!authResult.isAuthorized) return authResult.response;

  try {
    const { id } = await params;
    await hrService.deleteStaffDocument(id);
    return NextResponse.json({
      success: true,
      message: "Document deleted successfully",
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error?.message || "Failed to delete document" },
      { status: 400 }
    );
  }
}
