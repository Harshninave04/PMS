import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/dbConnect";
import Appointment from "@/models/appointment.model";
import Patient from "@/models/patient.model";
import Doctor from "@/models/doctor.model";
import User from "@/models/user.model";
import Department from "@/models/department.model";
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

        const cancelled = await Appointment.find({
            status: "CANCELLED",
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
            .sort({ cancelledAt: -1, updatedAt: -1 })
            .lean();

        // Calculate reasons breakdown
        const reasonsBreakdown: Record<string, number> = {};
        cancelled.forEach(c => {
            const cat = c.cancellationCategory || "Other / Unspecified";
            reasonsBreakdown[cat] = (reasonsBreakdown[cat] || 0) + 1;
        });

        return NextResponse.json({
            success: true,
            count: cancelled.length,
            data: cancelled,
            reasonsBreakdown
        });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
}

export async function POST(request: NextRequest) {
  const denied = await requirePermission(request, "opd.list:update");
  if (denied) return denied;

  const authResult = await authorizeRequest(request, PERMISSION_KEYS.APPOINTMENT_CANCEL);
  if (!authResult.isAuthorized) return authResult.response;

    try {
        await dbConnect();
        const body = await request.json();
        const { appointmentId, reason, category } = body;

        if (!appointmentId || !reason) {
            return NextResponse.json(
                { success: false, error: "appointmentId and reason are required" },
                { status: 400 }
            );
        }

        if (isDoctorActor(authResult.context)) {
            const appt = await Appointment.findById(appointmentId).select("doctorId").lean();
            if (!appt || appt.doctorId?.toString() !== authResult.context.doctorProfileId!.toString()) {
                return NextResponse.json(
                    { success: false, error: "Forbidden: You can only cancel your own appointments" },
                    { status: 403 }
                );
            }
        }

        const updated = await Appointment.findByIdAndUpdate(
            appointmentId,
            {
                status: "CANCELLED",
                queueStatus: "CANCELLED",
                cancellationReason: reason,
                cancellationCategory: category || "Patient Request",
                cancelledAt: new Date()
            },
            { new: true }
        )
            .populate('patientId', 'name contact uhid age gender')
            .populate({
                path: 'doctorId',
                populate: [
                    { path: 'userId', select: 'name email phone' },
                    { path: 'departmentId', select: 'name code location' }
                ]
            })
            .lean();

        if (!updated) {
            return NextResponse.json({ success: false, error: "Appointment not found" }, { status: 404 });
        }

        return NextResponse.json({
            success: true,
            message: "Appointment cancelled successfully",
            data: updated
        });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
}
