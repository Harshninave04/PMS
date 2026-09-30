import { NextRequest, NextResponse } from "next/server";
import hrService from "@/services/hr.service";
import { authorizeRequest } from "@/lib/rbac/guard";
import { buildScopedQuery } from "@/lib/rbac/scope-filter";
import { PERMISSION_KEYS } from "@/types/rbac";

/**
 * HR employee dossiers.
 *
 * GET  requires staff.staff.view and is restricted to the caller's
 *      authorization scope.
 * POST requires staff.staff.create.
 *
 * The employee record is the Staff profile, so the staff.* permission family
 * governs this endpoint. Results are branch-scoped, matching /api/staff.
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await authorizeRequest(request, PERMISSION_KEYS.STAFF_VIEW, "Staff");
    if (!authResult.isAuthorized) return authResult.response;

    const { searchParams } = new URL(request.url);
    const departmentId = searchParams.get("departmentId") || undefined;
    const role = searchParams.get("role") || undefined;
    const search = searchParams.get("search") || undefined;
    const status = searchParams.get("status") || undefined;

    const scoped = buildScopedQuery(authResult.filter);
    if (scoped.denied) {
      return NextResponse.json({ success: true, count: 0, data: [], scope: "denied" });
    }

    const employees = await hrService.getEmployees(
      { departmentId, role, search, status },
      authResult.filter
    );
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
  try {
    const authResult = await authorizeRequest(request, PERMISSION_KEYS.STAFF_CREATE, "Staff");
    if (!authResult.isAuthorized) return authResult.response;

    const body = await request.json();
    const created = await hrService.createEmployee({
      ...body,
      // Keep the new dossier inside the creator's tenant so scoped readers can
      // actually see it.
      organizationId: body.organizationId ?? authResult.context.organizationId,
      branchId: body.branchId ?? authResult.context.branchId
    });
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
