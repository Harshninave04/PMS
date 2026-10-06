import { NextRequest, NextResponse } from "next/server";
import { ClinicalService } from "@/services/clinical.service";
import { authorizeRequest } from "@/lib/rbac/guard";
import { PERMISSION_KEYS } from "@/types/rbac";
import { recordAudit, diffRecords } from "@/services/audit.service";
import { AuthenticatedUserContext } from "@/types/rbac";

/**
 * Fills in the fields a client must not choose for itself: the authoring
 * clinician and the branch the record belongs to. Without a branchId on the
 * document there is nothing for a BRANCH-scoped query to filter on.
 */
async function stampClinicalOwnership(
  body: Record<string, unknown>,
  context: AuthenticatedUserContext
): Promise<Record<string, unknown>> {
  const branchId = context.branchId?.toString() ?? context.organizationId?.toString();
  const doctorId = context.doctorProfileId?.toString() ?? context.userId.toString();

  return {
    ...body,
    doctor: doctorId,
    branchId: branchId ?? undefined,
  };
}

export class ClinicalController {
  static async getRecords(req: NextRequest): Promise<NextResponse> {
    try {
      const authResult = await authorizeRequest(req, PERMISSION_KEYS.CLINICAL_RECORD_VIEW, "ClinicalRecord");
      if (!authResult.isAuthorized) return authResult.response;

      const { searchParams } = new URL(req.url);
      const patient = searchParams.get("patient");
      const recordType = searchParams.get("recordType");

      // Always bound the query by the resolved scope; query params only narrow
      // it further. Previously the scope filter was computed then discarded.
      const filter: Record<string, unknown> = { ...(authResult.filter as Record<string, unknown>) };
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
      // Stamp the authoring doctor and the patient's branch from the session.
      const newRecord = await ClinicalService.createRecord(await stampClinicalOwnership(body, authResult.context));
      await recordAudit(authResult.context, {
        action: "CREATE",
        entity: "clinicalrecord",
        entityId: newRecord?._id?.toString(),
        summary: `Clinical record (${body?.recordType ?? "Consultation"}) created`,
      });
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

      const filter: Record<string, unknown> = { ...(authResult.filter as Record<string, unknown>) };
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
      const newDiagnosis = await ClinicalService.createDiagnosis(await stampClinicalOwnership(body, authResult.context));
      await recordAudit(authResult.context, {
        action: "CREATE",
        entity: "diagnosis",
        entityId: newDiagnosis?._id?.toString(),
        summary: `Diagnosis recorded for patient ${body?.patient ?? "unknown"}`,
      });
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

      const filter: Record<string, unknown> = { ...(authResult.filter as Record<string, unknown>) };
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
      // The recording clinician and the branch are taken from the session.
      const newVitals = await ClinicalService.createVitals({
        ...body,
        recordedBy: authResult.context.userId.toString(),
        branchId: authResult.context.branchId?.toString() ?? authResult.context.organizationId?.toString(),
      });
      await recordAudit(authResult.context, {
        action: "CREATE",
        entity: "vitals",
        entityId: newVitals?._id?.toString(),
        summary: `Vitals recorded for patient ${body?.patient ?? "unknown"}`,
      });
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

      const scopeFilter = authResult.filter as Record<string, unknown>;
      const before = await ClinicalService.getRecordById(params.id, scopeFilter);
      if (!before) {
        return NextResponse.json({ success: false, error: "Record not found or outside your scope" }, { status: 404 });
      }

      const body = await req.json();
      const updated = await ClinicalService.updateRecord(params.id, body, scopeFilter);
      if (!updated) {
        return NextResponse.json({ success: false, error: "Record not found or outside your scope" }, { status: 404 });
      }

      await recordAudit(authResult.context, {
        action: "UPDATE",
        entity: "clinicalrecord",
        entityId: params.id,
        summary: `Clinical record updated`,
        changes: diffRecords(
          before as unknown as Record<string, unknown>,
          updated as unknown as Record<string, unknown>
        ),
      });

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

      const scopeFilter = authResult.filter as Record<string, unknown>;
      const before = await ClinicalService.getRecordById(params.id, scopeFilter);
      if (!before) {
        return NextResponse.json({ success: false, error: "Record not found or outside your scope" }, { status: 404 });
      }

      const deleted = await ClinicalService.deleteRecord(params.id, scopeFilter);
      if (!deleted) {
        return NextResponse.json({ success: false, error: "Record not found or outside your scope" }, { status: 404 });
      }

      await recordAudit(authResult.context, {
        action: "DELETE",
        entity: "clinicalrecord",
        entityId: params.id,
        summary: `Clinical record deleted`,
        changes: diffRecords(before as unknown as Record<string, unknown>, null),
      });

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

      const deleted = await ClinicalService.deleteDiagnosis(params.id, authResult.filter as Record<string, unknown>);
      if (!deleted) {
        return NextResponse.json({ success: false, error: "Diagnosis not found or outside your scope" }, { status: 404 });
      }

      await recordAudit(authResult.context, {
        action: "DELETE",
        entity: "diagnosis",
        entityId: params.id,
        summary: "Diagnosis deleted",
      });

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

      const deleted = await ClinicalService.deleteVitals(params.id, authResult.filter as Record<string, unknown>);
      if (!deleted) {
        return NextResponse.json({ success: false, error: "Vitals not found or outside your scope" }, { status: 404 });
      }

      await recordAudit(authResult.context, {
        action: "DELETE",
        entity: "vitals",
        entityId: params.id,
        summary: "Vitals deleted",
      });

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
