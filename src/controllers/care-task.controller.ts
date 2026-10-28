import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import dbConnect from "@/lib/dbConnect";
import careTaskService from "@/services/care-task.service";
import nursingService from "@/services/nursing.service";
import visitService from "@/services/visit.service";
import medicationOrderService from "@/services/medication-order.service";
import { authorizeRequest } from "@/lib/rbac/guard";
import { PERMISSION_KEYS } from "@/types/rbac";
import { isSuperAdminRole } from "@/lib/rbac/default-permissions";
import { ClinicalRecord } from "@/models/clinical-record.model";
import { Vitals } from "@/models/vitals.model";
import Admission from "@/models/admission.model";
import { CreateCareTaskDto, UpdateCareTaskDto } from "@/dto/care-task.dto";
import type { CareTaskStatus } from "@/models/care-task.model";
import { HOSPITAL_TIME_ZONE, stayDayNumber } from "@/lib/hospital-time";
import { flagVitalForReview } from "@/lib/vital-flags";

interface TimelineItem {
    id: string;
    kind: "ROUND" | "ADDENDUM" | "VITAL" | "DOSE" | "NURSE_NOTE" | "INSTRUCTION";
    at: string;
    dayNumber: number;
    title: string;
    detail?: string;
    flag?: string;
}

function recordOf(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function timestampOf(record: Record<string, unknown>, ...keys: string[]): Date {
    for (const key of keys) {
        const value = record[key];
        if (value instanceof Date) return value;
        if (typeof value === "string" || typeof value === "number") {
            const date = new Date(value);
            if (!Number.isNaN(date.getTime())) return date;
        }
    }
    return new Date();
}

function stringOf(record: Record<string, unknown>, key: string): string {
    const value = record[key];
    return typeof value === "string" ? value : "";
}

function actorOf(auth: { context: { userId: Types.ObjectId; roleName: string; branchId?: Types.ObjectId }; grant: { orgScope: string } }) {
    return {
        userId: auth.context.userId,
        roleName: auth.context.roleName,
        isSuperAdmin: isSuperAdminRole(auth.context.roleName),
        branchId: auth.context.branchId,
        orgScope: auth.grant.orgScope,
    };
}

export class CareTaskController {
    // GET /api/care-tasks?admissionId=&status=&mine=1
    async listTasks(request: NextRequest): Promise<NextResponse> {
        try {
            await dbConnect();
            const auth = await authorizeRequest(request, PERMISSION_KEYS.NURSING_TASK_VIEW, "Admission");
            if (!auth.isAuthorized) return auth.response;
            const actor = actorOf(auth);

            const { searchParams } = new URL(request.url);
            const admissionId = searchParams.get("admissionId") || undefined;
            const status = searchParams.get("status") || undefined;
            const mine = searchParams.get("mine");

            if (admissionId) {
                if (!Types.ObjectId.isValid(admissionId)) {
                    return NextResponse.json({ success: false, message: "Invalid admission ID" }, { status: 400 });
                }
                try {
                    await careTaskService.assertActorMayAccessAdmission(admissionId, actor);
                } catch (e: unknown) {
                    const err = e as { statusCode?: number; message?: string };
                    return NextResponse.json(
                        { success: false, message: err?.message ?? "Forbidden" },
                        { status: err?.statusCode ?? 403 }
                    );
                }
                const data = await careTaskService.listForAdmissions([admissionId], status);
                return NextResponse.json({ success: true, data }, { status: 200 });
            }

            // Team-scoped listing for doctors/nurses; wide roles must scope by stay.
            const visible = await nursingService.getVisibleAdmissionIds(actor);
            if (visible !== undefined) {
                if (mine !== "0" || admissionId === undefined) {
                    if (visible.length === 0) return NextResponse.json({ success: true, data: [] }, { status: 200 });
                    const data = await careTaskService.listForAdmissions(visible, status);
                    return NextResponse.json({ success: true, data }, { status: 200 });
                }
            }
            if (!actor.isSuperAdmin && !admissionId) {
                return NextResponse.json(
                    { success: false, message: "admissionId is required to list instructions" },
                    { status: 400 }
                );
            }
            const filter: Record<string, unknown> = {};
            if (status && status !== "ALL") filter.status = status;
            const data = await careTaskService.listTasks(filter);
            return NextResponse.json({ success: true, data }, { status: 200 });
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Failed to fetch instructions";
            return NextResponse.json({ success: false, message }, { status: 500 });
        }
    }

    // POST /api/care-tasks (doctor writes instruction for the care team)
    async createTask(request: NextRequest): Promise<NextResponse> {
        try {
            await dbConnect();
            const auth = await authorizeRequest(request, PERMISSION_KEYS.NURSING_TASK_EXECUTE, "Admission");
            if (!auth.isAuthorized) return auth.response;
            const actor = actorOf(auth);

            const body = (await request.json()) as CreateCareTaskDto;
            let admissionForBranch;
            try {
                admissionForBranch = await careTaskService.assertActorMayAccessAdmission(body.admissionId, actor);
            } catch (e: unknown) {
                const err = e as { statusCode?: number; message?: string };
                return NextResponse.json(
                    { success: false, message: err?.message ?? "Forbidden" },
                    { status: err?.statusCode ?? 403 }
                );
            }
            if (auth.grant.orgScope === "BRANCH" && auth.context.branchId) {
                const admBranch = (admissionForBranch as { branchId?: unknown }).branchId;
                const branchStr = admBranch
                    ? ((admBranch as { _id?: { toString(): string } })._id?.toString?.() ?? String(admBranch))
                    : "";
                if (branchStr && branchStr !== auth.context.branchId.toString()) {
                    return NextResponse.json(
                        { success: false, message: "Forbidden: Admission belongs to another branch" },
                        { status: 403 }
                    );
                }
            }
            const data = await careTaskService.createTask(body, actor.userId);
            return NextResponse.json({ success: true, message: "Instruction recorded", data }, { status: 201 });
        } catch (error: unknown) {
            const err = error as { statusCode?: number; message?: string };
            const message = err?.message || (error instanceof Error ? error.message : "Failed to create instruction");
            return NextResponse.json({ success: false, message }, { status: err?.statusCode ?? 500 });
        }
    }

    // PUT /api/care-tasks/[id] { status }
    async updateTask(request: NextRequest, id: string): Promise<NextResponse> {
        try {
            await dbConnect();
            const auth = await authorizeRequest(request, PERMISSION_KEYS.NURSING_TASK_EXECUTE, "Admission");
            if (!auth.isAuthorized) return auth.response;
            const actor = actorOf(auth);

            if (!Types.ObjectId.isValid(id)) {
                return NextResponse.json({ success: false, message: "Invalid instruction ID" }, { status: 400 });
            }
            const body = (await request.json()) as UpdateCareTaskDto;
            if (!body.status) {
                return NextResponse.json({ success: false, message: "Status is required" }, { status: 400 });
            }
            const { CareTask } = await import("@/models/care-task.model");
            const existing = await CareTask.findById(id).select("admissionId").lean() as { admissionId?: unknown } | null;
            if (!existing?.admissionId) {
                return NextResponse.json({ success: false, message: "Instruction not found" }, { status: 404 });
            }
            try {
                await careTaskService.assertActorMayAccessAdmission(existing.admissionId as Types.ObjectId, actor);
            } catch (e: unknown) {
                const err = e as { statusCode?: number; message?: string };
                return NextResponse.json(
                    { success: false, message: err?.message ?? "Forbidden" },
                    { status: err?.statusCode ?? 403 }
                );
            }
            try {
                const data = await careTaskService.transitionTask(id, body.status as CareTaskStatus, actor.userId);
                return NextResponse.json({ success: true, message: "Instruction updated", data }, { status: 200 });
            } catch (e: unknown) {
                const err = e as { statusCode?: number; message?: string };
                return NextResponse.json(
                    { success: false, message: err?.message ?? "Failed to update" },
                    { status: err?.statusCode ?? 500 }
                );
            }
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Failed to update instruction";
            return NextResponse.json({ success: false, message }, { status: 500 });
        }
    }

    // GET /api/care-tasks/my-inpatients — stays visible to the caller
    async myInpatients(request: NextRequest): Promise<NextResponse> {
        try {
            await dbConnect();
            const auth = await authorizeRequest(request, PERMISSION_KEYS.NURSING_TASK_VIEW, "Admission");
            if (!auth.isAuthorized) return auth.response;
            const data = new URL(request.url).searchParams.get("history") === "discharged"
                ? await nursingService.getMyDischargedPatients(actorOf(auth))
                : await nursingService.getMyPatients(auth.filter, actorOf(auth));
            return NextResponse.json({ success: true, data }, { status: 200 });
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Failed to fetch inpatients";
            return NextResponse.json({ success: false, message }, { status: 500 });
        }
    }

    // GET /api/care-tasks/timeline?admissionId= — shared doctor/nurse dossier:
    // instructions + meds (x time got y) + vitals + notes for one stay.
    async timeline(request: NextRequest): Promise<NextResponse> {
        try {
            await dbConnect();
            const auth = await authorizeRequest(request, PERMISSION_KEYS.NURSING_TASK_VIEW, "Admission");
            if (!auth.isAuthorized) return auth.response;
            const actor = actorOf(auth);

            const { searchParams } = new URL(request.url);
            const admissionId = searchParams.get("admissionId");
            if (!admissionId || !Types.ObjectId.isValid(admissionId)) {
                return NextResponse.json({ success: false, message: "Valid admissionId is required" }, { status: 400 });
            }
            let admission;
            try {
                admission = await careTaskService.assertActorMayAccessAdmission(admissionId, actor);
            } catch (e: unknown) {
                const err = e as { statusCode?: number; message?: string };
                return NextResponse.json(
                    { success: false, message: err?.message ?? "Forbidden" },
                    { status: err?.statusCode ?? 403 }
                );
            }
            // Branch isolation for non-global grants.
            if (auth.grant.orgScope === "BRANCH" && auth.context.branchId) {
                const admBranch = (admission as { branchId?: unknown }).branchId;
                const idOf = (v: unknown): string => {
                    const rec = v as { _id?: { toString(): string } };
                    if (rec && typeof rec === "object" && rec !== null && "_id" in rec && rec._id) return rec._id.toString();
                    return String(v ?? "");
                };
                const branchStr = admBranch ? idOf(admBranch) : "";
                if (branchStr && branchStr !== auth.context.branchId.toString()) {
                    return NextResponse.json(
                        { success: false, message: "Forbidden: Admission belongs to another branch" },
                        { status: 403 }
                    );
                }
            }
            const patientId = (admission as { patientId?: unknown }).patientId;
            const hospital = await Admission.findById(admissionId).select("branchId").populate("branchId", "organizationName").lean();
            const [tasks, medications, vitals, notes, visits, orders, handoverHistory] = await Promise.all([
                careTaskService.listForAdmissions([admissionId]),
                nursingService.getMedications(
                    patientId ? new Types.ObjectId((patientId as { toString(): string }).toString()).toString() : undefined,
                    admissionId
                ),
                Vitals.find({ admissionId: new Types.ObjectId(admissionId) })
                    .populate("recordedBy", "name")
                    .sort({ dateRecorded: -1, createdAt: -1 })
                    .lean(),
                ClinicalRecord.find({ admissionId: new Types.ObjectId(admissionId) })
                    .populate("doctor", "name email")
                    .sort({ dateRecorded: -1, createdAt: -1 })
                    .lean(),
                visitService.listVisits(admissionId),
                medicationOrderService.listOrders(admissionId),
                Admission.findById(admissionId)
                    .select("nursingHandoverHistory")
                    .populate("nursingHandoverHistory.fromNurseId", "name")
                    .populate("nursingHandoverHistory.toNurseId", "name")
                    .lean()
                    .then((record) => record?.nursingHandoverHistory ?? []),
            ]);
            const hospitalName = (hospital?.branchId as { organizationName?: string } | undefined)?.organizationName;
            return NextResponse.json({ success: true, data: { tasks, medications, vitals, notes, visits, orders, handoverHistory, currentUserId: auth.context.userId.toString(), hospitalName } }, { status: 200 });
            const admissionDate = new Date((admission as { admissionDate: Date }).admissionDate);
            const withDay = <T,>(items: T[], timeOf: (item: T) => Date) => items.map((item) => ({
                ...recordOf(item),
                dayNumber: stayDayNumber(admissionDate, timeOf(item)),
            }));
            const visitsWithDay = withDay(visits, (item) => {
                const value = recordOf(item);
                return timestampOf(value, "visitedAt", "timestamp", "dateRecorded", "createdAt");
            });
            const tasksWithDay = withDay(tasks, (item) => timestampOf(recordOf(item), "createdAt"));
            const medicationsWithDay = withDay(medications, (item) => timestampOf(recordOf(item), "administeredTime", "scheduledTime", "createdAt"));
            const vitalsWithDay = withDay(vitals, (item) => timestampOf(recordOf(item), "dateRecorded", "createdAt"));
            const notesWithDay = withDay(notes, (item) => timestampOf(recordOf(item), "dateRecorded", "createdAt"));
            const ordersWithDay = withDay(orders, (item) => timestampOf(recordOf(item), "createdAt"));
            const timelineItems: TimelineItem[] = [];
            const pushItem = (kind: TimelineItem["kind"], item: Record<string, unknown>, at: Date, title: string, detail?: string, flag?: string) => {
                timelineItems.push({ id: String(item._id ?? `${kind}-${at.getTime()}-${timelineItems.length}`), kind, at: at.toISOString(), dayNumber: stayDayNumber(admissionDate, at), title, detail, flag });
            };

            for (const raw of visitsWithDay) {
                const item = recordOf(raw);
                const at = timestampOf(item, "visitedAt", "timestamp", "dateRecorded", "createdAt");
                const isAddendum = item.recordType === "Visit Addendum";
                const details = ["notes", "details", "chiefComplaint", "objectiveFindings", "assessment", "plan", "text"]
                    .map((key) => stringOf(item, key).trim()).filter(Boolean).join(" · ");
                pushItem(isAddendum ? "ADDENDUM" : "ROUND", item, at, isAddendum ? "Round addendum" : `${stringOf(item, "visitType") || "Round"}${item.condition ? ` · ${String(item.condition)}` : ""}`, details);
            }
            for (const raw of vitalsWithDay) {
                const item = recordOf(raw);
                const at = timestampOf(item, "dateRecorded", "createdAt");
                const flag = flagVitalForReview(item);
                const detail = [
                    `BP ${String(item.bloodPressure ?? "—")}`,
                    `HR ${String(item.heartRate ?? "—")}`,
                    `SpO₂ ${String(item.oxygenSaturation ?? "—")} %`,
                    `RR ${String(item.respiratoryRate ?? "—")}`,
                    `Temp ${String(item.temperature ?? "—")} °C`,
                ].join(" · ");
                pushItem("VITAL", item, at, "Nurse vitals", detail, flag);
            }
            for (const raw of medicationsWithDay) {
                const item = recordOf(raw);
                const at = timestampOf(item, "administeredTime", "scheduledTime", "createdAt");
                pushItem("DOSE", item, at, `${stringOf(item, "medicationName")} ${stringOf(item, "dosage")}`.trim(), `${String(item.status ?? "PENDING")} · ${stringOf(item, "route")}`);
            }
            for (const raw of notesWithDay) {
                const item = recordOf(raw);
                if (item.recordType !== "Nursing Note") continue;
                const at = timestampOf(item, "dateRecorded", "createdAt");
                const detail = ["chiefComplaint", "objectiveFindings", "assessment", "plan", "details"]
                    .map((key) => stringOf(item, key).trim()).filter(Boolean).join(" · ");
                pushItem("NURSE_NOTE", item, at, stringOf(item, "title") || stringOf(item, "category") || "Nurse note", detail);
            }
            for (const raw of tasksWithDay) {
                const item = recordOf(raw);
                const at = timestampOf(item, "createdAt");
                pushItem("INSTRUCTION", item, at, stringOf(item, "title") || "Nursing instruction", `${String(item.priority ?? "Routine")} · ${String(item.status ?? "NEW")}${stringOf(item, "detail") ? ` · ${stringOf(item, "detail")}` : ""}`);
            }
            timelineItems.sort((left, right) => new Date(right.at).getTime() - new Date(left.at).getTime());
            return NextResponse.json({
                success: true,
                data: {
                    tasks: tasksWithDay,
                    medications: medicationsWithDay,
                    vitals: vitalsWithDay,
                    notes: notesWithDay,
                    visits: visitsWithDay,
                    orders: ordersWithDay,
                    timelineItems,
                    timeZone: HOSPITAL_TIME_ZONE,
                },
            }, { status: 200 });
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Failed to fetch timeline";
            return NextResponse.json({ success: false, message }, { status: 500 });
        }
    }
}

const careTaskController = new CareTaskController();
export default careTaskController;
