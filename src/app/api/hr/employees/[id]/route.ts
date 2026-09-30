import { NextRequest, NextResponse } from "next/server";
import hrService from "@/services/hr.service";
import { authorizeRequest } from "@/lib/rbac/guard";
import { documentMatchesScope } from "@/lib/rbac/scope-filter";
import { PERMISSION_KEYS } from "@/types/rbac";
import dbConnect from "@/lib/dbConnect";
import Staff from "@/models/staff.model";

/**
 * Single HR employee dossier. Read requires staff.staff.view, mutation requires
 * staff.staff.update, and every lookup is constrained to the caller's
 * authorization scope.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await dbConnect();

    const authResult = await authorizeRequest(request, PERMISSION_KEYS.STAFF_VIEW, "Staff");
    if (!authResult.isAuthorized) return authResult.response;

    const { id } = await params;
    const employee = await hrService.getEmployeeById(id, authResult.filter);
    if (!employee) {
      return NextResponse.json(
        { success: false, message: "Employee not found" },
        { status: 404 }
      );
    }
    return NextResponse.json({ success: true, data: employee });
  } catch (error: any) {
    console.error("Failed to fetch employee:", error);
    return NextResponse.json(
      { success: false, message: error?.message || "Failed to fetch employee" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await dbConnect();

    const authResult = await authorizeRequest(request, PERMISSION_KEYS.STAFF_UPDATE, "Staff");
    if (!authResult.isAuthorized) return authResult.response;

    const { id } = await params;
    const body = await request.json();

    const existing = await Staff.findById(id).select("_id branchId organizationId").lean();
    if (!(await documentMatchesScope(existing as Record<string, unknown> | null, authResult.filter))) {
      return NextResponse.json(
        { success: false, message: "Employee not found" },
        { status: 404 }
      );
    }

    const updated = await hrService.updateEmployee(id, body);
    return NextResponse.json({
      success: true,
      message: "Employee updated successfully",
      data: updated,
    });
  } catch (error: any) {
    console.error("Failed to update employee:", error);
    return NextResponse.json(
      { success: false, message: error?.message || "Failed to update employee" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await dbConnect();

    const authResult = await authorizeRequest(request, PERMISSION_KEYS.STAFF_UPDATE, "Staff");
    if (!authResult.isAuthorized) return authResult.response;

    const { id } = await params;
    const existing = await Staff.findById(id).select("_id branchId organizationId").lean();
    if (!(await documentMatchesScope(existing as Record<string, unknown> | null, authResult.filter))) {
      return NextResponse.json(
        { success: false, message: "Employee not found" },
        { status: 404 }
      );
    }

    await Staff.findByIdAndDelete(id);
    return NextResponse.json({ success: true, message: "Employee removed successfully" });
  } catch (error: any) {
    console.error("Failed to delete employee:", error);
    return NextResponse.json(
      { success: false, message: error?.message || "Failed to delete employee" },
      { status: 500 }
    );
  }
}
