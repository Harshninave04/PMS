import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import dbConnect from "@/lib/dbConnect";
import Specialization from "@/models/specialization.model";
import Department from "@/models/department.model";
import { authorizeRequest } from "@/lib/rbac/guard";
import { documentMatchesScope } from "@/lib/rbac/scope-filter";
import { PERMISSION_KEYS } from "@/types/rbac";

type Params = { params: Promise<{ id: string }> };

/**
 * A specialization carries no tenant fields of its own, so scope is inherited
 * from the department it is attached to. Records without a department are
 * shared catalog entries and readable by anyone holding the permission.
 */
async function resolveScopedSpecialization(id: string, filter: Record<string, unknown>) {
  const specialization = await Specialization.findById(id)
    .populate("departmentId")
    .lean();

  if (!specialization) return null;

  const departmentId = specialization.departmentId as any;
  if (!departmentId) return specialization;

  if (!(await documentMatchesScope(departmentId as Record<string, unknown>, filter))) {
    return null;
  }

  return specialization;
}

export async function GET(request: NextRequest, { params }: Params): Promise<NextResponse> {
  try {
    await dbConnect();

    const authResult = await authorizeRequest(request, PERMISSION_KEYS.DEPARTMENT_VIEW, "Department");
    if (!authResult.isAuthorized) return authResult.response;

    const { id } = await params;
    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, message: "Invalid specialization ID" }, { status: 400 });
    }

    const specialization = await resolveScopedSpecialization(id, authResult.filter);
    if (!specialization) {
      return NextResponse.json({ success: false, message: "Specialization not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: specialization });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error?.message || "Failed to fetch specialization" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: Params): Promise<NextResponse> {
  try {
    await dbConnect();

    const authResult = await authorizeRequest(request, PERMISSION_KEYS.DEPARTMENT_UPDATE, "Department");
    if (!authResult.isAuthorized) return authResult.response;

    const { id } = await params;
    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, message: "Invalid specialization ID" }, { status: 400 });
    }

    if (!(await resolveScopedSpecialization(id, authResult.filter))) {
      return NextResponse.json({ success: false, message: "Specialization not found" }, { status: 404 });
    }

    const body = await request.json();
    const updateData: any = {};
    if (body.name) updateData.name = body.name.trim();
    if (body.code) {
      const code = body.code.trim().toUpperCase();
      const existing = await Specialization.findOne({ code, _id: { $ne: id } });
      if (existing) {
        return NextResponse.json({ success: false, message: `Code '${code}' is already used` }, { status: 409 });
      }
      updateData.code = code;
    }
    if (body.departmentId) {
      const targetDepartment = await Department.findById(body.departmentId)
        .select("_id organizationId")
        .lean();
      const inScope = await documentMatchesScope(
        targetDepartment as Record<string, unknown> | null,
        authResult.filter
      );
      if (!inScope) {
        return NextResponse.json(
          { success: false, message: "Department not found" },
          { status: 404 }
        );
      }
      updateData.departmentId = body.departmentId;
    }
    if (body.description !== undefined) updateData.description = body.description.trim();
    if (typeof body.isActive === "boolean") updateData.isActive = body.isActive;

    const specialization = await Specialization.findByIdAndUpdate(id, updateData, { new: true })
      .populate("departmentId")
      .lean();

    if (!specialization) {
      return NextResponse.json({ success: false, message: "Specialization not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: "Specialization updated successfully", data: specialization });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error?.message || "Failed to update specialization" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: Params): Promise<NextResponse> {
  try {
    await dbConnect();

    const authResult = await authorizeRequest(request, PERMISSION_KEYS.DEPARTMENT_DELETE, "Department");
    if (!authResult.isAuthorized) return authResult.response;

    const { id } = await params;
    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, message: "Invalid specialization ID" }, { status: 400 });
    }

    if (!(await resolveScopedSpecialization(id, authResult.filter))) {
      return NextResponse.json({ success: false, message: "Specialization not found" }, { status: 404 });
    }

    const specialization = await Specialization.findByIdAndDelete(id).lean();
    if (!specialization) {
      return NextResponse.json({ success: false, message: "Specialization not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: "Specialization deleted successfully" });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error?.message || "Failed to delete specialization" }, { status: 500 });
  }
}
