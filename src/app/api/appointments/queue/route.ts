import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import dbConnect from "@/lib/dbConnect";
import Appointment from "@/models/appointment.model";
import { authorizeRequest } from "@/lib/rbac/guard";
import { buildScopedQuery } from "@/lib/rbac/scope-filter";
import { PERMISSION_KEYS } from "@/types/rbac";

export async function GET(req: NextRequest) {
  try {
    await dbConnect();
    const authResult = await authorizeRequest(req, PERMISSION_KEYS.APPOINTMENT_VIEW, "Appointment");
    if (!authResult.isAuthorized) return authResult.response;

    const { searchParams } = new URL(req.url);
    const requestedDoctorId = searchParams.get("doctorId");
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);

    const extraQuery: Record<string, unknown> = {
      appointmentDate: { $gte: todayStart, $lt: todayEnd },
      status: { $nin: ["CANCELLED"] }
    };
    if (requestedDoctorId && requestedDoctorId !== "ALL") {
      if (!Types.ObjectId.isValid(requestedDoctorId)) {
        return NextResponse.json({ success: false, error: "Invalid doctor ID" }, { status: 400 });
      }
      extraQuery.doctorId = new Types.ObjectId(requestedDoctorId);
    }

    const scoped = buildScopedQuery(authResult.filter, extraQuery);
    const queue = scoped.denied ? [] : await Appointment.find(scoped.query)
      .populate("patientId", "name contact uhid age gender bloodGroup allergies medicalHistory")
      .populate({
        path: "doctorId",
        populate: [
          { path: "userId", select: "name email phone" },
          { path: "departmentId", select: "name code location" }
        ]
      })
      .sort({ tokenNumber: 1, createdAt: 1 })
      .lean();

    const waitingCount = queue.filter(q => q.queueStatus === "WAITING" || q.status === "CHECKED_IN" || q.status === "SCHEDULED").length;
    const inConsultationCount = queue.filter(q => q.queueStatus === "IN_CONSULTATION" || q.status === "IN_PROGRESS").length;
    const completedCount = queue.filter(q => q.queueStatus === "COMPLETED" || q.status === "COMPLETED").length;

    return NextResponse.json({
      success: true,
      data: queue,
      metrics: {
        totalToday: queue.length,
        waiting: waitingCount,
        pending: queue.filter(q => q.status === "SCHEDULED" || q.status === "CHECKED_IN").length,
        inConsultation: inConsultationCount,
        completed: completedCount,
        estimatedWaitTimeMins: waitingCount * 15
      }
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load today's appointment queue";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await dbConnect();
    const authResult = await authorizeRequest(req, PERMISSION_KEYS.APPOINTMENT_UPDATE, "Appointment");
    if (!authResult.isAuthorized) return authResult.response;

    const body = await req.json();
    const { appointmentId, action } = body;
    if (!appointmentId || !Types.ObjectId.isValid(appointmentId) || !action) {
      return NextResponse.json({ success: false, error: "A valid appointment ID and action are required" }, { status: 400 });
    }

    const now = new Date();
    const updateData: Record<string, unknown> = {};
    switch (action) {
      case "CHECK_IN":
        updateData.status = "CHECKED_IN";
        updateData.queueStatus = "WAITING";
        updateData.checkedInAt = now;
        break;
      case "START_CONSULTATION":
        updateData.status = "IN_PROGRESS";
        updateData.queueStatus = "IN_CONSULTATION";
        updateData.consultationStartedAt = now;
        break;
      case "COMPLETE":
        updateData.status = "COMPLETED";
        updateData.queueStatus = "COMPLETED";
        updateData.consultationEndedAt = now;
        break;
      case "SKIP":
      case "NO_SHOW":
        updateData.status = "NO_SHOW";
        updateData.queueStatus = "SKIPPED";
        updateData.noShowRecordedAt = now;
        break;
      default:
        return NextResponse.json({ success: false, error: "Invalid queue action" }, { status: 400 });
    }

    const scoped = buildScopedQuery(authResult.filter, { _id: new Types.ObjectId(appointmentId) });
    if (scoped.denied) {
      return NextResponse.json({ success: false, error: "Appointment not found" }, { status: 404 });
    }

    const updated = await Appointment.findOneAndUpdate(scoped.query, updateData, { new: true })
      .populate("patientId", "name contact uhid age gender bloodGroup allergies medicalHistory")
      .populate({
        path: "doctorId",
        populate: [
          { path: "userId", select: "name email phone" },
          { path: "departmentId", select: "name code location" }
        ]
      })
      .lean();

    if (!updated) {
      return NextResponse.json({ success: false, error: "Appointment not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: updated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update appointment queue";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
