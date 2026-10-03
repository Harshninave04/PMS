import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import dbConnect from "@/lib/dbConnect";
import DoctorSchedule from "@/models/doctor-schedule.model";
import Doctor from "@/models/doctor.model";
import User from "@/models/user.model";
import Department from "@/models/department.model";
import { authorizeRequest, requirePermission } from "@/lib/rbac/guard";
import { PERMISSION_KEYS } from "@/types/rbac";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Params): Promise<NextResponse> {
  const denied = await requirePermission(request, "admin.schedule:view");
  if (denied) return denied;

  const authResult = await authorizeRequest(request, PERMISSION_KEYS.USER_DIRECTORY_VIEW);
  if (!authResult.isAuthorized) return authResult.response;

  try {
    await dbConnect();
    if (!Doctor) {}
    if (!User) {}
    if (!Department) {}

    const { id } = await params;
    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, message: "Invalid schedule ID" }, { status: 400 });
    }

    const schedule = await DoctorSchedule.findById(id)
      .populate({
        path: "doctorId",
        populate: [
          { path: "userId", select: "name email phone avatar" },
          { path: "departmentId", select: "name code location" },
        ],
      })
      .lean();

    if (!schedule) {
      return NextResponse.json({ success: false, message: "Schedule not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: schedule });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error?.message || "Failed to fetch schedule" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: Params): Promise<NextResponse> {
  const denied = await requirePermission(request, "admin.schedule:update");
  if (denied) return denied;

  const authResult = await authorizeRequest(request, PERMISSION_KEYS.STAFF_UPDATE);
  if (!authResult.isAuthorized) return authResult.response;

  try {
    await dbConnect();
    const { id } = await params;
    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, message: "Invalid schedule ID" }, { status: 400 });
    }

    const body = await request.json();
    const updateData: any = {};
    if (body.doctorId && Types.ObjectId.isValid(body.doctorId)) updateData.doctorId = body.doctorId;
    if (body.dayOfWeek) updateData.dayOfWeek = body.dayOfWeek;
    if (body.startTime) updateData.startTime = body.startTime;
    if (body.endTime) updateData.endTime = body.endTime;
    if (body.roomNumber !== undefined) updateData.roomNumber = body.roomNumber.trim();
    if (body.maxPatients !== undefined) updateData.maxPatients = Number(body.maxPatients);
    if (body.slotDurationMinutes !== undefined) updateData.slotDurationMinutes = Number(body.slotDurationMinutes);
    if (body.status) updateData.status = body.status;

    const schedule = await DoctorSchedule.findByIdAndUpdate(id, updateData, { new: true })
      .populate({
        path: "doctorId",
        populate: [
          { path: "userId", select: "name email phone avatar" },
          { path: "departmentId", select: "name code location" },
        ],
      })
      .lean();

    if (!schedule) {
      return NextResponse.json({ success: false, message: "Schedule not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: "Schedule updated successfully", data: schedule });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error?.message || "Failed to update schedule" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: Params): Promise<NextResponse> {
  const denied = await requirePermission(request, "admin.schedule:delete");
  if (denied) return denied;

  const authResult = await authorizeRequest(request, PERMISSION_KEYS.STAFF_UPDATE);
  if (!authResult.isAuthorized) return authResult.response;

  try {
    await dbConnect();
    const { id } = await params;
    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, message: "Invalid schedule ID" }, { status: 400 });
    }

    const schedule = await DoctorSchedule.findByIdAndDelete(id).lean();
    if (!schedule) {
      return NextResponse.json({ success: false, message: "Schedule not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: "Schedule deleted successfully" });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error?.message || "Failed to delete schedule" }, { status: 500 });
  }
}
