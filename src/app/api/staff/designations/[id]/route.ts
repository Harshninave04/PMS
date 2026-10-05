import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import dbConnect from "@/lib/dbConnect";
import Designation from "@/models/designation.model";
import { authorizeRequest, requirePermission } from "@/lib/rbac/guard";
import { PERMISSION_KEYS } from "@/types/rbac";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Params): Promise<NextResponse> {
  const denied = await requirePermission(request, "admin.staff:view");
  if (denied) return denied;

  const authResult = await authorizeRequest(request, PERMISSION_KEYS.USER_DIRECTORY_VIEW);
  if (!authResult.isAuthorized) return authResult.response;

  try {
    await dbConnect();
    const { id } = await params;
    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, message: "Invalid designation ID" }, { status: 400 });
    }

    const designation = await Designation.findById(id).lean();
    if (!designation) {
      return NextResponse.json({ success: false, message: "Designation not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: designation });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error?.message || "Failed to fetch designation" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: Params): Promise<NextResponse> {
  const denied = await requirePermission(request, "admin.departments:update");
  if (denied) return denied;

  const authResult = await authorizeRequest(request, PERMISSION_KEYS.STAFF_DEPT_MANAGE);
  if (!authResult.isAuthorized) return authResult.response;

  try {
    await dbConnect();
    const { id } = await params;
    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, message: "Invalid designation ID" }, { status: 400 });
    }

    const body = await request.json();
    const updateData: any = {};
    if (body.name) updateData.name = body.name.trim();
    if (body.code) {
      const code = body.code.trim().toUpperCase();
      const existing = await Designation.findOne({ code, _id: { $ne: id } });
      if (existing) {
        return NextResponse.json({ success: false, message: `Code '${code}' is already used` }, { status: 409 });
      }
      updateData.code = code;
    }
    if (body.department !== undefined) updateData.department = body.department.trim();
    if (body.level !== undefined) updateData.level = body.level.trim();
    if (body.description !== undefined) updateData.description = body.description.trim();
    if (typeof body.isActive === "boolean") updateData.isActive = body.isActive;

    const designation = await Designation.findByIdAndUpdate(id, updateData, { new: true }).lean();
    if (!designation) {
      return NextResponse.json({ success: false, message: "Designation not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: "Designation updated successfully", data: designation });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error?.message || "Failed to update designation" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: Params): Promise<NextResponse> {
  const denied = await requirePermission(request, "admin.departments:delete");
  if (denied) return denied;

  const authResult = await authorizeRequest(request, PERMISSION_KEYS.STAFF_DEPT_MANAGE);
  if (!authResult.isAuthorized) return authResult.response;

  try {
    await dbConnect();
    const { id } = await params;
    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, message: "Invalid designation ID" }, { status: 400 });
    }

    const designation = await Designation.findByIdAndDelete(id).lean();
    if (!designation) {
      return NextResponse.json({ success: false, message: "Designation not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: "Designation deleted successfully" });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error?.message || "Failed to delete designation" }, { status: 500 });
  }
}
