import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import dbConnect from "@/lib/dbConnect";
import Appointment from "@/models/appointment.model";
import { ClinicalRecord } from "@/models/clinical-record.model";
import Prescription from "@/models/prescription.model";
import "@/models/patient.model";
import "@/models/doctor.model";
import "@/models/user.model";
import "@/models/department.model";
import { authorizeRequest } from "@/lib/rbac/guard";
import { buildCompletedTodayFilter, buildCompletedVisitRecordFilters, getTodayDateRange, isCompletedVisitInScope } from "@/lib/completed-today";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await dbConnect();
    const auth = await authorizeRequest(request, "opd.completed-today:view", "Appointment");
    if (!auth.isAuthorized) return auth.response;
    if (auth.context.roleName.toUpperCase() !== "DOCTOR" || !auth.context.doctorProfileId) {
      return NextResponse.json({ success: false, message: "Doctor profile is not linked to this account" }, { status: 403 });
    }

    const { start, end } = getTodayDateRange();
    const filter = buildCompletedTodayFilter(auth.context.doctorProfileId, start, end);
    const { searchParams } = new URL(request.url);
    const appointmentId = searchParams.get("appointmentId");

    if (appointmentId) {
      if (!Types.ObjectId.isValid(appointmentId)) {
        return NextResponse.json({ success: false, message: "Invalid appointment ID" }, { status: 400 });
      }

      const appointment = await Appointment.findOne({ ...filter, _id: new Types.ObjectId(appointmentId) })
        .populate("patientId", "name uhid contact email age gender bloodGroup address emergencyContact dateOfBirth maritalStatus guardianName guardianRelation allergies medicalHistory")
        .populate({
          path: "doctorId",
          select: "userId specialization qualification licenseNo departmentId",
          populate: [
            { path: "userId", select: "name" },
            { path: "departmentId", select: "name" },
          ],
        })
        .lean();

      // Recheck the scope before reading visit or prescription records.
      if (!appointment || !isCompletedVisitInScope(appointment, auth.context.doctorProfileId, start, end)) {
        return NextResponse.json({ success: false, message: "Completed visit not found for today" }, { status: 404 });
      }

      const patientId = appointment.patientId && typeof appointment.patientId === "object" && "_id" in appointment.patientId
        ? appointment.patientId._id
        : appointment.patientId;
      const recordFilters = buildCompletedVisitRecordFilters(appointment._id, patientId, auth.context.userId);
      const [clinicalRecord, prescription] = await Promise.all([
        ClinicalRecord.findOne(recordFilters.clinicalRecord).lean(),
        Prescription.findOne(recordFilters.prescription).lean(),
      ]);

      return NextResponse.json({ success: true, data: { appointment, clinicalRecord, prescription } });
    }

    if (searchParams.get("countOnly") === "true") {
      const count = await Appointment.countDocuments(filter);
      return NextResponse.json({ success: true, count });
    }

    const appointments = await Appointment.find(filter)
      .populate("patientId", "name uhid contact age gender bloodGroup")
      .sort({ consultationEndedAt: -1, tokenNumber: 1 })
      .lean();

    return NextResponse.json({ success: true, count: appointments.length, data: appointments });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unable to load today's completed visits";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
