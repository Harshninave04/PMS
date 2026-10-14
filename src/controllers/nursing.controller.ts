import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import dbConnect from "@/lib/dbConnect";
import nursingService from "@/services/nursing.service";
import { authorizeRequest } from "@/lib/rbac/guard";
import { PERMISSION_KEYS } from "@/types/rbac";
import { isSuperAdminRole } from "@/lib/rbac/default-permissions";
import { isDoseDue } from "@/lib/medication-schedule";
import Admission from "@/models/admission.model";

function actorOf(auth: { context: { userId: Types.ObjectId; roleName: string; branchId?: Types.ObjectId }; grant: { orgScope: string } }) {
  return {
    userId: auth.context.userId,
    roleName: auth.context.roleName,
    isSuperAdmin: isSuperAdminRole(auth.context.roleName),
    branchId: auth.context.branchId,
    orgScope: auth.grant.orgScope,
  };
}

async function assertMedicationVisible(
  patientId: Types.ObjectId | string,
  admissionId: Types.ObjectId | string | undefined,
  actor: { userId: Types.ObjectId; roleName: string; isSuperAdmin?: boolean }
): Promise<{ admissionId?: Types.ObjectId }> {
  if (actor.isSuperAdmin) return {};
  const role = (actor.roleName ?? "").toUpperCase();
  if (role !== "NURSE" && role !== "DOCTOR") return {};
  const uid = new Types.ObjectId(actor.userId.toString());
  // Resolve the active admission for this patient to check team membership
  // and to auto-link the stay.
  const admissionQuery: Record<string, unknown> = {
    patientId: new Types.ObjectId(patientId.toString()),
    status: { $in: ["ADMITTED", "TRANSFERRED"] },
  };
  if (admissionId) admissionQuery._id = new Types.ObjectId(admissionId.toString());
  const admission = await Admission.findOne(admissionQuery).select("_id patientId doctorId assignedNurses assignedDoctors status").lean();
  if (!admission) {
    throw { statusCode: 403, message: "Forbidden: No active admission for this patient" };
  }
  const idOf = (v: unknown): string => {
    const rec = v as { _id?: { toString(): string } };
    if (rec && typeof rec === "object" && rec !== null && "_id" in rec && rec._id) return rec._id.toString();
    return String(v ?? "");
  };
  const onTeam =
    (admission.assignedNurses ?? []).some((n: unknown) => idOf(n) === uid.toString()) ||
    (admission.assignedDoctors ?? []).some((d: unknown) => idOf(d) === uid.toString()) ||
    idOf(admission.doctorId) === uid.toString();
  if (!onTeam) throw { statusCode: 403, message: "Forbidden: You are not on this patient's care team" };
  return { admissionId: admission._id as Types.ObjectId };
}

export class NursingController {
  // 1. My Inpatients (team-scoped for nurses/doctors)
  async getMyPatients(request: NextRequest): Promise<NextResponse> {
    try {
      await dbConnect();
      const auth = await authorizeRequest(request, PERMISSION_KEYS.NURSING_TASK_VIEW, "Admission");
      if (!auth.isAuthorized) return auth.response;

      const data = await nursingService.getMyPatients(auth.filter, actorOf(auth));
      return NextResponse.json({ success: true, data });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to fetch inpatients";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }

  // 2. Nursing Stats (scoped to visible stays for team roles)
  async getNursingStats(request: NextRequest): Promise<NextResponse> {
    try {
      await dbConnect();
      const auth = await authorizeRequest(request, PERMISSION_KEYS.NURSING_TASK_VIEW, "Admission");
      if (!auth.isAuthorized) return auth.response;

      const data = await nursingService.getNursingStats(actorOf(auth));
      return NextResponse.json({ success: true, data });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to fetch nursing stats";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }

  // 3. Medications (eMAR, team-scoped for nurses/doctors)
  async getMedications(request: NextRequest): Promise<NextResponse> {
    try {
      await dbConnect();
      const auth = await authorizeRequest(request, PERMISSION_KEYS.NURSING_TASK_VIEW, "NursingMedication");
      if (!auth.isAuthorized) return auth.response;

      const { searchParams } = new URL(request.url);
      const patientId = searchParams.get("patientId") || undefined;
      const admissionId = searchParams.get("admissionId") || undefined;
      const actor = actorOf(auth);
      const role = (actor.roleName ?? "").toUpperCase();
      const allowed =
        !actor.isSuperAdmin && (role === "NURSE" || role === "DOCTOR")
          ? await nursingService.getPatientIdsForActor(actor)
          : undefined;
      const data = await nursingService.getMedications(patientId, admissionId, allowed);
      return NextResponse.json({ success: true, data });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to fetch medication records";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }

  async createMedication(request: NextRequest): Promise<NextResponse> {
    try {
      await dbConnect();
      const auth = await authorizeRequest(request, PERMISSION_KEYS.NURSING_TASK_EXECUTE, "NursingMedication");
      if (!auth.isAuthorized) return auth.response;

      const body = await request.json() as Record<string, unknown>;
      if (!body.patient) {
        return NextResponse.json({ success: false, message: "Patient is required" }, { status: 400 });
      }
      const actor = actorOf(auth);
      try {
        const { admissionId } = await assertMedicationVisible(
          body.patient as Types.ObjectId | string,
          body.admissionId as Types.ObjectId | string | undefined,
          actor
        );
        // Attribute authorship server-side; never trust the client.
        body.administeredBy = actor.userId.toString();
        if (admissionId && !body.admissionId) body.admissionId = admissionId.toString();
      } catch (e: unknown) {
        const err = e as { statusCode?: number; message?: string };
        return NextResponse.json(
          { success: false, message: err?.message ?? "Forbidden" },
          { status: err?.statusCode ?? 403 }
        );
      }
      // A dose may be given at or after its scheduled time — never before.
      // A 3pm dose cannot be recorded at 2:59pm; at/after 3pm it is allowed.
      if (body.status === "GIVEN") {
        const scheduled = body.scheduledTime ? new Date(body.scheduledTime as string) : new Date();
        const givenAt = body.administeredTime ? new Date(body.administeredTime as string) : new Date();
        if (!isDoseDue(scheduled, givenAt)) {
          return NextResponse.json(
            { success: false, message: `Too early — this dose is due at ${scheduled.toLocaleString()}` },
            { status: 400 }
          );
        }
      }
      const data = await nursingService.createMedication(body);
      return NextResponse.json({ success: true, data }, { status: 201 });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to create medication record";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }

  async updateMedication(request: NextRequest, id: string): Promise<NextResponse> {
    try {
      await dbConnect();
      const auth = await authorizeRequest(request, PERMISSION_KEYS.NURSING_TASK_EXECUTE, "NursingMedication");
      if (!auth.isAuthorized) return auth.response;

      const body = await request.json() as Record<string, unknown>;
      const actor = actorOf(auth);
      // Stamp the administering nurse; team check on the stored record.
      if (body.status === "GIVEN" && !body.administeredBy) {
        body.administeredBy = actor.userId.toString();
      }
      if (body.status === "GIVEN" && !body.administeredTime) {
        body.administeredTime = new Date().toISOString();
      }
      const role = (actor.roleName ?? "").toUpperCase();
      if (!actor.isSuperAdmin && (role === "NURSE" || role === "DOCTOR")) {
        const { default: NursingMedication } = await import("@/models/nursing-medication.model");
        const existing = await NursingMedication.findById(id).select("patient admissionId").lean() as
          | { patient?: unknown; admissionId?: unknown }
          | null;
        if (!existing?.patient) {
          return NextResponse.json({ success: false, message: "Medication record not found" }, { status: 404 });
        }
        try {
          await assertMedicationVisible(existing.patient as Types.ObjectId, existing.admissionId as Types.ObjectId | undefined, actor);
        } catch (e: unknown) {
          const err = e as { statusCode?: number; message?: string };
          return NextResponse.json(
            { success: false, message: err?.message ?? "Forbidden" },
            { status: err?.statusCode ?? 403 }
          );
        }
      }
      // No early administration for any role: a 3pm dose cannot be marked
      // given before 3pm.
      if (body.status === "GIVEN") {
        const { default: NursingMedication } = await import("@/models/nursing-medication.model");
        const dose = await NursingMedication.findById(id).select("scheduledTime").lean() as
          | { scheduledTime?: Date }
          | null;
        if (dose?.scheduledTime) {
          const givenAt = body.administeredTime ? new Date(body.administeredTime as string) : new Date();
          if (!isDoseDue(new Date(dose.scheduledTime), givenAt)) {
            return NextResponse.json(
              { success: false, message: `Too early — this dose is due at ${new Date(dose.scheduledTime).toLocaleString()}` },
              { status: 400 }
            );
          }
        }
      }
      const data = await nursingService.updateMedication(id, body);
      return NextResponse.json({ success: true, data });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to update medication record";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }

  async deleteMedication(request: NextRequest, id: string): Promise<NextResponse> {
    try {
      await dbConnect();
      const auth = await authorizeRequest(request, PERMISSION_KEYS.NURSING_TASK_CREATE, "NursingMedication");
      if (!auth.isAuthorized) return auth.response;

      const data = await nursingService.deleteMedication(id);
      return NextResponse.json({ success: true, data });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to delete medication record";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }

}

const nursingController = new NursingController();
export default nursingController;
