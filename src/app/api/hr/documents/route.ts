import { NextRequest, NextResponse } from "next/server";
import hrService from "@/services/hr.service";
import { authorizeRequest } from "@/lib/rbac/guard";
import { PERMISSION_KEYS } from "@/types/rbac";

export async function GET(request: NextRequest) {
  const authResult = await authorizeRequest(request, PERMISSION_KEYS.STAFF_VIEW);
  if (!authResult.isAuthorized) return authResult.response;

  try {
    const { searchParams } = new URL(request.url);
    const verificationStatus = searchParams.get("verificationStatus") || undefined;
    const documentType = searchParams.get("documentType") || undefined;
    const userId = searchParams.get("userId") || undefined;

    const documents = await hrService.getStaffDocuments({ verificationStatus, documentType, userId });
    return NextResponse.json({ success: true, count: documents.length, data: documents });
  } catch (error: any) {
    console.error("Failed to fetch staff documents:", error);
    return NextResponse.json(
      { success: false, message: error?.message || "Failed to fetch staff documents" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const authResult = await authorizeRequest(request, PERMISSION_KEYS.STAFF_UPDATE);
  if (!authResult.isAuthorized) return authResult.response;

  try {
    const body = await request.json();
    const created = await hrService.uploadStaffDocument(body);
    return NextResponse.json(
      { success: true, message: "Staff document uploaded successfully", data: created },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("Failed to upload document:", error);
    return NextResponse.json(
      { success: false, message: error?.message || "Failed to upload staff document" },
      { status: 400 }
    );
  }
}
