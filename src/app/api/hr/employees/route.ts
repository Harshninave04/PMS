import { NextRequest, NextResponse } from "next/server";
import hrService from "@/services/hr.service";
import { authorizeRequest } from "@/lib/rbac/guard";
import { PERMISSION_KEYS } from "@/types/rbac";

export async function GET(request: NextRequest) {
  const authResult = await authorizeRequest(request, PERMISSION_KEYS.STAFF_VIEW);
  if (!authResult.isAuthorized) return authResult.response;

  try {
    const { searchParams } = new URL(request.url);
    const departmentId = searchParams.get("departmentId") || undefined;
    const role = searchParams.get("role") || undefined;
    const search = searchParams.get("search") || undefined;
    const status = searchParams.get("status") || undefined;

    const employees = await hrService.getEmployees({ departmentId, role, search, status });
    return NextResponse.json({ success: true, count: employees.length, data: employees });
  } catch (error: any) {
    console.error("Failed to fetch employees:", error);
    return NextResponse.json(
      { success: false, message: error?.message || "Failed to fetch employees" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const authResult = await authorizeRequest(request, PERMISSION_KEYS.STAFF_CREATE);
  if (!authResult.isAuthorized) return authResult.response;

  try {
    const body = await request.json();
    const created = await hrService.createEmployee(body);
    return NextResponse.json(
      { success: true, message: "Employee registered successfully", data: created },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("Failed to create employee:", error);
    return NextResponse.json(
      { success: false, message: error?.message || "Failed to create employee" },
      { status: 400 }
    );
  }
}
