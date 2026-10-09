import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { ClinicalService } from "@/services/clinical.service";
import { authorizeRequest } from "@/lib/rbac/guard";
import { PERMISSION_KEYS } from "@/types/rbac";
import { ClinicalRecord } from "@/models/clinical-record.model";
import { Diagnosis } from "@/models/diagnosis.model";
import { Vitals } from "@/models/vitals.model";
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

      const filter: Record<string, unknown> = {};
      if (patient) filter.patient = patient;
      if (recordType) filter.recordType = recordType;

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

      const filter: Record<string, unknown> = {};
      if (patient) filter.patient = patient;

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

      // Doctor isolation: a doctor can only edit their own clinical records
      if (isDoctorActor(authResult.context)) {
        const record = await ClinicalRecord.findById(params.id).select("doctor").lean();
        if (!record || record.doctor?.toString() !== authResult.context.userId.toString()) {
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

      // Doctor isolation: a doctor can only delete their own clinical records
      if (isDoctorActor(authResult.context)) {
        const record = await ClinicalRecord.findById(params.id).select("doctor").lean();
        if (!record || record.doctor?.toString() !== authResult.context.userId.toString()) {
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

      // Doctor isolation: a doctor can only delete their own vitals entries
      if (isDoctorActor(authResult.context)) {
        const vitals = await Vitals.findById(params.id).select("recordedBy").lean();
        if (!vitals || vitals.recordedBy?.toString() !== authResult.context.userId.toString()) {
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
