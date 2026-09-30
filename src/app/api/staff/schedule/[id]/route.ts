import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import dbConnect from "@/lib/dbConnect";
import DoctorSchedule from "@/models/doctor-schedule.model";
import Doctor from "@/models/doctor.model";
import { authorizeRequest } from "@/lib/rbac/guard";
import { documentMatchesScope } from "@/lib/rbac/scope-filter";
import { PERMISSION_KEYS } from "@/types/rbac";

type Params = { params: Promise<{ id: string }> };

/**
 * DoctorSchedule has no tenant fields, so authorization is derived from the
 * owning Doctor's branch. Read requires doctor.doctor.view; mutation requires
 * staff.department.manage.
 */
async function ownsScopedDoctor(schedule: any, filter: Record<string, unknown>) {
  const doctorId = schedule?.doctorId as any;
  if (!doctorId) return false;

  const resolved = doctorId._id ? doctorId._id : doctorId;
  if (!Types.ObjectId.isValid(String(resolved))) return false;

  const doctor = await Doctor.findById(String(resolved))
    .select("_id branchId organizationId")
    .lean();
  return documentMatchesScope(doctor as Record<string, unknown> | null, filter);
}

export async function GET(request: NextRequest, { params }: Params): Promise<NextResponse> {
  try {
    await dbConnect();

    const authResult = await authorizeRequest(request, PERMISSION_KEYS.DOCTOR_VIEW, "Doctor");
    if (!authResult.isAuthorized) return authResult.response;

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

    if (!(await ownsScopedDoctor(schedule, authResult.filter))) {
      return NextResponse.json({ success: false, message: "Schedule not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: schedule });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error?.message || "Failed to fetch schedule" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: Params): Promise<NextResponse> {
  try {
    await dbConnect();

    const authResult = await authorizeRequest(request, PERMISSION_KEYS.STAFF_DEPT_MANAGE, "Doctor");
    if (!authResult.isAuthorized) return authResult.response;

    const { id } = await params;
    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, message: "Invalid schedule ID" }, { status: 400 });
    }

    const existing = await DoctorSchedule.findById(id).select("_id doctorId").lean();
    if (!existing) {
      return NextResponse.json({ success: false, message: "Schedule not found" }, { status: 404 });
    }
    if (!(await ownsScopedDoctor(existing, authResult.filter))) {
      return NextResponse.json({ success: false, message: "Schedule not found" }, { status: 404 });
    }

    const body = await request.json();
    const updateData: any = {};
    if (body.doctorId && Types.ObjectId.isValid(body.doctorId)) {
      // Reassignment must not let a scoped caller move a slot to a doctor that
      // sits outside their branch.
      const targetDoctor = await Doctor.findById(body.doctorId)
        .select("_id branchId organizationId")
        .lean();
      if (!(await documentMatchesScope(targetDoctor as Record<string, unknown> | null, authResult.filter))) {
        return NextResponse.json({ success: false, message: "Doctor not found" }, { status: 404 });
      }
      updateData.doctorId = body.doctorId;
    }
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
  try {
    await dbConnect();

    const authResult = await authorizeRequest(request, PERMISSION_KEYS.STAFF_DEPT_MANAGE, "Doctor");
    if (!authResult.isAuthorized) return authResult.response;

    const { id } = await params;
    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, message: "Invalid schedule ID" }, { status: 400 });
    }

    const existing = await DoctorSchedule.findById(id).select("_id doctorId").lean();
    if (!existing) {
      return NextResponse.json({ success: false, message: "Schedule not found" }, { status: 404 });
    }
    if (!(await ownsScopedDoctor(existing, authResult.filter))) {
      return NextResponse.json({ success: false, message: "Schedule not found" }, { status: 404 });
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
