import { Types } from "mongoose";
import { ClinicalRecord } from "@/models/clinical-record.model";
import Admission from "@/models/admission.model";

const ACTIVE_STATUSES = ["ADMITTED", "TRANSFERRED"];

export interface CreateVisitDto {
    admissionId: Types.ObjectId | string;
    patientId: Types.ObjectId | string;
    visitType?: string;
    condition?: string;
    painScore?: number;
    chiefComplaint?: string;
    objectiveFindings?: string;
    assessment?: string;
    plan?: string;
}

const VISIT_TYPES = ["Round", "Admission Review", "Pre-Discharge", "Emergency"];
const CONDITIONS = ["Improving", "Stable", "Deteriorating", "Critical"];

function idOf(v: unknown): string {
    const rec = v as { _id?: { toString(): string } } | null | undefined;
    if (rec && typeof rec === "object" && "_id" in rec && rec._id) return rec._id.toString();
    return String(v ?? "");
}

export class VisitService {
    async assertActorMayAccessAdmission(
        admissionId: Types.ObjectId | string,
        actor: { userId: Types.ObjectId; roleName: string; isSuperAdmin?: boolean }
    ) {
        const admission = await Admission.findById(new Types.ObjectId(admissionId.toString())).lean();
        if (!admission) throw { statusCode: 404, message: "Admission not found" };
        if (actor.isSuperAdmin) return admission;
        const role = (actor.roleName ?? "").toUpperCase();
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

    async createVisit(data: CreateVisitDto, doctorId: Types.ObjectId | string) {
        if (!data.admissionId || !data.patientId) {
            throw { statusCode: 400, message: "Admission and patient are required" };
        }
        if (!Types.ObjectId.isValid(data.admissionId.toString()) || !Types.ObjectId.isValid(data.patientId.toString())) {
            throw { statusCode: 400, message: "Invalid admission or patient ID" };
        }
        const admission = await Admission.findById(new Types.ObjectId(data.admissionId.toString())).lean();
        if (!admission) throw { statusCode: 404, message: "Admission not found" };
        if (!ACTIVE_STATUSES.includes(admission.status)) {
            throw { statusCode: 400, message: `Cannot record a visit on a ${admission.status} admission` };
        }
        if (idOf(admission.patientId) !== new Types.ObjectId(data.patientId.toString()).toString()) {
            throw { statusCode: 400, message: "Patient does not belong to this admission" };
        }
        if (data.visitType && !VISIT_TYPES.includes(data.visitType)) {
            throw { statusCode: 400, message: "Invalid visit type" };
        }
        if (data.condition && !CONDITIONS.includes(data.condition)) {
            throw { statusCode: 400, message: "Invalid condition" };
        }
        if (data.painScore !== undefined && (Number.isNaN(Number(data.painScore)) || Number(data.painScore) < 0 || Number(data.painScore) > 10)) {
            throw { statusCode: 400, message: "Pain score must be 0–10" };
        }
        if (!data.chiefComplaint?.trim() && !data.assessment?.trim() && !data.objectiveFindings?.trim()) {
            throw { statusCode: 400, message: "Record what you found: complaint, examination or assessment" };
        }
        const record = await ClinicalRecord.create({
            patient: new Types.ObjectId(data.patientId.toString()),
            admissionId: new Types.ObjectId(data.admissionId.toString()),
            doctor: new Types.ObjectId(doctorId.toString()),
            recordType: "Progress Note",
            visitType: data.visitType ?? "Round",
            condition: data.condition,
            painScore: data.painScore !== undefined ? Number(data.painScore) : undefined,
            chiefComplaint: data.chiefComplaint?.trim() || undefined,
            objectiveFindings: data.objectiveFindings?.trim() || undefined,
            assessment: data.assessment?.trim() || undefined,
            plan: data.plan?.trim() || undefined,
            dateRecorded: new Date(),
            status: "Final",
        });
        return record;
    }

    async listVisits(admissionId: Types.ObjectId | string) {
        return await ClinicalRecord.find({
            admissionId: new Types.ObjectId(admissionId.toString()),
            recordType: "Progress Note",
        })
            .populate("doctor", "name")
            .sort({ dateRecorded: -1, createdAt: -1 })
            .lean();
    }
}

const visitService = new VisitService();
export default visitService;
