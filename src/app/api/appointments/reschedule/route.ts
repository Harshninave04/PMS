import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/dbConnect";
import Appointment from "@/models/appointment.model";
import Patient from "@/models/patient.model";
import Doctor from "@/models/doctor.model";
import User from "@/models/user.model";
import Department from "@/models/department.model";
import { authorizeRequest, requirePermission } from "@/lib/rbac/guard";
import { PERMISSION_KEYS } from "@/types/rbac";

export async function GET(request: NextRequest) {
  const denied = await requirePermission(request, "opd.list:view");
  if (denied) return denied;

  const authResult = await authorizeRequest(request, PERMISSION_KEYS.APPOINTMENT_VIEW);
  if (!authResult.isAuthorized) return authResult.response;

    try {
        await dbConnect();
        if (!Patient) {}
        if (!Doctor) {}
        if (!User) {}
        if (!Department) {}

        const rescheduled = await Appointment.find({
            rescheduledFrom: { $exists: true, $ne: null }
        })
            .populate('patientId', 'name contact uhid age gender')
            .populate({
                path: 'doctorId',
                populate: [
                    { path: 'userId', select: 'name email phone' },
                    { path: 'departmentId', select: 'name code location' }
                ]
            })
            .sort({ updatedAt: -1 })
            .lean();

        return NextResponse.json({ success: true, count: rescheduled.length, data: rescheduled });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
}

export async function POST(request: NextRequest) {
  const denied = await requirePermission(request, "opd.list:update");
  if (denied) return denied;

  const authResult = await authorizeRequest(request, PERMISSION_KEYS.APPOINTMENT_UPDATE);
  if (!authResult.isAuthorized) return authResult.response;

    try {
        await dbConnect();
        const body = await request.json();
        const { appointmentId, newDate, newTime, newDoctorId, reason } = body;

        if (!appointmentId || !newDate || !newTime) {
            return NextResponse.json(
                { success: false, error: "appointmentId, newDate, and newTime are required" },
                { status: 400 }
            );
        }

        const existing = await Appointment.findById(appointmentId);
        if (!existing) {
            return NextResponse.json({ success: false, error: "Appointment not found" }, { status: 404 });
        }

        const updateData: any = {
            appointmentDate: new Date(newDate),
            appointmentTime: newTime,
            status: "SCHEDULED",
            queueStatus: "WAITING",
            rescheduledFrom: existing.appointmentDate,
            rescheduleReason: reason || "Patient requested rescheduling"
        };

        if (newDoctorId) {
            updateData.doctorId = newDoctorId;
        }

        const updated = await Appointment.findByIdAndUpdate(appointmentId, updateData, { new: true })
            .populate('patientId', 'name contact uhid age gender')
            .populate({
                path: 'doctorId',
                populate: [
                    { path: 'userId', select: 'name email phone' },
                    { path: 'departmentId', select: 'name code location' }
                ]
            })
            .lean();

        return NextResponse.json({
            success: true,
            message: "Appointment rescheduled successfully",
            data: updated
        });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
}
