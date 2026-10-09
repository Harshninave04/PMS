import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/dbConnect";
import Appointment from "@/models/appointment.model";
import Patient from "@/models/patient.model";
import Doctor from "@/models/doctor.model";
import User from "@/models/user.model";
import Department from "@/models/department.model";
import { AppointmentService } from "@/services/appointment.service";
import { authorizeRequest, requirePermission } from "@/lib/rbac/guard";
import { PERMISSION_KEYS } from "@/types/rbac";
import { isDoctorActor } from "@/lib/rbac/doctor-scope";

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
            rescheduledFrom: { $exists: true, $ne: null },
            ...(isDoctorActor(authResult.context)
                ? { doctorId: authResult.context.doctorProfileId!.toString() }
                : {})
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
        const { appointmentId, newDate, newTime, reason } = body;

        // Doctor isolation: a doctor can only reschedule their own appointment
        // and never transfer it to another doctor.
        const newDoctorId = isDoctorActor(authResult.context)
            ? authResult.context.doctorProfileId!.toString()
            : (body.newDoctorId as string | undefined);

        if (!appointmentId || !newDate) {
            return NextResponse.json(
                { success: false, error: "appointmentId and newDate are required" },
                { status: 400 }
            );
        }

        const existing = await Appointment.findById(appointmentId);
        if (!existing) {
            return NextResponse.json({ success: false, error: "Appointment not found" }, { status: 404 });
        }

        if (isDoctorActor(authResult.context) && existing.doctorId?.toString() !== authResult.context.doctorProfileId!.toString()) {
            return NextResponse.json(
                { success: false, error: "Forbidden: You can only reschedule your own appointments" },
                { status: 403 }
            );
        }

        const updateData: any = {
            appointmentDate: new Date(newDate),
            status: "SCHEDULED",
            queueStatus: "WAITING",
            rescheduledFrom: existing.appointmentDate,
            rescheduleReason: reason || "Patient requested rescheduling"
        };

        if (newTime) {
            updateData.appointmentTime = newTime;
        }

        const targetDoctorId = newDoctorId || existing.doctorId;
        const dateChanged = new Date(newDate).getTime() !== new Date(existing.appointmentDate).getTime();
        const doctorChanged = newDoctorId && newDoctorId.toString() !== existing.doctorId.toString();

        if (dateChanged || doctorChanged) {
            // Tokens are scoped per doctor + day, so re-issue when either changes
            updateData.tokenNumber = await AppointmentService.generateTokenNumber(targetDoctorId, newDate);
        }

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
