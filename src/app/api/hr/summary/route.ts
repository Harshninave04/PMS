import { NextResponse } from "next/server";
import hrService from "@/services/hr.service";
import { authorizeRequest } from "@/lib/rbac/guard";
import { PERMISSION_KEYS } from "@/types/rbac";

export async function GET(request: Request) {
  const authResult = await authorizeRequest(request, PERMISSION_KEYS.STAFF_VIEW);
  if (!authResult.isAuthorized) return authResult.response;

  try {
    const stats = await hrService.getHRSummaryStats();
    return NextResponse.json({ success: true, data: stats });
  } catch (error: any) {
    console.error("Failed to fetch HR summary:", error);
    return NextResponse.json(
      { success: false, message: error?.message || "Failed to fetch HR summary" },
      { status: 500 }
    );
  }
}
