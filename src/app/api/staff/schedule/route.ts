import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import dbConnect from "@/lib/dbConnect";
import DoctorSchedule from "@/models/doctor-schedule.model";
import Doctor from "@/models/doctor.model";
import { authorizeRequest } from "@/lib/rbac/guard";
import { buildScopedQuery, documentMatchesScope } from "@/lib/rbac/scope-filter";
import { PERMISSION_KEYS } from "@/types/rbac";

/**
 * Doctor rosters and their weekly slots.
 *
 * GET  requires doctor.doctor.view. Results are filtered through the owning
 *      Doctor's branch, because DoctorSchedule itself carries no branch field.
 * POST requires staff.department.manage and rejects a doctorId that sits
 *      outside the caller's scope, so a scoped caller cannot attach slots to a
 *      doctor in another branch.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await dbConnect();

    const authResult = await authorizeRequest(request, PERMISSION_KEYS.DOCTOR_VIEW, "Doctor");
    if (!authResult.isAuthorized) return authResult.response;

    const { searchParams } = new URL(request.url);
    const doctorId = searchParams.get("doctorId");
    const dayOfWeek = searchParams.get("dayOfWeek");
    const search = searchParams.get("search")?.toLowerCase().trim();

    // Resolve the set of doctors the caller may see, then restrict schedules to
    // exactly those doctors.
    const doctorScope = buildScopedQuery(authResult.filter);
    const visibleDoctors = doctorScope.denied
      ? []
      : await Doctor.find(doctorScope.query).select("_id").lean();

    const visibleDoctorIds = visibleDoctors.map((d) => d._id);

    const query: Record<string, unknown> = {};
    if (doctorId && Types.ObjectId.isValid(doctorId)) {
      query.doctorId = new Types.ObjectId(doctorId);
    } else if (visibleDoctorIds.length === 0) {
      return NextResponse.json({ success: true, count: 0, data: [], scope: "denied" });
    } else {
      query.doctorId = { $in: visibleDoctorIds };
    }

    if (dayOfWeek && dayOfWeek !== "ALL") {
      query.dayOfWeek = dayOfWeek;
    }

    let schedules = await DoctorSchedule.find(query)
      .populate({
        path: "doctorId",
        populate: [
          { path: "userId", select: "name email phone avatar" },
          { path: "departmentId", select: "name code location" },
        ],
      })
      .sort({ dayOfWeek: 1, startTime: 1 })
      .lean();

    // Defensive: a caller-supplied doctorId outside the scope yields nothing
    // even if the schedule documents were created before scoping existed.
    schedules = schedules.filter(
      (s: any) => !s.doctorId || visibleDoctorIds.some((id) => id.toString() === s.doctorId._id?.toString())
    );

    if (search) {
      schedules = schedules.filter((s: any) => {
        const docName = s.doctorId?.userId?.name?.toLowerCase() || "";
        const spec = s.doctorId?.specialization?.toLowerCase() || "";
        const dept = s.doctorId?.departmentId?.name?.toLowerCase() || "";
        const room = s.roomNumber?.toLowerCase() || "";
        return (
          docName.includes(search) ||
          spec.includes(search) ||
          dept.includes(search) ||
          room.includes(search)
        );
      });
    }

    return NextResponse.json({
      success: true,
      count: schedules.length,
      data: schedules,
    });
  } catch (error: any) {
    console.error("Failed to fetch doctor schedules:", error);
    return NextResponse.json(
      { success: false, message: error?.message || "Failed to fetch schedules" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    await dbConnect();

    const authResult = await authorizeRequest(request, PERMISSION_KEYS.STAFF_DEPT_MANAGE, "Doctor");
    if (!authResult.isAuthorized) return authResult.response;

    const body = await request.json();

    if (!body.doctorId || !body.dayOfWeek || !body.startTime || !body.endTime) {
      return NextResponse.json(
        { success: false, message: "Doctor, Day of Week, Start Time, and End Time are required" },
        { status: 400 }
      );
    }

    if (!Types.ObjectId.isValid(body.doctorId)) {
      return NextResponse.json(
        { success: false, message: "Invalid doctor ID format" },
        { status: 400 }
      );
    }

    const targetDoctor = await Doctor.findById(body.doctorId).select("_id branchId organizationId").lean();
    if (!(await documentMatchesScope(targetDoctor as Record<string, unknown> | null, authResult.filter))) {
      return NextResponse.json(
        { success: false, message: "Doctor not found" },
        { status: 404 }
      );
    }

    const schedule = await DoctorSchedule.create({
      doctorId: body.doctorId,
      dayOfWeek: body.dayOfWeek,
      startTime: body.startTime,
      endTime: body.endTime,
      roomNumber: body.roomNumber?.trim() || "OPD-101",
      maxPatients: Number(body.maxPatients) || 20,
      slotDurationMinutes: Number(body.slotDurationMinutes) || 15,
      status: body.status || "ACTIVE",
    });

    const populated = await DoctorSchedule.findById(schedule._id)
      .populate({
        path: "doctorId",
        populate: [
          { path: "userId", select: "name email phone avatar" },
          { path: "departmentId", select: "name code location" },
        ],
      })
      .lean();

    return NextResponse.json(
      { success: true, message: "Schedule created successfully", data: populated },
      { status: 201 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error?.message || "Failed to create schedule" },
      { status: 500 }
    );
  }
}
