import { Types } from "mongoose";
import { CareTask, canTransitionCareTask, type CareTaskStatus } from "@/models/care-task.model";
import Admission from "@/models/admission.model";
import { CreateCareTaskDto } from "@/dto/care-task.dto";

const ACTIVE_STATUSES = ["ADMITTED", "TRANSFERRED"];

function idOf(v: unknown): string {
    const rec = v as { _id?: { toString(): string } } | null | undefined;
    if (rec && typeof rec === "object" && "_id" in rec && rec._id) return rec._id.toString();
    return String(v ?? "");
}

export class CareTaskService {
    async assertActorMayAccessAdmission(
        admissionId: Types.ObjectId | string,
        actor: { userId: Types.ObjectId; roleName: string; isSuperAdmin?: boolean }
    ) {
        const admission = await Admission.findById(new Types.ObjectId(admissionId.toString())).lean();
        if (!admission) throw { statusCode: 404, message: "Admission not found" };
        if (actor.isSuperAdmin) return admission;
        const role = (actor.roleName ?? "").toUpperCase();
        // Admins, receptionists and accountants see all stays in their branch
        // (branch check happens in the controller). Team scoping applies to
        // doctors and nurses only.
        if (role === "ADMIN" || role === "RECEPTIONIST" || role === "ACCOUNTANT" || role === "PHARMACIST") {
            return admission;
        }
        const uid = actor.userId.toString();
        const onTeam =
            (admission.assignedNurses ?? []).some((n: unknown) => idOf(n) === uid) ||
            (admission.assignedDoctors ?? []).some((d: unknown) => idOf(d) === uid) ||
            idOf(admission.doctorId) === uid;
        if (!onTeam) throw { statusCode: 403, message: "Forbidden: You are not on this patient's care team" };
        return admission;
    }

    async createTask(
        data: CreateCareTaskDto,
        authorId: Types.ObjectId | string
    ) {
        if (!data.admissionId || !data.patientId || !data.title?.trim()) {
            throw { statusCode: 400, message: "Admission, patient and instruction title are required" };
        }
        if (!Types.ObjectId.isValid(data.admissionId.toString()) || !Types.ObjectId.isValid(data.patientId.toString())) {
            throw { statusCode: 400, message: "Invalid admission or patient ID" };
        }
        const admission = await Admission.findById(new Types.ObjectId(data.admissionId.toString())).lean();
        if (!admission) throw { statusCode: 404, message: "Admission not found" };
        if (!ACTIVE_STATUSES.includes(admission.status)) {
            throw { statusCode: 400, message: `Cannot add instructions to a ${admission.status} admission` };
        }
        if (idOf(admission.patientId) !== new Types.ObjectId(data.patientId.toString()).toString()) {
            throw { statusCode: 400, message: "Patient does not belong to this admission" };
        }
        const priority = (data.priority ?? "Routine").toString();
        if (!["Routine", "Urgent", "STAT"].includes(priority)) {
            throw { statusCode: 400, message: "Invalid priority" };
        }
        const doc = await CareTask.create({
            admissionId: new Types.ObjectId(data.admissionId.toString()),
            patientId: new Types.ObjectId(data.patientId.toString()),
            authorId: new Types.ObjectId(authorId.toString()),
            title: data.title.trim(),
            detail: data.detail?.trim() || undefined,
            priority,
            status: "NEW",
            dueAt: data.dueAt ? new Date(data.dueAt) : undefined,
        });
        return doc;
    }

    async listTasks(filter: Record<string, unknown> = {}) {
        return await CareTask.find(filter)
            .populate("authorId", "name email")
            .populate("acknowledgedBy", "name")
            .populate("completedBy", "name")
            .populate("patientId", "name uhid")
            .sort({ createdAt: -1 })
            .lean();
    }

    async listForAdmissions(admissionIds: Array<Types.ObjectId | string>, status?: string) {
        const filter: Record<string, unknown> = {
            admissionId: { $in: admissionIds.map((id) => new Types.ObjectId(id.toString())) },
        };
        if (status && status !== "ALL") filter.status = status;
        return await this.listTasks(filter);
    }

    async transitionTask(
        id: Types.ObjectId | string,
        to: CareTaskStatus,
        actorId: Types.ObjectId | string
    ) {
        const task = await CareTask.findById(new Types.ObjectId(id.toString()));
        if (!task) throw { statusCode: 404, message: "Instruction not found" };
        const from = task.status as CareTaskStatus;
        if (from === to) return task;
        if (!canTransitionCareTask(from, to)) {
            throw { statusCode: 400, message: `Cannot move instruction from ${from} to ${to}` };
        }
        task.status = to;
        const now = new Date();
        const actorObjectId = new Types.ObjectId(actorId.toString());
        if (to === "ACKNOWLEDGED" || to === "IN_PROGRESS") {
            if (!task.acknowledgedAt) {
                task.acknowledgedAt = now;
                task.acknowledgedBy = actorObjectId;
            }
        }
        if (to === "COMPLETED") {
            task.completedAt = now;
            task.completedBy = actorObjectId;
        }
        await task.save();
        return task;
    }
}

const careTaskService = new CareTaskService();
export default careTaskService;
