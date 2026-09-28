import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/dbConnect";
import { SurgerySchedule } from "@/models/surgery-schedule.model";
import { authorizeRequest } from "@/lib/rbac/guard";
import { PERMISSION_KEYS } from "@/types/rbac";

export async function GET(request: NextRequest) {
  try {
    await dbConnect();
    const auth = await authorizeRequest(request, PERMISSION_KEYS.OT_SCHEDULE_VIEW, "SurgerySchedule");
    if (!auth.isAuthorized) return auth.response;

    const schedules = await SurgerySchedule.find()
      .select("surgeryCode patientName uhid surgeryName otRoom surgeon anesthesiologist anesthesiaType asaGrade preOpCleared status")
      .sort({ date: -1 });
    return NextResponse.json({ success: true, data: schedules });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to fetch anesthesia schedules";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await dbConnect();
    const auth = await authorizeRequest(request, PERMISSION_KEYS.OT_CHECKLIST_VERIFY, "SurgerySchedule");
    if (!auth.isAuthorized) return auth.response;

    const data = await request.json();
    if (data.surgeryScheduleId) {
      await SurgerySchedule.findByIdAndUpdate(data.surgeryScheduleId, {
        anesthesiaType: data.anesthesiaType,
        asaGrade: data.asaGrade,
        anesthesiologist: data.anesthesiologist
      });
    }
    return NextResponse.json({ success: true, message: "Anesthesia evaluation saved." });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to save anesthesia evaluation";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
