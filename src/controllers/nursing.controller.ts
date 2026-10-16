import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import dbConnect from "@/lib/dbConnect";
import nursingService from "@/services/nursing.service";
import { authorizeRequest } from "@/lib/rbac/guard";
import { PERMISSION_KEYS } from "@/types/rbac";
import { isSuperAdminRole } from "@/lib/rbac/default-permissions";
import { isDoseDue } from "@/lib/medication-schedule";
import Admission from "@/models/admission.model";
import User from "@/models/user.model";
import Role from "@/models/role.model";

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
  async getHandoverNurses(request: NextRequest): Promise<NextResponse> {
    try {
      await dbConnect();
      const auth = await authorizeRequest(request, "nursing.patients:update", "Admission");
      if (!auth.isAuthorized) return auth.response;
      if (auth.context.roleName.toUpperCase() !== "NURSE") {
        return NextResponse.json({ success: false, message: "Only assigned nurses can hand over a patient" }, { status: 403 });
      }

      const admissionId = new URL(request.url).searchParams.get("admissionId");
      if (!admissionId || !Types.ObjectId.isValid(admissionId)) {
        return NextResponse.json({ success: false, message: "A valid admission is required" }, { status: 400 });
      }
      const admission = await Admission.findOne({
        ...auth.filter,
        _id: new Types.ObjectId(admissionId),
        status: { $in: ["ADMITTED", "TRANSFERRED"] },
        assignedNurses: auth.context.userId,
      }).select("branchId").lean() as { branchId?: Types.ObjectId } | null;
      if (!admission) {
        return NextResponse.json({ success: false, message: "This patient is not assigned to you or is no longer admitted" }, { status: 403 });
      }

      const nurseRole = await Role.findOne({ role: { $regex: "^NURSE$", $options: "i" } }).select("_id").lean();
      if (!nurseRole) {
        return NextResponse.json({ success: false, message: "Nurse role is not configured" }, { status: 500 });
      }

      const currentUser = await User.findById(auth.context.userId).select("branch organization").lean() as
        | { branch?: Types.ObjectId; organization?: Types.ObjectId }
        | null;
      const branchId = auth.context.branchId || currentUser?.branch || admission.branchId;
      const nurseFilter: Record<string, unknown> = {
        role: nurseRole._id,
        isActive: { $ne: false },
        _id: { $ne: auth.context.userId },
      };
      if (branchId) {
        nurseFilter.$or = [
          { branch: branchId },
          ...(currentUser?.organization
            ? [{ branch: { $in: [null] }, organization: currentUser.organization }]
            : []),
        ];
      } else if (currentUser?.organization) {
        nurseFilter.organization = currentUser.organization;
      }

      const nurses = await User.find(nurseFilter).select("name email").sort({ name: 1 }).lean();
      return NextResponse.json({
        success: true,
        data: {
          nurses: nurses.map((nurse) => ({ id: nurse._id.toString(), name: nurse.name, email: nurse.email })),
        },
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to load available nurses";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }

  async handoverAdmission(request: NextRequest): Promise<NextResponse> {
    try {
      await dbConnect();
      const auth = await authorizeRequest(request, "nursing.patients:update", "Admission");
      if (!auth.isAuthorized) return auth.response;
      if (auth.context.roleName.toUpperCase() !== "NURSE") {
        return NextResponse.json({ success: false, message: "Only an assigned nurse can hand over a patient" }, { status: 403 });
      }

      const body = await request.json() as {
        admissionId?: string;
        receivingNurseId?: string;
        handoverNote?: string;
      };
      const admissionId = body.admissionId?.trim();
      const receivingNurseId = body.receivingNurseId?.trim();
      const handoverNote = body.handoverNote?.trim();
      if (!admissionId || !Types.ObjectId.isValid(admissionId) ||
          !receivingNurseId || !Types.ObjectId.isValid(receivingNurseId)) {
        return NextResponse.json({ success: false, message: "Select a valid patient and receiving nurse" }, { status: 400 });
      }
      if (!handoverNote) {
        return NextResponse.json({ success: false, message: "Enter a handover note before transferring care" }, { status: 400 });
      }
      if (handoverNote.length > 2000) {
        return NextResponse.json({ success: false, message: "Handover note must be 2,000 characters or fewer" }, { status: 400 });
      }

      const admission = await Admission.findOne({
        ...auth.filter,
        _id: new Types.ObjectId(admissionId),
        status: { $in: ["ADMITTED", "TRANSFERRED"] },
        assignedNurses: auth.context.userId,
      }).select("assignedNurses branchId").lean() as
        | { assignedNurses?: Types.ObjectId[]; branchId?: Types.ObjectId }
        | null;
      if (!admission) {
        return NextResponse.json({ success: false, message: "This patient is not assigned to you or is no longer admitted" }, { status: 403 });
      }

      const recipient = await User.findById(receivingNurseId).populate("role", "role").select("name email role isActive branch organization").lean() as
        | {
            _id: Types.ObjectId;
            name?: string;
            role?: { role?: string };
            isActive?: boolean;
            branch?: Types.ObjectId;
            organization?: Types.ObjectId;
          }
        | null;
      if (!recipient || recipient.isActive === false || recipient.role?.role?.toUpperCase() !== "NURSE") {
        return NextResponse.json({ success: false, message: "Choose an active nurse to receive this patient" }, { status: 400 });
      }

      const currentUser = await User.findById(auth.context.userId).select("branch organization").lean() as
        | { branch?: Types.ObjectId; organization?: Types.ObjectId }
        | null;
      const branchId = auth.context.branchId || currentUser?.branch || admission.branchId;
      const recipientMatchesBranch = branchId && recipient.branch?.toString() === branchId.toString();
      const recipientMatchesOrganization =
        !recipient.branch &&
        currentUser?.organization &&
        recipient.organization?.toString() === currentUser.organization.toString();
      if (branchId && !recipientMatchesBranch && !recipientMatchesOrganization) {
        return NextResponse.json({ success: false, message: "Receiving nurse must belong to the same branch" }, { status: 403 });
      }
      if (!branchId && currentUser?.organization &&
          recipient.organization?.toString() !== currentUser.organization.toString()) {
        return NextResponse.json({ success: false, message: "Receiving nurse must belong to the same organization" }, { status: 403 });
      }

      const assignedNurses = (admission.assignedNurses ?? [])
        .map((nurseId) => nurseId.toString())
        .filter((nurseId) => nurseId !== auth.context.userId.toString());
      if (!assignedNurses.includes(recipient._id.toString())) assignedNurses.push(recipient._id.toString());

      const updatedAdmission = await Admission.findOneAndUpdate(
        {
          ...auth.filter,
          _id: new Types.ObjectId(admissionId),
          status: { $in: ["ADMITTED", "TRANSFERRED"] },
          assignedNurses: admission.assignedNurses,
        },
        {
          $set: {
            assignedNurses: assignedNurses.map((nurseId) => new Types.ObjectId(nurseId)),
            careTeamUpdatedAt: new Date(),
            careTeamUpdatedBy: auth.context.userId,
          },
          $push: {
            nursingHandoverHistory: {
              fromNurseId: auth.context.userId,
              toNurseId: recipient._id,
              handoverNote,
              handedOverAt: new Date(),
            },
          },
        },
        { new: true },
      ).select("_id assignedNurses careTeamUpdatedAt").lean();
      if (!updatedAdmission) {
        return NextResponse.json({ success: false, message: "Patient assignment changed before handover completed. Refresh and try again." }, { status: 409 });
      }

      return NextResponse.json({
        success: true,
        message: `Care handed over to ${recipient.name || "the receiving nurse"}`,
        data: updatedAdmission,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to hand over patient";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }

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
