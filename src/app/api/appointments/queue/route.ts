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

// Queue serving order: EMERGENCY -> URGENT -> NORMAL, then the order the
// tokens were issued. Tokens themselves are never renumbered.
const PRIORITY_RANK: Record<string, number> = {
    EMERGENCY: 0,
    URGENT: 1,
    VIP: 2,
    NORMAL: 3,
};

interface QueueOrderable {
    priority?: string;
    createdAt?: Date | string;
    tokenNumber?: string;
}

function compareQueueOrder(a: QueueOrderable, b: QueueOrderable): number {
    const rank =
        (PRIORITY_RANK[a.priority ?? ""] ?? PRIORITY_RANK.NORMAL) -
        (PRIORITY_RANK[b.priority ?? ""] ?? PRIORITY_RANK.NORMAL);
    if (rank !== 0) return rank;

    const created = new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime();
    if (created !== 0) return created;

    return String(a.tokenNumber ?? "").localeCompare(String(b.tokenNumber ?? ""));
}

export async function GET(request: NextRequest) {
  const denied = await requirePermission(request, "opd.queue:view");
  if (denied) return denied;

  const authResult = await authorizeRequest(request, PERMISSION_KEYS.APPOINTMENT_VIEW);
  if (!authResult.isAuthorized) return authResult.response;

    try {
        await dbConnect();
        if (!Patient) {}
        if (!Doctor) {}
        if (!User) {}
        if (!Department) {}

        const { searchParams } = new URL(request.url);
        let doctorId = searchParams.get('doctorId');

        // Doctor isolation: a doctor only ever sees their own live queue,
        // never another doctor's list (or the full hospital queue)
        if (isDoctorActor(authResult.context)) {
            doctorId = authResult.context.doctorProfileId!.toString();
        }

        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date(todayStart);
        todayEnd.setDate(todayEnd.getDate() + 1);

        const query: any = {
            appointmentDate: { $gte: todayStart, $lt: todayEnd },
            status: { $nin: ["CANCELLED"] }
        };

        if (doctorId && doctorId !== 'ALL') {
            query.doctorId = doctorId;
        }

        const queue = await Appointment.find(query)
            .populate('patientId', 'name contact uhid age gender bloodGroup')
            .populate({
                path: 'doctorId',
                populate: [
                    { path: 'userId', select: 'name email phone' },
                    { path: 'departmentId', select: 'name code location' }
                ]
            })
            .sort({ createdAt: 1, tokenNumber: 1 })
            .lean();

        // Serve by priority first, keeping token/creation order inside a priority
        queue.sort(compareQueueOrder);

        // Calculate queue metrics
        const waitingCount = queue.filter(q => q.queueStatus === 'WAITING' || q.queueStatus === 'TRIAGE').length;
        const calledCount = queue.filter(q => q.queueStatus === 'CALLED').length;
        const inConsultationCount = queue.filter(q => q.queueStatus === 'IN_CONSULTATION' || q.status === 'IN_PROGRESS').length;
        const completedCount = queue.filter(q => q.queueStatus === 'COMPLETED' || q.status === 'COMPLETED').length;

        return NextResponse.json({
            success: true,
            data: queue,
            metrics: {
                totalToday: queue.length,
                waiting: waitingCount,
                called: calledCount,
                inConsultation: inConsultationCount,
                completed: completedCount,
                estimatedWaitTimeMins: waitingCount * 15
            }
        });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
}

export async function POST(request: NextRequest) {
  const denied = await requirePermission(request, "opd.queue:update");
  if (denied) return denied;

  const authResult = await authorizeRequest(request, PERMISSION_KEYS.APPOINTMENT_UPDATE);
  if (!authResult.isAuthorized) return authResult.response;

    try {
        await dbConnect();
        const body = await request.json();
        const { appointmentId, action } = body;

        // Doctor isolation: a doctor only operates on their own queue.
        // Ignore any doctorId supplied by the doctor's client.
        if (isDoctorActor(authResult.context)) {
            body.doctorId = authResult.context.doctorProfileId!.toString();
        }

        if (!action) {
            return NextResponse.json({ success: false, error: "action is required" }, { status: 400 });
        }
        if (action !== "CALL_NEXT" && !appointmentId) {
            return NextResponse.json({ success: false, error: "appointmentId and action are required" }, { status: 400 });
        }

        const updateData: any = {};
        const now = new Date();
        let targetId = appointmentId;

        switch (action) {
            case "CALL_NEXT": {
                const todayStart = new Date();
                todayStart.setHours(0, 0, 0, 0);
                const todayEnd = new Date(todayStart);
                todayEnd.setDate(todayEnd.getDate() + 1);

                const query: any = {
                    appointmentDate: { $gte: todayStart, $lt: todayEnd },
                    queueStatus: "WAITING",
                    status: { $nin: ["CANCELLED", "NO_SHOW"] }
                };
                if (body.doctorId && body.doctorId !== "ALL") {
                    query.doctorId = body.doctorId;
                }
                if (appointmentId) {
                    query._id = appointmentId;
                }

                const candidates = await Appointment.find(query)
                    .sort({ createdAt: 1, tokenNumber: 1 });
                if (candidates.length === 0) {
                    return NextResponse.json(
                        { success: false, error: "No patients are waiting in the queue" },
                        { status: 404 }
                    );
                }

                // Same order as the queue listing: priority first, then token order
                const target = candidates.reduce((best, doc) =>
                    compareQueueOrder(doc, best) < 0 ? doc : best
                );

                targetId = target._id.toString();
                updateData.status = "CHECKED_IN";
                updateData.queueStatus = "CALLED";
                updateData.calledAt = now;
                if (!target.checkedInAt) {
                    updateData.checkedInAt = now;
                }
                break;
            }
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
                updateData.queueStatus = "NO_SHOW";
                updateData.noShowRecordedAt = now;
                break;
            default:
                return NextResponse.json({ success: false, error: "Invalid action" }, { status: 400 });
        }

        // Doctor isolation: a targeted queue action may only touch the doctor's
        // own appointment (CALL_NEXT already picks from the doctor's own queue).
        if (isDoctorActor(authResult.context) && action !== "CALL_NEXT") {
            const target = await Appointment.findById(targetId).select("doctorId").lean();
            if (!target || target.doctorId?.toString() !== authResult.context.doctorProfileId!.toString()) {
                return NextResponse.json(
                    { success: false, error: "Forbidden: You can only manage your own appointments" },
                    { status: 403 }
                );
            }
        }

        const updated = await Appointment.findByIdAndUpdate(targetId, updateData, { new: true })
            .populate('patientId', 'name contact uhid age gender bloodGroup')
            .populate({
                path: 'doctorId',
                populate: [
                    { path: 'userId', select: 'name email phone' },
                    { path: 'departmentId', select: 'name code location' }
                ]
            })
            .lean();

        return NextResponse.json({ success: true, data: updated });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
}
