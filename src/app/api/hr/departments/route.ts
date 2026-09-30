import { NextResponse } from "next/server";
import hrService from "@/services/hr.service";
import { authorizeRequest } from "@/lib/rbac/guard";
import { PERMISSION_KEYS } from "@/types/rbac";

export async function GET(request: Request) {
  const authResult = await authorizeRequest(request, PERMISSION_KEYS.DEPARTMENT_VIEW);
  if (!authResult.isAuthorized) return authResult.response;

  try {
    const departments = await hrService.getHRDepartments();
    return NextResponse.json({ success: true, count: departments.length, data: departments });
  } catch (error: any) {
    console.error("Failed to fetch HR departments:", error);
    return NextResponse.json(
      { success: false, message: error?.message || "Failed to fetch HR departments" },
      { status: 500 }
    );
  }
}
