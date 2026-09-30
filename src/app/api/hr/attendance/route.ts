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
    const status = searchParams.get("status") || undefined;

    const attendance = await hrService.getAttendance(date, status);
    return NextResponse.json({ success: true, count: attendance.length, data: attendance });
  } catch (error: any) {
    console.error("Failed to fetch attendance:", error);
    return NextResponse.json(
      { success: false, message: error?.message || "Failed to fetch attendance" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const authResult = await authorizeRequest(request, PERMISSION_KEYS.STAFF_UPDATE);
  if (!authResult.isAuthorized) return authResult.response;

  try {
    const body = await request.json();
    const record = await hrService.recordAttendance(body);
    return NextResponse.json(
      { success: true, message: "Attendance logged successfully", data: record },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("Failed to log attendance:", error);
    return NextResponse.json(
      { success: false, message: error?.message || "Failed to log attendance" },
      { status: 400 }
    );
  }
}
