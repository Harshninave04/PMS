import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { ClinicalService } from "@/services/clinical.service";
import { authorizeRequest } from "@/lib/rbac/guard";
import { PERMISSION_KEYS } from "@/types/rbac";
import { ClinicalRecord } from "@/models/clinical-record.model";
import { Diagnosis } from "@/models/diagnosis.model";
import { Vitals } from "@/models/vitals.model";
import Admission from "@/models/admission.model";
import { isNurseRole } from "@/lib/rbac/roles";
import { CLOSED_ADMISSION_NURSING_MESSAGE } from "@/lib/discharge-workflow";
import {
  isDoctorActor,
  getAssignedPatientIds,
  isPatientAssignedToDoctor
} from "@/lib/rbac/doctor-scope";

export class ClinicalController {
  static async getRecords(req: NextRequest): Promise<NextResponse> {
    try {
      const authResult = await authorizeRequest(req, PERMISSION_KEYS.CLINICAL_RECORD_VIEW, "ClinicalRecord");
      if (!authResult.isAuthorized) return authResult.response;

      const { searchParams } = new URL(req.url);
      const patient = searchParams.get("patient");
      const recordType = searchParams.get("recordType");
      const admissionId = searchParams.get("admissionId");

      const filter: Record<string, unknown> = {};
      if (patient) filter.patient = patient;
      if (recordType) filter.recordType = recordType;
      if (admissionId) filter.admissionId = admissionId;

      // Doctor isolation: only records for patients assigned to the doctor
      if (isDoctorActor(authResult.context)) {
        const doctorId = authResult.context.doctorProfileId!;
        if (patient) {
          if (!(await isPatientAssignedToDoctor(doctorId, new Types.ObjectId(patient)))) {
            return NextResponse.json({ success: false, error: "Forbidden: Patient is not assigned to you" }, { status: 403 });
          }
        } else {
          const assigned = await getAssignedPatientIds(doctorId);
          filter.patient = assigned.length > 0 ? { $in: assigned } : [];
        }
      }

      const records = await ClinicalService.getRecords(filter);
      return NextResponse.json({ success: true, data: records });
    } catch (error: unknown) {
      const err = error as { message?: string };
      return NextResponse.json({ success: false, error: err?.message || "Failed to fetch clinical records" }, { status: 500 });
    }
  }

  static async createRecord(req: NextRequest): Promise<NextResponse> {
    try {
      const authResult = await authorizeRequest(req, PERMISSION_KEYS.CLINICAL_RECORD_CREATE, "ClinicalRecord");
      if (!authResult.isAuthorized) return authResult.response;

      const body = await req.json();

      // When linked to a stay, the admission must belong to the patient.
      if (body.admissionId && body.patient) {
        const { default: Admission } = await import("@/models/admission.model");
        const adm = await Admission.findById(body.admissionId).select("patientId").lean() as { patientId?: unknown } | null;
        const idOf = (v: unknown): string => {
          const rec = v as { _id?: { toString(): string } };
          if (rec && typeof rec === "object" && rec !== null && "_id" in rec && rec._id) return rec._id.toString();
          return String(v ?? "");
        };
        if (!adm || idOf(adm.patientId) !== new Types.ObjectId(body.patient.toString()).toString()) {
          return NextResponse.json({ success: false, error: "Admission does not belong to this patient" }, { status: 400 });
        }
      }

      // Doctor isolation: a doctor can only write records for assigned patients,
      // and the record is always attributed to them.
      if (isDoctorActor(authResult.context)) {
        body.doctor = authResult.context.userId.toString();
        if (body.patient &&
            !(await isPatientAssignedToDoctor(
              authResult.context.doctorProfileId!,
              new Types.ObjectId(body.patient.toString())
            ))) {
          return NextResponse.json({ success: false, error: "Forbidden: Record can only be created for patients assigned to you" }, { status: 403 });
        }
      }

      const newRecord = await ClinicalService.createRecord(body);
      return NextResponse.json({ success: true, data: newRecord }, { status: 201 });
    } catch (error: unknown) {
      const err = error as { message?: string };
      return NextResponse.json({ success: false, error: err?.message || "Failed to create clinical record" }, { status: 400 });
    }
  }

  static async getDiagnoses(req: NextRequest): Promise<NextResponse> {
    try {
      const authResult = await authorizeRequest(req, PERMISSION_KEYS.CLINICAL_DIAGNOSIS_VIEW, "ClinicalRecord");
      if (!authResult.isAuthorized) return authResult.response;

      const { searchParams } = new URL(req.url);
      const patient = searchParams.get("patient");

      const filter: Record<string, unknown> = {};
      if (patient) filter.patient = patient;

      // Doctor isolation: only diagnoses for patients assigned to the doctor
      if (isDoctorActor(authResult.context)) {
        const doctorId = authResult.context.doctorProfileId!;
        if (patient) {
          if (!(await isPatientAssignedToDoctor(doctorId, new Types.ObjectId(patient)))) {
            return NextResponse.json({ success: false, error: "Forbidden: Patient is not assigned to you" }, { status: 403 });
          }
        } else {
          const assigned = await getAssignedPatientIds(doctorId);
          filter.patient = assigned.length > 0 ? { $in: assigned } : [];
        }
      }

      const diagnoses = await ClinicalService.getDiagnoses(filter);
      return NextResponse.json({ success: true, data: diagnoses });
    } catch (error: unknown) {
      const err = error as { message?: string };
      return NextResponse.json({ success: false, error: err?.message || "Failed to fetch diagnoses" }, { status: 500 });
    }
  }

  static async createDiagnosis(req: NextRequest): Promise<NextResponse> {
    try {
      const authResult = await authorizeRequest(req, PERMISSION_KEYS.CLINICAL_DIAGNOSIS_CREATE, "ClinicalRecord");
      if (!authResult.isAuthorized) return authResult.response;

      const body = await req.json();

      // Doctor isolation: diagnosed patients must be assigned to the doctor
      if (isDoctorActor(authResult.context)) {
        body.doctor = authResult.context.userId.toString();
        if (body.patient &&
            !(await isPatientAssignedToDoctor(
              authResult.context.doctorProfileId!,
              new Types.ObjectId(body.patient.toString())
            ))) {
          return NextResponse.json({ success: false, error: "Forbidden: Diagnosis can only be created for patients assigned to you" }, { status: 403 });
        }
      }

      const newDiagnosis = await ClinicalService.createDiagnosis(body);
      return NextResponse.json({ success: true, data: newDiagnosis }, { status: 201 });
    } catch (error: unknown) {
      const err = error as { message?: string };
      return NextResponse.json({ success: false, error: err?.message || "Failed to create diagnosis" }, { status: 400 });
    }
  }

  static async getVitals(req: NextRequest): Promise<NextResponse> {
    try {
      const authResult = await authorizeRequest(req, PERMISSION_KEYS.NURSING_VITALS_VIEW, "ClinicalRecord");
      if (!authResult.isAuthorized) return authResult.response;

      const { searchParams } = new URL(req.url);
      const patient = searchParams.get("patient");
      const admissionId = searchParams.get("admissionId");

      const filter: Record<string, unknown> = {};
      if (patient) filter.patient = patient;
      if (admissionId) filter.admissionId = admissionId;

      if (isNurseRole(authResult.context.roleName)) {
        const stayQuery: Record<string, unknown> = {
          ...authResult.filter,
          status: { $in: ["ADMITTED", "TRANSFERRED", "DISCHARGED"] },
          assignedNurses: authResult.context.userId,
        };
        if (admissionId) {
          if (!Types.ObjectId.isValid(admissionId)) {
            return NextResponse.json({ success: false, error: "Invalid admission ID" }, { status: 400 });
          }
          stayQuery._id = new Types.ObjectId(admissionId);
        }
        if (patient) {
          if (!Types.ObjectId.isValid(patient)) return NextResponse.json({ success: false, error: "Invalid patient ID" }, { status: 400 });
          stayQuery.patientId = new Types.ObjectId(patient);
        }
        const stays = await Admission.find(stayQuery).select("_id").lean();
        if (admissionId && stays.length === 0) {
          return NextResponse.json({ success: false, error: "Forbidden: Admission is outside your care team or branch" }, { status: 403 });
        }
        filter.admissionId = { $in: stays.map((stay) => stay._id) };
      }

      // Doctor isolation: only vitals for patients assigned to the doctor
      if (isDoctorActor(authResult.context)) {
        const doctorId = authResult.context.doctorProfileId!;
        if (patient) {
          if (!(await isPatientAssignedToDoctor(doctorId, new Types.ObjectId(patient)))) {
            return NextResponse.json({ success: false, error: "Forbidden: Patient is not assigned to you" }, { status: 403 });
          }
        } else {
          const assigned = await getAssignedPatientIds(doctorId);
          filter.patient = assigned.length > 0 ? { $in: assigned } : [];
        }
      }

      const vitals = await ClinicalService.getVitals(filter);
      return NextResponse.json({ success: true, data: vitals });
    } catch (error: unknown) {
      const err = error as { message?: string };
      return NextResponse.json({ success: false, error: err?.message || "Failed to fetch vitals" }, { status: 500 });
    }
  }

  static async createVitals(req: NextRequest): Promise<NextResponse> {
    try {
      const authResult = await authorizeRequest(req, PERMISSION_KEYS.NURSING_VITALS_CREATE, "ClinicalRecord");
      if (!authResult.isAuthorized) return authResult.response;

      const body = await req.json();

      if (isNurseRole(authResult.context.roleName) && (!body.admissionId || !body.patient)) {
        return NextResponse.json({ success: false, error: "A valid assigned admission is required for nursing vitals" }, { status: 400 });
      }
      if (body.admissionId && !body.patient) {
        return NextResponse.json({ success: false, error: "Patient is required when vitals are linked to an admission" }, { status: 400 });
      }

      if (body.admissionId || (isNurseRole(authResult.context.roleName) && body.patient)) {
        if (body.admissionId && !Types.ObjectId.isValid(String(body.admissionId))) {
          return NextResponse.json({ success: false, error: "Invalid admission ID" }, { status: 400 });
        }
        if (body.patient && !Types.ObjectId.isValid(String(body.patient))) {
          return NextResponse.json({ success: false, error: "Invalid patient ID" }, { status: 400 });
        }
        const query: Record<string, unknown> = {
          ...authResult.filter,
          patientId: new Types.ObjectId(body.patient.toString()),
          status: { $in: ["ADMITTED", "TRANSFERRED"] },
        };
        if (body.admissionId) query._id = new Types.ObjectId(body.admissionId.toString());
        if (isNurseRole(authResult.context.roleName)) query.assignedNurses = authResult.context.userId;
        const adm = await Admission.findOne(query).select("_id patientId").lean();
        if (!adm) {
          if (body.admissionId) {
            const closed = await Admission.findOne({
              ...authResult.filter,
              _id: new Types.ObjectId(body.admissionId.toString()),
              patientId: new Types.ObjectId(body.patient.toString()),
              status: "DISCHARGED",
              ...(isNurseRole(authResult.context.roleName) ? { assignedNurses: authResult.context.userId } : {}),
            }).select("_id").lean();
            if (closed) {
              return NextResponse.json({ success: false, error: CLOSED_ADMISSION_NURSING_MESSAGE }, { status: 409 });
            }
          }
          return NextResponse.json({ success: false, error: "Admission is not active or does not belong to this care team" }, { status: 403 });
        }
        body.admissionId = adm._id.toString();
      }

      // Doctor isolation: vitals recorded by a doctor are attributed to them
      // and only allowed for their assigned patients
      if (isDoctorActor(authResult.context)) {
        body.recordedBy = authResult.context.userId.toString();
        if (body.patient &&
            !(await isPatientAssignedToDoctor(
              authResult.context.doctorProfileId!,
              new Types.ObjectId(body.patient.toString())
            ))) {
          return NextResponse.json({ success: false, error: "Forbidden: Vitals can only be created for patients assigned to you" }, { status: 403 });
        }
      }

      const newVitals = await ClinicalService.createVitals(body);
      return NextResponse.json({ success: true, data: newVitals }, { status: 201 });
    } catch (error: unknown) {
      const err = error as { message?: string };
      return NextResponse.json({ success: false, error: err?.message || "Failed to create vitals" }, { status: 400 });
    }
  }

  static async updateRecord(req: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> {
    try {
      const authResult = await authorizeRequest(req, PERMISSION_KEYS.CLINICAL_RECORD_UPDATE, "ClinicalRecord");
      if (!authResult.isAuthorized) return authResult.response;

      const body = await req.json();

      const record = await ClinicalRecord.findById(params.id).select("recordType doctor").lean();
      if (!record) return NextResponse.json({ success: false, error: "Clinical record not found" }, { status: 404 });
      if (record.recordType === "Progress Note" || record.recordType === "Visit Addendum") {
        return NextResponse.json({ success: false, error: "Round notes are immutable. Append an addendum instead." }, { status: 409 });
      }

      // Doctor isolation: a doctor can only edit their own clinical records
      if (isDoctorActor(authResult.context)) {
        if (record.doctor?.toString() !== authResult.context.userId.toString()) {
          return NextResponse.json({ success: false, error: "Forbidden: You can only edit your own clinical records" }, { status: 403 });
        }
      }

      const updated = await ClinicalService.updateRecord(params.id, body);
      return NextResponse.json({ success: true, data: updated });
    } catch (error: unknown) {
      const err = error as { message?: string };
      return NextResponse.json({ success: false, error: err?.message || "Failed to update clinical record" }, { status: 400 });
    }
  }

  static async deleteRecord(req: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> {
    try {
      const authResult = await authorizeRequest(req, PERMISSION_KEYS.CLINICAL_RECORD_UPDATE, "ClinicalRecord");
      if (!authResult.isAuthorized) return authResult.response;

      const record = await ClinicalRecord.findById(params.id).select("recordType doctor").lean();
      if (!record) return NextResponse.json({ success: false, error: "Clinical record not found" }, { status: 404 });
      if (record.recordType === "Progress Note" || record.recordType === "Visit Addendum") {
        return NextResponse.json({ success: false, error: "Round notes are immutable. Append an addendum instead." }, { status: 409 });
      }

      // Doctor isolation: a doctor can only delete their own clinical records
      if (isDoctorActor(authResult.context)) {
        if (record.doctor?.toString() !== authResult.context.userId.toString()) {
          return NextResponse.json({ success: false, error: "Forbidden: You can only delete your own clinical records" }, { status: 403 });
        }
      }

      const deleted = await ClinicalService.deleteRecord(params.id);
      return NextResponse.json({ success: true, data: deleted });
    } catch (error: unknown) {
      const err = error as { message?: string };
      return NextResponse.json({ success: false, error: err?.message || "Failed to delete clinical record" }, { status: 400 });
    }
  }

  static async deleteDiagnosis(req: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> {
    try {
      const authResult = await authorizeRequest(req, PERMISSION_KEYS.CLINICAL_DIAGNOSIS_CREATE, "ClinicalRecord");
      if (!authResult.isAuthorized) return authResult.response;

      // Doctor isolation: a doctor can only delete their own diagnoses
      if (isDoctorActor(authResult.context)) {
        const diag = await Diagnosis.findById(params.id).select("doctor").lean();
        if (!diag || diag.doctor?.toString() !== authResult.context.userId.toString()) {
          return NextResponse.json({ success: false, error: "Forbidden: You can only delete your own diagnoses" }, { status: 403 });
        }
      }

      const deleted = await ClinicalService.deleteDiagnosis(params.id);
      return NextResponse.json({ success: true, data: deleted });
    } catch (error: unknown) {
      const err = error as { message?: string };
      return NextResponse.json({ success: false, error: err?.message || "Failed to delete diagnosis" }, { status: 400 });
    }
  }

  static async deleteVitals(req: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> {
    try {
      const authResult = await authorizeRequest(req, PERMISSION_KEYS.NURSING_VITALS_UPDATE, "ClinicalRecord");
      if (!authResult.isAuthorized) return authResult.response;

      const vitalsRecord = await Vitals.findById(params.id).select("recordedBy admissionId").lean();
      if (!vitalsRecord) return NextResponse.json({ success: false, error: "Vitals record not found" }, { status: 404 });
      if (vitalsRecord.admissionId) {
        const admissionQuery: Record<string, unknown> = {
          ...authResult.filter,
          _id: vitalsRecord.admissionId,
        };
        if (isNurseRole(authResult.context.roleName)) admissionQuery.assignedNurses = authResult.context.userId;
        const stay = await Admission.findOne(admissionQuery).select("status").lean();
        if (!stay) return NextResponse.json({ success: false, error: "Forbidden: Vitals are outside your admission or branch scope" }, { status: 403 });
        if (stay.status === "DISCHARGED") {
          return NextResponse.json({ success: false, error: CLOSED_ADMISSION_NURSING_MESSAGE }, { status: 409 });
        }
      } else if (isNurseRole(authResult.context.roleName)) {
        return NextResponse.json({ success: false, error: "A linked active admission is required to update nursing vitals" }, { status: 403 });
      }

      // Doctor isolation: a doctor can only delete their own vitals entries
      if (isDoctorActor(authResult.context)) {
        if (vitalsRecord.recordedBy?.toString() !== authResult.context.userId.toString()) {
          return NextResponse.json({ success: false, error: "Forbidden: You can only delete your own vitals entries" }, { status: 403 });
        }
      }

      const deleted = await ClinicalService.deleteVitals(params.id);
      return NextResponse.json({ success: true, data: deleted });
    } catch (error: unknown) {
      const err = error as { message?: string };
      return NextResponse.json({ success: false, error: err?.message || "Failed to delete vitals" }, { status: 400 });
    }
  }

  static async getClinicalStats(req: NextRequest): Promise<NextResponse> {
    try {
      const authResult = await authorizeRequest(req, PERMISSION_KEYS.CLINICAL_RECORD_VIEW, "ClinicalRecord");
      if (!authResult.isAuthorized) return authResult.response;

      const stats = await ClinicalService.getClinicalStats();
      return NextResponse.json({ success: true, data: stats });
    } catch (error: unknown) {
      const err = error as { message?: string };
      return NextResponse.json({ success: false, error: err?.message || "Failed to fetch clinical stats" }, { status: 500 });
    }
  }
}
