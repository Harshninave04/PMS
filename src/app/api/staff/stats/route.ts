import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import dbConnect from "@/lib/dbConnect";
import Staff from "@/models/staff.model";
import Doctor from "@/models/doctor.model";
import Department from "@/models/department.model";
import Designation from "@/models/designation.model";
import { authorizeRequest } from "@/lib/rbac/guard";
import { PERMISSION_KEYS } from "@/types/rbac";

/**
 * Headcount metrics for the staff hub.
 *
 * Staff and Doctor records carry no branch or organization of their own, so the
 * caller's boundary is enforced through the department they belong to (a
 * Department carries `organizationId`). Resolving the permitted department ids
 * first means a branch-limited user never sees headcounts for departments they
 * do not have jurisdiction over.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const authResult = await authorizeRequest(request, PERMISSION_KEYS.STAFF_VIEW);
  if (!authResult.isAuthorized) return authResult.response;

  try {
    await dbConnect();

    const { filter } = authResult;
    const isUnrestricted = Object.keys(filter).length === 0;

    // Departments the caller may see. `filter` resolves against Department's
    // organizationId, which is the field that actually exists on that model.
    const departments = await Department.find(filter)
      .select("_id name")
      .lean();
    const permittedDepartmentIds = departments.map((d) => new Types.ObjectId(d._id.toString()));

    const scopeQuery = isUnrestricted ? {} : { departmentId: { $in: permittedDepartmentIds } };

    const [
      totalStaff,
      activeStaff,
      onLeave,
      inactive,
      totalDoctors,
      totalDesignations,
      totalDepartments,
      groupedStaff,
    ] = await Promise.all([
      Staff.countDocuments(scopeQuery),
      Staff.countDocuments({ ...scopeQuery, status: "ACTIVE" }),
      Staff.countDocuments({ ...scopeQuery, status: "ON_LEAVE" }),
      Staff.countDocuments({ ...scopeQuery, status: "INACTIVE" }),
      // Doctors carry a departmentId too, so they scope the same way.
      Doctor.countDocuments(scopeQuery),
      Designation.countDocuments({}),
      departments.length,
      Staff.aggregate([{ $match: scopeQuery }, { $group: { _id: "$departmentId", count: { $sum: 1 } } }]),
    ]);

    const countByDepartment = new Map<string, number>();
    for (const entry of groupedStaff as { _id: Types.ObjectId | null; count: number }[]) {
      if (entry._id) countByDepartment.set(entry._id.toString(), entry.count);
    }

    const departmentBreakdown = departments
      .map((d) => ({
        departmentId: d._id.toString(),
        departmentName: (d as { name?: string }).name ?? "Unnamed department",
        staffCount: countByDepartment.get(d._id.toString()) ?? 0,
      }))
      .sort((a, b) => b.staffCount - a.staffCount);

    return NextResponse.json({
      success: true,
      data: {
        totalStaff,
        activeStaff,
        onLeave,
        inactive,
        totalDoctors,
        totalDesignations,
        totalDepartments,
        departmentBreakdown: departmentBreakdown.slice(0, 12),
        isUnrestricted,
      },
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "Failed to fetch staff statistics",
      },
      { status: 500 }
    );
  }
}
