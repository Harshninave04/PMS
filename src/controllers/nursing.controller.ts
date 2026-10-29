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
import DailyNursingRecord from "@/models/daily-nursing-record.model";
import NursingMedicalSupply, { NURSING_SUPPLY_CATEGORIES } from "@/models/nursing-medical-supply.model";
import NursingMedication from "@/models/nursing-medication.model";
import { calculateHospitalDay } from "@/lib/hospital-time";
import { isNurseRole } from "@/lib/rbac/roles";
import { CLOSED_ADMISSION_NURSING_MESSAGE } from "@/lib/discharge-workflow";

function actorOf(auth: { context: { userId: Types.ObjectId; roleName: string; branchId?: Types.ObjectId }; grant: { orgScope: string } }) {
  return {
    userId: auth.context.userId,
    roleName: auth.context.roleName,
    isSuperAdmin: isSuperAdminRole(auth.context.roleName),
    branchId: auth.context.branchId,
    orgScope: auth.grant.orgScope,
  };
}

class NursingAdmissionDateError extends Error {}

function getAdmissionHospitalDay(admission: {
  admissionDate?: Date | string;
  dischargeDate?: Date | string;
  status?: string;
}, now = new Date()) {
  const admissionDate = admission.admissionDate instanceof Date
    ? admission.admissionDate
    : new Date(admission.admissionDate ?? "");
  if (!Number.isFinite(admissionDate.getTime())) {
    throw new NursingAdmissionDateError("A valid admission date is required to calculate the hospital day");
  }

  let referenceDate = now;
  if (admission.status === "DISCHARGED" && admission.dischargeDate) {
    referenceDate = admission.dischargeDate instanceof Date
      ? admission.dischargeDate
      : new Date(admission.dischargeDate);
    if (!Number.isFinite(referenceDate.getTime())) {
      throw new NursingAdmissionDateError("The discharge date is invalid");
    }
  }

  try {
    const calculated = calculateHospitalDay(admissionDate, referenceDate);
    return {
      currentDay: calculated.day,
      admissionDate: calculated.admissionDate,
      hospitalDate: calculated.hospitalDate,
      active: admission.status === "ADMITTED" || admission.status === "TRANSFERRED",
    };
  } catch (error) {
    if (error instanceof RangeError) throw new NursingAdmissionDateError(error.message);
    throw error;
  }
}

function hospitalDayError(error: unknown, fallback: string): NextResponse {
  const message = error instanceof Error ? error.message : fallback;
  return NextResponse.json(
    { success: false, message },
    { status: error instanceof NursingAdmissionDateError ? 409 : 500 },
  );
}

async function assertMedicationVisible(
  patientId: Types.ObjectId | string,
  admissionId: Types.ObjectId | string | undefined,
    actor: { userId: Types.ObjectId; roleName: string; isSuperAdmin?: boolean; branchId?: Types.ObjectId; orgScope?: string }
): Promise<{ admissionId?: Types.ObjectId }> {
  const branchFilter = actor.branchId && actor.orgScope === "BRANCH" && !actor.isSuperAdmin
    ? { branchId: actor.branchId }
    : {};
  if (admissionId && Types.ObjectId.isValid(admissionId.toString())) {
    const linkedAdmission = await Admission.findOne({ _id: admissionId, ...branchFilter }).select("patientId status").lean();
    if (!linkedAdmission) throw { statusCode: 403, message: "Forbidden: This admission is outside your branch" };
    if (linkedAdmission && linkedAdmission.patientId.toString() !== patientId.toString()) {
      throw { statusCode: 409, message: "Medication record does not belong to this admission" };
    }
    if (linkedAdmission?.status === "DISCHARGED") {
      throw { statusCode: 409, message: CLOSED_ADMISSION_NURSING_MESSAGE };
    }
  }
  if (actor.isSuperAdmin) return {};
  const role = (actor.roleName ?? "").toUpperCase();
  if (!isNurseRole(role) && role !== "DOCTOR") return {};
  const uid = new Types.ObjectId(actor.userId.toString());
  // Resolve the active admission for this patient to check team membership
  // and to auto-link the stay.
  const admissionQuery: Record<string, unknown> = {
    ...branchFilter,
    patientId: new Types.ObjectId(patientId.toString()),
    status: { $in: ["ADMITTED", "TRANSFERRED"] },
  };
  if (admissionId) admissionQuery._id = new Types.ObjectId(admissionId.toString());
  const admission = await Admission.findOne(admissionQuery).select("_id patientId doctorId assignedNurses assignedDoctors status").lean();
  if (!admission) {
    if (admissionId) {
      const closed = await Admission.findOne({
        _id: new Types.ObjectId(admissionId.toString()),
        patientId: new Types.ObjectId(patientId.toString()),
        status: "DISCHARGED",
      }).select("_id doctorId assignedNurses assignedDoctors").lean();
      if (closed) {
        const onClosedStay =
          (closed.assignedNurses ?? []).some((n: unknown) => String((n as { _id?: unknown })?._id ?? n) === uid.toString()) ||
          (closed.assignedDoctors ?? []).some((d: unknown) => String((d as { _id?: unknown })?._id ?? d) === uid.toString()) ||
          String((closed.doctorId as { _id?: unknown })?._id ?? closed.doctorId) === uid.toString();
        if (onClosedStay) {
          throw { statusCode: 409, message: CLOSED_ADMISSION_NURSING_MESSAGE };
        }
      }
    }
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

async function assertAssignedNursingAdmission(
  admissionId: string,
  patientId: string | undefined,
    auth: Awaited<ReturnType<typeof authorizeRequest>>,
    allowDischargedReadOnly = false,
) {
  if (!Types.ObjectId.isValid(admissionId) || (patientId && !Types.ObjectId.isValid(patientId))) {
    throw { statusCode: 400, message: "A valid admission and patient are required" };
  }
  if (!auth.isAuthorized) throw { statusCode: 403, message: "Forbidden" };
  const query: Record<string, unknown> = {
    ...auth.filter,
    _id: new Types.ObjectId(admissionId),
    status: allowDischargedReadOnly
      ? { $in: ["ADMITTED", "TRANSFERRED", "DISCHARGED"] }
      : { $in: ["ADMITTED", "TRANSFERRED"] },
  };
  if (patientId) query.patientId = new Types.ObjectId(patientId);
  // A nurse is always constrained to the assigned care team, even if a broad
  // role grant is accidentally configured.
  if (isNurseRole(auth.context.roleName)) query.assignedNurses = auth.context.userId;
  const admission = await Admission.findOne(query)
    .populate("patientId", "name uhid")
    .populate("doctorId", "name")
    .populate({ path: "bedId", populate: { path: "roomId", populate: { path: "wardId" } } })
    .lean();
  if (!admission) {
    const closed = await Admission.findOne({ ...query, status: "DISCHARGED" }).select("_id").lean();
    if (closed) {
      throw { statusCode: 409, message: CLOSED_ADMISSION_NURSING_MESSAGE };
    }
    throw { statusCode: 403, message: "This patient is not assigned to you or is no longer admitted" };
  }
  return admission;
}

export class NursingController {
  async getHandoverNurses(request: NextRequest): Promise<NextResponse> {
    try {
      await dbConnect();
      const auth = await authorizeRequest(request, "nursing.patients:update", "Admission");
      if (!auth.isAuthorized) return auth.response;
      if (!isNurseRole(auth.context.roleName)) {
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

      const nurseRoles = await Role.find({ role: { $regex: "NURSE", $options: "i" } }).select("_id").lean();
      if (nurseRoles.length === 0) {
        return NextResponse.json({ success: false, message: "Nurse role is not configured" }, { status: 500 });
      }

      const currentUser = await User.findById(auth.context.userId).select("branch organization").lean() as
        | { branch?: Types.ObjectId; organization?: Types.ObjectId }
        | null;
      const branchId = auth.context.branchId || currentUser?.branch || admission.branchId;
      const nurseFilter: Record<string, unknown> = {
        role: { $in: nurseRoles.map((role) => role._id) },
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
      if (!isNurseRole(auth.context.roleName)) {
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
      if (!recipient || recipient.isActive === false || !isNurseRole(recipient.role?.role)) {
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

      const data = new URL(request.url).searchParams.get("history") === "discharged"
        ? await nursingService.getMyDischargedPatients(actorOf(auth))
        : await nursingService.getMyPatients(auth.filter, actorOf(auth));
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
        !actor.isSuperAdmin && (isNurseRole(role) || role === "DOCTOR")
          ? await nursingService.getPatientIdsForActor(actor)
          : undefined;
      let effectiveAllowed = allowed;
      if (admissionId && !actor.isSuperAdmin && (isNurseRole(role) || role === "DOCTOR")) {
        if (!Types.ObjectId.isValid(admissionId)) {
          return NextResponse.json({ success: false, message: "Invalid admission ID" }, { status: 400 });
        }
        const stayQuery: Record<string, unknown> = { ...auth.filter, _id: new Types.ObjectId(admissionId) };
        if (isNurseRole(role)) stayQuery.assignedNurses = auth.context.userId;
        else stayQuery.$or = [{ doctorId: auth.context.userId }, { assignedDoctors: auth.context.userId }];
        const stay = await Admission.findOne(stayQuery).select("patientId").lean();
        if (!stay || (patientId && stay.patientId.toString() !== patientId)) {
          return NextResponse.json({ success: false, message: "Forbidden: Admission is outside your care team or branch" }, { status: 403 });
        }
        effectiveAllowed = [stay.patientId];
      }
      const data = await nursingService.getMedications(patientId, admissionId, effectiveAllowed);
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
      if (!Types.ObjectId.isValid(id)) return NextResponse.json({ success: false, message: "Invalid medication record ID" }, { status: 400 });
      const { default: NursingMedication } = await import("@/models/nursing-medication.model");
      const existing = await NursingMedication.findById(id).select("patient admissionId scheduledTime").lean() as
        | { patient?: Types.ObjectId; admissionId?: Types.ObjectId; scheduledTime?: Date }
        | null;
      if (!existing?.patient) return NextResponse.json({ success: false, message: "Medication record not found" }, { status: 404 });
      try {
        await assertMedicationVisible(existing.patient, existing.admissionId, actor);
      } catch (error: unknown) {
        const err = error as { statusCode?: number; message?: string };
        return NextResponse.json({ success: false, message: err.message }, { status: err.statusCode ?? 403 });
      }

      const patch: Record<string, unknown> = {};
      for (const key of ["status", "administeredTime", "withheldReason", "notes"] as const) {
        if (body[key] !== undefined) patch[key] = body[key];
      }
      if (body.status !== undefined && !["GIVEN", "PENDING", "WITHHELD", "REFUSED"].includes(String(body.status))) {
        return NextResponse.json({ success: false, message: "Invalid medication administration status" }, { status: 400 });
      }
      // Stamp the administering nurse; team check on the stored record.
      if (body.status === "GIVEN" && !body.administeredBy) {
        patch.administeredBy = actor.userId.toString();
      }
      if (body.status === "GIVEN" && !body.administeredTime) {
        patch.administeredTime = new Date().toISOString();
      }
      // No early administration for any role: a 3pm dose cannot be marked
      // given before 3pm.
      if (body.status === "GIVEN") {
        if (existing.scheduledTime) {
          const givenAt = body.administeredTime ? new Date(body.administeredTime as string) : new Date();
          if (!isDoseDue(new Date(existing.scheduledTime), givenAt)) {
            return NextResponse.json(
              { success: false, message: `Too early — this dose is due at ${new Date(existing.scheduledTime).toLocaleString()}` },
              { status: 400 }
            );
          }
        }
      }
      const data = await nursingService.updateMedication(id, patch);
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

      if (!Types.ObjectId.isValid(id)) {
        return NextResponse.json({ success: false, message: "Invalid medication record ID" }, { status: 400 });
      }
      const existing = await NursingMedication.findById(id).select("patient admissionId").lean();
      if (!existing) return NextResponse.json({ success: false, message: "Medication record not found" }, { status: 404 });
      try {
        await assertMedicationVisible(
          existing.patient as Types.ObjectId,
          existing.admissionId as Types.ObjectId | undefined,
          {
            userId: auth.context.userId,
            roleName: auth.context.roleName,
            isSuperAdmin: isSuperAdminRole(auth.context.roleName),
            branchId: auth.context.branchId,
            orgScope: auth.grant.orgScope,
          },
        );
      } catch (error: unknown) {
        const err = error as { statusCode?: number; message?: string };
        return NextResponse.json({ success: false, message: err.message }, { status: err.statusCode ?? 403 });
      }

      const data = await nursingService.deleteMedication(id);
      return NextResponse.json({ success: true, data });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to delete medication record";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }

  async getDailyRecords(request: NextRequest): Promise<NextResponse> {
    try {
      await dbConnect();
      const auth = await authorizeRequest(request, "nursing.patients:view", "Admission");
      if (!auth.isAuthorized) return auth.response;
      const { searchParams } = new URL(request.url);
      const admissionId = searchParams.get("admissionId") || "";
      const patientId = searchParams.get("patientId") || undefined;
      let admission: Awaited<ReturnType<typeof assertAssignedNursingAdmission>>;
      try { admission = await assertAssignedNursingAdmission(admissionId, patientId, auth, true); }
      catch (e: unknown) { const err = e as { statusCode?: number; message?: string }; return NextResponse.json({ success: false, message: err.message }, { status: err.statusCode ?? 403 }); }
      const hospitalDay = getAdmissionHospitalDay(admission);
      const records = await DailyNursingRecord.find({ admissionId: new Types.ObjectId(admissionId) })
        .populate("author", "name")
        .sort({ nursingDay: 1, recordDate: 1, createdAt: 1 }).lean();
      return NextResponse.json({ success: true, data: { records, ...hospitalDay } });
    } catch (error) {
      return hospitalDayError(error, "Failed to load daily records");
    }
  }

  async createDailyRecord(request: NextRequest): Promise<NextResponse> {
    try {
      await dbConnect();
      const auth = await authorizeRequest(request, "nursing.patients:update", "Admission");
      if (!auth.isAuthorized) return auth.response;
      const body = await request.json() as Record<string, unknown>;
      const admissionId = typeof body.admissionId === "string" ? body.admissionId : "";
      const patientId = typeof body.patientId === "string" ? body.patientId : undefined;
      let admission: Awaited<ReturnType<typeof assertAssignedNursingAdmission>>;
      try { admission = await assertAssignedNursingAdmission(admissionId, patientId, auth); }
      catch (e: unknown) { const err = e as { statusCode?: number; message?: string }; return NextResponse.json({ success: false, message: err.message }, { status: err.statusCode ?? 403 }); }
      const now = new Date();
      let hospitalDay: ReturnType<typeof getAdmissionHospitalDay>;
      try {
        hospitalDay = getAdmissionHospitalDay(admission, now);
      } catch (error) {
        return hospitalDayError(error, "Unable to calculate the current hospital day");
      }
      const currentDay = hospitalDay.currentDay;
      const requestedDay = body.nursingDay;
      if (typeof requestedDay !== "number" || !Number.isInteger(requestedDay) || requestedDay !== currentDay) {
        return NextResponse.json(
          { success: false, message: `Nursing records can only be added for the current hospital day (Day ${currentDay})` },
          { status: 400 }
        );
      }
      const nursingDay = requestedDay;
      const allowed = ["observations", "procedures", "medicationAdministration", "progress", "additionalNotes", "vitals", "status"] as const;
      const payload: Record<string, unknown> = {};
      for (const key of allowed) if (body[key] !== undefined) payload[key] = body[key];
      if (payload.status !== "Draft" && payload.status !== "Final") payload.status = "Draft";
      if (payload.status === "Final") payload.finalizedAt = now;
      const primaryRecord = await DailyNursingRecord.findOne({
        admissionId: admission._id,
        nursingDay,
        correctionOf: { $exists: false },
      }).select("_id").lean();
      if (primaryRecord) payload.correctionOf = primaryRecord._id;

      try {
        const data = await DailyNursingRecord.create({
          ...payload,
          patient: admission.patientId,
          admissionId: admission._id,
          nursingDay,
          recordDate: now,
          hospitalDate: hospitalDay.hospitalDate,
          author: auth.context.userId,
        });
        return NextResponse.json({ success: true, data }, { status: 201 });
      } catch (error: unknown) {
        if ((error as { code?: number }).code === 11000 && !payload.correctionOf) {
          const concurrentPrimary = await DailyNursingRecord.findOne({
            admissionId: admission._id,
            nursingDay,
            correctionOf: { $exists: false },
          }).select("_id").lean();
          if (concurrentPrimary) {
            const data = await DailyNursingRecord.create({
              ...payload,
              correctionOf: concurrentPrimary._id,
              patient: admission.patientId,
              admissionId: admission._id,
              nursingDay,
              recordDate: now,
              hospitalDate: hospitalDay.hospitalDate,
              author: auth.context.userId,
            });
            return NextResponse.json({ success: true, data }, { status: 201 });
          }
        }
        throw error;
      }
    } catch (error) {
      return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Failed to save daily record" }, { status: 500 });
    }
  }

  async getMedicalSupplies(request: NextRequest): Promise<NextResponse> {
    try {
      await dbConnect();
      const auth = await authorizeRequest(request, "nursing.patients:view", "Admission");
      if (!auth.isAuthorized) return auth.response;

      const { searchParams } = new URL(request.url);
      const admissionId = searchParams.get("admissionId") || "";
      const patientId = searchParams.get("patientId") || undefined;
      let admission: Awaited<ReturnType<typeof assertAssignedNursingAdmission>>;
      try {
        admission = await assertAssignedNursingAdmission(admissionId, patientId, auth, true);
      } catch (error: unknown) {
        const err = error as { statusCode?: number; message?: string };
        return NextResponse.json({ success: false, message: err.message }, { status: err.statusCode ?? 403 });
      }

      const records = await NursingMedicalSupply.find({ admissionId: admission._id })
        .populate("author", "name")
        .sort({ nursingDay: 1, recordedAt: 1 })
        .lean();
      const hospitalDay = getAdmissionHospitalDay(admission);
      return NextResponse.json({ success: true, data: { records, ...hospitalDay } });
    } catch (error: unknown) {
      return hospitalDayError(error, "Failed to load medical supplies");
    }
  }

  async createMedicalSupply(request: NextRequest): Promise<NextResponse> {
    try {
      await dbConnect();
      const auth = await authorizeRequest(request, "nursing.patients:update", "Admission");
      if (!auth.isAuthorized) return auth.response;

      let body: Record<string, unknown>;
      try {
        body = await request.json() as Record<string, unknown>;
      } catch {
        return NextResponse.json({ success: false, message: "Invalid request body" }, { status: 400 });
      }

      const admissionId = typeof body.admissionId === "string" ? body.admissionId : "";
      const patientId = typeof body.patientId === "string" ? body.patientId : undefined;
      let admission: Awaited<ReturnType<typeof assertAssignedNursingAdmission>>;
      try {
        admission = await assertAssignedNursingAdmission(admissionId, patientId, auth);
      } catch (error: unknown) {
        const err = error as { statusCode?: number; message?: string };
        return NextResponse.json({ success: false, message: err.message }, { status: err.statusCode ?? 403 });
      }

      let hospitalDay: ReturnType<typeof getAdmissionHospitalDay>;
      try {
        hospitalDay = getAdmissionHospitalDay(admission);
      } catch (error) {
        return hospitalDayError(error, "Unable to calculate the current hospital day");
      }
      const currentDay = hospitalDay.currentDay;
      const nursingDay = body.nursingDay;
      if (!Number.isInteger(nursingDay) || nursingDay !== currentDay) {
        return NextResponse.json(
          { success: false, message: `Medical supplies can only be added for the current hospital day (Day ${currentDay})` },
          { status: 400 }
        );
      }

      const category = body.category;
      if (typeof category !== "string" || !(NURSING_SUPPLY_CATEGORIES as readonly string[]).includes(category)) {
        return NextResponse.json({ success: false, message: "Choose a valid medical supply category" }, { status: 400 });
      }

      const itemName = typeof body.itemName === "string" ? body.itemName.trim() : "";
      if (!itemName || itemName.length > 200) {
        return NextResponse.json({ success: false, message: "Supply name is required and must be 200 characters or fewer" }, { status: 400 });
      }

      const quantity = body.quantity;
      if (typeof quantity !== "number" || !Number.isFinite(quantity) || quantity < 0.01 || quantity > 100000) {
        return NextResponse.json({ success: false, message: "Quantity must be between 0.01 and 100000" }, { status: 400 });
      }

      const notes = typeof body.notes === "string" ? body.notes.trim() : "";
      if (notes.length > 2000) {
        return NextResponse.json({ success: false, message: "Notes must be 2000 characters or fewer" }, { status: 400 });
      }

      const record = await NursingMedicalSupply.create({
        patient: admission.patientId,
        admissionId: admission._id,
        nursingDay,
        hospitalDate: hospitalDay.hospitalDate,
        category,
        itemName,
        quantity,
        ...(notes ? { notes } : {}),
        author: auth.context.userId,
        recordedAt: new Date(),
      });
      const data = await NursingMedicalSupply.findById(record._id).populate("author", "name").lean();
      return NextResponse.json({ success: true, data }, { status: 201 });
    } catch (error: unknown) {
      return NextResponse.json({
        success: false,
        message: error instanceof Error ? error.message : "Failed to save medical supply",
      }, { status: 500 });
    }
  }

  async updateDailyRecord(request: NextRequest, id: string): Promise<NextResponse> {
    try {
      await dbConnect();
      const auth = await authorizeRequest(request, "nursing.patients:update", "Admission");
      if (!auth.isAuthorized) return auth.response;
      if (!Types.ObjectId.isValid(id)) return NextResponse.json({ success: false, message: "Invalid record ID" }, { status: 400 });
      const existing = await DailyNursingRecord.findById(id).lean();
      if (!existing) return NextResponse.json({ success: false, message: "Daily record not found" }, { status: 404 });
      try { await assertAssignedNursingAdmission(existing.admissionId.toString(), existing.patient.toString(), auth); }
      catch (e: unknown) { const err = e as { statusCode?: number; message?: string }; return NextResponse.json({ success: false, message: err.message }, { status: err.statusCode ?? 403 }); }
      if (existing.status !== "Draft" || existing.author.toString() !== auth.context.userId.toString()) return NextResponse.json({ success: false, message: "Only your draft records can be edited; create an addendum for a finalized record" }, { status: 403 });
      const body = await request.json() as Record<string, unknown>;
      const patch: Record<string, unknown> = {};
      for (const key of ["observations", "procedures", "medicationAdministration", "progress", "additionalNotes", "vitals"] as const) if (body[key] !== undefined) patch[key] = body[key];
      if (body.status === "Final") { patch.status = "Final"; patch.finalizedAt = new Date(); }
      const data = await DailyNursingRecord.findByIdAndUpdate(id, { $set: patch }, { new: true });
      return NextResponse.json({ success: true, data });
    } catch (error) {
      return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Failed to update daily record" }, { status: 500 });
    }
  }

}

const nursingController = new NursingController();
export default nursingController;
