import { NextRequest, NextResponse } from "next/server";
import hrService from "@/services/hr.service";
import { authorizeRequest } from "@/lib/rbac/guard";
import { PERMISSION_KEYS } from "@/types/rbac";

export async function GET(request: NextRequest) {
  const authResult = await authorizeRequest(request, PERMISSION_KEYS.STAFF_VIEW);
  if (!authResult.isAuthorized) return authResult.response;

  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date") || undefined;

    const stats = await hrService.getAttendanceStats(date);
    return NextResponse.json({ success: true, data: stats });
  } catch (error: any) {
    console.error("Failed to fetch attendance stats:", error);
    return NextResponse.json(
      { success: false, message: error?.message || "Failed to fetch attendance stats" },
      { status: 500 }
    );
  }
}
