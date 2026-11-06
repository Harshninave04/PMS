import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import Appointment from "@/models/appointment.model";
import Doctor from "@/models/doctor.model";
import DoctorSchedule, { type DayOfWeek } from "@/models/doctor-schedule.model";
import dbConnect from "@/lib/dbConnect";
import { requirePermission } from "@/lib/rbac/guard";

const dayNames: DayOfWeek[] = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
const activeQueueStatuses = ["WAITING", "CALLED", "IN_CONSULTATION", "TRIAGE"];

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await requirePermission(request, "opd.book:create");
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const doctorId = searchParams.get("doctorId") || "";
  const dateValue = searchParams.get("date") || "";
  if (!Types.ObjectId.isValid(doctorId) || !/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
    return NextResponse.json({ success: false, error: "A valid doctor and date are required." }, { status: 400 });
  }

  const [year, month, day] = dateValue.split("-").map(Number);
  const date = new Date(year, month - 1, day, 12);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return NextResponse.json({ success: false, error: "Invalid appointment date." }, { status: 400 });
  }

  try {
    await dbConnect();
    const doctor = await Doctor.findById(doctorId).select("status").lean();
    if (!doctor || doctor.status !== "ACTIVE") {
      return NextResponse.json({ success: true, data: { available: false, unavailableReason: "This doctor is not currently available for appointments.", queueCount: 0, bookedSlots: [], slots: [] } });
    }

    const [schedules, appointments] = await Promise.all([
      DoctorSchedule.find({ doctorId, dayOfWeek: dayNames[date.getDay()] }).lean(),
      Appointment.find({
        doctorId,
        appointmentDate: { $gte: new Date(year, month - 1, day), $lt: new Date(year, month - 1, day + 1) },
        status: { $nin: ["CANCELLED", "NO_SHOW"] },
      }).select("appointmentTime queueStatus").lean(),
    ]);
    const schedule = schedules.find((item) => item.status === "ACTIVE");
    const queueCount = appointments.filter((item) => activeQueueStatuses.includes(item.queueStatus || "WAITING")).length;
    const bookedSlots = appointments.flatMap((item) => item.appointmentTime ? [item.appointmentTime] : []);
    if (!schedule) {
      const onLeave = schedules.some((item) => item.status === "ON_LEAVE");
      return NextResponse.json({ success: true, data: { available: false, unavailableReason: onLeave ? "The doctor is marked on leave for this day." : "The doctor has no schedule on this day.", queueCount, bookedSlots, slots: [] } });
    }

    const duration = Math.max(5, schedule.slotDurationMinutes || 15);
    const [startHour, startMinute] = schedule.startTime.split(":").map(Number);
    const [endHour, endMinute] = schedule.endTime.split(":").map(Number);
    let cursor = startHour * 60 + startMinute;
    const end = endHour * 60 + endMinute;
    const slots: string[] = [];
    while (cursor + duration <= end && slots.length < 100) {
      slots.push(`${String(Math.floor(cursor / 60)).padStart(2, "0")}:${String(cursor % 60).padStart(2, "0")}`);
      cursor += duration;
    }
    return NextResponse.json({ success: true, data: { available: slots.length > 0, queueCount, bookedSlots, slots } });
  } catch {
    return NextResponse.json({ success: false, error: "Unable to load doctor availability." }, { status: 500 });
  }
}
