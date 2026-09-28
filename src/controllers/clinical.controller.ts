import { NextRequest, NextResponse } from "next/server";
import { ClinicalService } from "@/services/clinical.service";
import { authorizeRequest } from "@/lib/rbac/guard";
import { PERMISSION_KEYS } from "@/types/rbac";

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
