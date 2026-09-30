import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import dbConnect from "@/lib/dbConnect";
import Specialization from "@/models/specialization.model";
import Department from "@/models/department.model";
import Doctor from "@/models/doctor.model";
import { authorizeRequest } from "@/lib/rbac/guard";
import { buildScopedQuery, documentMatchesScope } from "@/lib/rbac/scope-filter";
import { PERMISSION_KEYS } from "@/types/rbac";

/**
 * Medical specializations (department-scoped reference data).
 *
 * GET  requires department.department.view.
 * POST requires department.department.create.
 *
 * The attached doctorCount is computed from the caller's scope so the tally
 * never reveals how many doctors work at another branch.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await dbConnect();

    const authResult = await authorizeRequest(request, PERMISSION_KEYS.DEPARTMENT_VIEW, "Department");
    if (!authResult.isAuthorized) return authResult.response;

    const { searchParams } = new URL(request.url);
    const departmentId = searchParams.get("departmentId");
    const search = searchParams.get("search")?.toLowerCase().trim();

    // Departments are scoped through the organization/branch boundary; a
    // BRANCH-scoped reader sees the departments of their own campus only.
    const deptScope = buildScopedQuery(authResult.filter);
    const visibleDepartments = deptScope.denied
      ? []
      : await Department.find(deptScope.query).select("_id").lean();

    const visibleDepartmentIds = new Set(visibleDepartments.map((d) => d._id.toString()));

    // Reference catalog is not branch-owned, so it is not scope-filtered; the
    // department link is what carries the boundary and is applied below.
    let specializations = await Specialization.find()
      .populate("departmentId")
      .sort({ createdAt: -1 })
      .lean();

    // Attach doctor counts for each specialization, limited to visible doctors.
    const doctorScope = buildScopedQuery(authResult.filter);
    const allDoctors = doctorScope.denied
      ? []
      : await Doctor.find(doctorScope.query).select("specialization").lean();

    let enriched = specializations.map((spec: any) => {
      const docCount = allDoctors.filter((d: any) =>
        d.specialization &&
        d.specialization.toLowerCase().trim() === spec.name.toLowerCase().trim()
      ).length;
      return {
        ...spec,
        doctorCount: docCount,
      };
    });

    if (departmentId && Types.ObjectId.isValid(departmentId)) {
      enriched = enriched.filter((s: any) =>
        s.departmentId && (s.departmentId._id?.toString() === departmentId || s.departmentId.toString() === departmentId)
      );
    } else if (visibleDepartmentIds.size > 0) {
      // Drop catalog entries whose department is outside the caller's campus.
      enriched = enriched.filter((s: any) => {
        const deptId = s.departmentId?._id?.toString() ?? s.departmentId?.toString();
        return !deptId || visibleDepartmentIds.has(deptId);
      });
    }

    if (search) {
      enriched = enriched.filter((s: any) =>
        s.name?.toLowerCase().includes(search) ||
        s.code?.toLowerCase().includes(search) ||
        s.departmentId?.name?.toLowerCase().includes(search)
      );
    }

    return NextResponse.json({
      success: true,
      count: enriched.length,
      data: enriched,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error?.message || "Failed to fetch specializations" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    await dbConnect();

    const authResult = await authorizeRequest(request, PERMISSION_KEYS.DEPARTMENT_CREATE, "Department");
    if (!authResult.isAuthorized) return authResult.response;

    const body = await request.json();

    if (!body.name || !body.code) {
      return NextResponse.json(
        { success: false, message: "Specialization name and code are required" },
        { status: 400 }
      );
    }

    // A specialization may only be attached to a department the caller can
    // reach, otherwise it would be invisible to its own author.
    if (body.departmentId && Types.ObjectId.isValid(body.departmentId)) {
      const targetDepartment = await Department.findById(body.departmentId)
        .select("_id organizationId")
        .lean();
      const departmentInScope = await documentMatchesScope(
        targetDepartment as Record<string, unknown> | null,
        authResult.filter
      );
      if (!departmentInScope) {
        return NextResponse.json(
          { success: false, message: "Department not found" },
          { status: 404 }
        );
      }
    }

    const code = body.code.trim().toUpperCase();
    const existing = await Specialization.findOne({ code });
    if (existing) {
      return NextResponse.json(
        { success: false, message: `Specialization code '${code}' already exists` },
        { status: 409 }
      );
    }

    const specialization = await Specialization.create({
      name: body.name.trim(),
      code,
      departmentId: body.departmentId && Types.ObjectId.isValid(body.departmentId) ? body.departmentId : undefined,
      description: body.description?.trim() || "",
      isActive: body.isActive ?? true,
    });

    const populated = await Specialization.findById(specialization._id)
      .populate("departmentId")
      .lean();

    return NextResponse.json(
      { success: true, message: "Specialization created successfully", data: populated },
      { status: 201 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error?.message || "Failed to create specialization" },
      { status: 500 }
    );
  }
}
