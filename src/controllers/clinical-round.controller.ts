import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import dbConnect from "@/lib/dbConnect";
import { authorizeRequest, requireAnyPermission } from "@/lib/rbac/guard";
import { PERMISSION_KEYS } from "@/types/rbac";
import { isSuperAdminRole } from "@/lib/rbac/default-permissions";
import { ClinicalRecord } from "@/models/clinical-record.model";
import Admission from "@/models/admission.model";
import Patient from "@/models/patient.model";
import { MedicationOrder } from "@/models/medication-order.model";
import NursingMedication from "@/models/nursing-medication.model";
import { CareTask } from "@/models/care-task.model";
import visitService from "@/services/visit.service";
import medicationOrderService from "@/services/medication-order.service";
import careTaskService from "@/services/care-task.service";
import { validateOrderTimes } from "@/models/medication-order.model";
import { MAX_DOSES_PER_ORDER } from "@/lib/medication-schedule";
import { expandHospitalDoseTimes } from "@/lib/hospital-time";
import { isDoctorActor, isPatientAssignedToDoctor } from "@/lib/rbac/doctor-scope";

type RoundCondition = "Improving" | "Stable" | "Deteriorating" | "Critical";
type RoundOrder = MedicineOrderInput | InstructionOrderInput;

interface MedicineOrderInput {
  type: "MEDICINE";
  medicationName: string;
  isCatalogueMedicine: boolean;
  dosage?: string;
  route: string;
  frequency: string;
  timesOfDay?: string[];
  durationDays?: number;
  instructions?: string;
}

interface InstructionOrderInput {
  type: "INSTRUCTION";
  title: string;
  detail?: string;
  priority?: string;
}

interface RoundBody {
  admissionId?: string;
  condition?: RoundCondition;
  notes?: string;
  details?: {
    chiefComplaint?: string;
    objectiveFindings?: string;
    assessment?: string;
    plan?: string;
    painScore?: number;
  };
  orders?: RoundOrder[];
}

const ACTIVE_STATUSES = ["ADMITTED", "TRANSFERRED"];
const CONDITIONS: RoundCondition[] = ["Improving", "Stable", "Deteriorating", "Critical"];
const ROUTES = ["ORAL", "IV", "IM", "SC", "TOPICAL", "INHALATION", "OTHER"];
const FREQUENCIES = ["STAT", "OD", "BD", "TDS", "QID", "Q6H", "Q8H", "Q12H", "HS", "PRN"];
const PRIORITIES = ["Routine", "Urgent", "STAT"];

function idOf(value: unknown): string {
  if (value && typeof value === "object" && "_id" in value) {
    return String((value as { _id: unknown })._id);
  }
  return String(value ?? "");
}

function branchError(
  admission: { branchId?: unknown },
  auth: { context: { branchId?: Types.ObjectId }; grant: { orgScope: string } },
): NextResponse | null {
  if (auth.grant.orgScope === "BRANCH" && auth.context.branchId) {
    if (idOf(admission.branchId) !== auth.context.branchId.toString()) {
      return NextResponse.json({ success: false, message: "Forbidden: Admission belongs to another branch" }, { status: 403 });
    }
  }
  return null;
}

function validationError(message: string): NextResponse {
  return NextResponse.json({ success: false, message }, { status: 400 });
}

export class ClinicalRoundController {
  async readRounds(request: NextRequest): Promise<NextResponse> {
    try {
      await dbConnect();
      const auth = await authorizeRequest(request, PERMISSION_KEYS.PATIENT_VIEW, "Patient");
      if (!auth.isAuthorized) return auth.response;
      const patientId = new URL(request.url).searchParams.get("patientId");
      if (!patientId || !Types.ObjectId.isValid(patientId)) return validationError("A valid patientId is required");
      const patient = await Patient.findById(patientId).select("branchId").lean();
      if (!patient) return NextResponse.json({ success: false, message: "Patient not found" }, { status: 404 });
      let doctorHasPatientAccess = false;
      if (isDoctorActor(auth.context)) {
        const doctorId = auth.context.doctorProfileId;
        doctorHasPatientAccess = Boolean(doctorId && await isPatientAssignedToDoctor(doctorId, new Types.ObjectId(patientId)));
        if (!doctorId) {
          return NextResponse.json({ success: false, message: "Forbidden: Patient is not assigned to you" }, { status: 403 });
        }
      }
      if (auth.grant.orgScope === "BRANCH" && auth.context.branchId && idOf(patient.branchId) !== auth.context.branchId.toString()) {
        return NextResponse.json({ success: false, message: "Forbidden: Patient belongs to another branch" }, { status: 403 });
      }
      let data = await visitService.listRoundsForPatient(patientId);
      if (isDoctorActor(auth.context) && !doctorHasPatientAccess) {
        const userId = auth.context.userId.toString();
        data = data.filter((admission) => idOf(admission.doctorId) === userId || (admission.assignedDoctors ?? []).some((doctor: unknown) => idOf(doctor) === userId));
        if (data.length === 0) return NextResponse.json({ success: false, message: "Forbidden: You are not assigned to this patient or admission" }, { status: 403 });
      }
      return NextResponse.json({ success: true, data }, { status: 200 });
    } catch (error: unknown) {
      const err = error as { statusCode?: number; message?: string };
      return NextResponse.json({ success: false, message: err?.message ?? "Failed to load rounds" }, { status: err?.statusCode ?? 500 });
    }
  }

  async createRound(request: NextRequest): Promise<NextResponse> {
    let visitId: Types.ObjectId | undefined;
    const orderIds: Types.ObjectId[] = [];
    const taskIds: Types.ObjectId[] = [];
    try {
      await dbConnect();
      const auth = await authorizeRequest(request, PERMISSION_KEYS.CLINICAL_RECORD_CREATE, "ClinicalRecord");
      if (!auth.isAuthorized) return auth.response;

      const roleName = auth.context.roleName.toUpperCase();
      if (!roleName.includes("DOCTOR") && !roleName.includes("CONSULTANT")) {
        return NextResponse.json({ success: false, message: "Only the patient's doctor can save a round" }, { status: 403 });
      }

      const body = await request.json() as RoundBody;
      if (!body.admissionId || !Types.ObjectId.isValid(body.admissionId)) return validationError("A valid admissionId is required");
      const orders = body.orders ?? [];
      if (!Array.isArray(orders) || orders.length > 20) return validationError("Add no more than 20 orders per round");
      if (body.notes !== undefined && typeof body.notes !== "string") return validationError("Round notes must be text");
      const notes = body.notes?.trim() ?? "";
      if (notes.length > 10000) return validationError("Round notes must be 10,000 characters or fewer");
      if (body.condition && !CONDITIONS.includes(body.condition)) return validationError("Invalid patient condition");
      const details = body.details ?? {};
      if (details.painScore !== undefined && (!Number.isInteger(details.painScore) || details.painScore < 0 || details.painScore > 10)) {
        return validationError("Pain score must be an integer from 0 to 10");
      }
      if (![details.chiefComplaint, details.objectiveFindings, details.assessment, details.plan].every((value) => value === undefined || typeof value === "string")) {
        return validationError("Round details must be text");
      }
      if (!notes && !body.condition && orders.length === 0) {
        return validationError("Add a condition, round note, or order before saving");
      }

      for (const [index, order] of orders.entries()) {
        if (order.type === "MEDICINE") {
          if (typeof order.medicationName !== "string" || (order.dosage !== undefined && typeof order.dosage !== "string")) return validationError(`Medicine ${index + 1}: medication and optional dose must be text`);
          if (typeof order.isCatalogueMedicine !== "boolean") return validationError(`Medicine ${index + 1}: select a catalogue medicine or explicitly use the typed name`);
          const medicationName = order.medicationName.trim();
          const dosage = typeof order.dosage === "string" ? order.dosage.trim() : "";
          if (!medicationName) return validationError(`Medicine ${index + 1}: medication name is required`);
          if (medicationName.length > 200 || dosage.length > 100) return validationError(`Medicine ${index + 1}: medication or dose is too long`);
          const route = typeof order.route === "string" ? order.route.toUpperCase() : "";
          const frequency = typeof order.frequency === "string" ? order.frequency.toUpperCase() : "";
          if (!route || !ROUTES.includes(route)) return validationError(`Medicine ${index + 1}: choose a valid route`);
          if (!frequency || !FREQUENCIES.includes(frequency)) return validationError(`Medicine ${index + 1}: choose a valid frequency`);
          const times = Array.isArray(order.timesOfDay) ? order.timesOfDay : [];
          const timesError = validateOrderTimes(frequency, times);
          if (timesError) return validationError(`Medicine ${index + 1}: ${timesError}`);
          if (times.length > 8 || (order.timesOfDay !== undefined && !Array.isArray(order.timesOfDay)) || times.some((time) => typeof time !== "string")) return validationError(`Medicine ${index + 1}: invalid schedule times`);
          if (order.instructions !== undefined && typeof order.instructions !== "string") return validationError(`Medicine ${index + 1}: nurse note must be text`);
          const durationDays = frequency === "STAT" ? 1 : Number(order.durationDays);
          if (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 30) {
            return validationError(`Medicine ${index + 1}: duration must be between 1 and 30 days`);
          }
          const generatedDoseCount = expandHospitalDoseTimes(new Date(), durationDays, frequency === "STAT" || frequency === "PRN" ? [] : times, frequency).length;
          if (generatedDoseCount > MAX_DOSES_PER_ORDER) return validationError(`Medicine ${index + 1}: schedule exceeds the ${MAX_DOSES_PER_ORDER} dose limit`);
        } else if (order.type === "INSTRUCTION") {
          if (typeof order.title !== "string" || !order.title.trim()) return validationError(`Instruction ${index + 1}: title is required`);
          if (order.detail !== undefined && typeof order.detail !== "string") return validationError(`Instruction ${index + 1}: detail must be text`);
          if (order.title.trim().length > 200 || (order.detail?.length ?? 0) > 2000) return validationError(`Instruction ${index + 1}: text is too long`);
          if (order.priority && !PRIORITIES.includes(order.priority)) return validationError(`Instruction ${index + 1}: choose a valid priority`);
        } else {
          return validationError(`Order ${index + 1}: unsupported order type`);
        }
      }

      const actor = {
        userId: auth.context.userId,
        roleName: auth.context.roleName,
        isSuperAdmin: isSuperAdminRole(auth.context.roleName),
      };
      const admission = await visitService.assertActorMayAccessAdmission(body.admissionId, actor);
      const branchBlocked = branchError(admission, auth);
      if (branchBlocked) return branchBlocked;
      if (!ACTIVE_STATUSES.includes(admission.status)) return validationError(`Cannot record a round on a ${admission.status} admission`);
      const doctorId = auth.context.userId.toString();
      if (idOf(admission.doctorId) !== doctorId && !(admission.assignedDoctors ?? []).some((doctor: unknown) => idOf(doctor) === doctorId)) {
        return NextResponse.json({ success: false, message: "You must be assigned as a doctor on this patient's care team" }, { status: 403 });
      }

      if (orders.some((order) => order.type === "MEDICINE")) {
        const medicationDenied = await requireAnyPermission(request, ["clinical.rounds:create", "clinical.prescriptions:prescribe"]);
        if (medicationDenied) return medicationDenied;
        const medicationAuth = await authorizeRequest(request, PERMISSION_KEYS.CLINICAL_PRESCRIPTION_CREATE, "Prescription");
        if (!medicationAuth.isAuthorized) return medicationAuth.response;
        const medicationBranchBlocked = branchError(admission, medicationAuth);
        if (medicationBranchBlocked) return medicationBranchBlocked;
      }
      if (orders.some((order) => order.type === "INSTRUCTION")) {
        const taskDenied = await requireAnyPermission(request, [
          "nursing.medications:create",
          "nursing.notes:create",
          "opd.queue:update",
          "clinical.consultations:create",
        ]);
        if (taskDenied) return taskDenied;
        // Creating a doctor's instruction uses the doctor-facing care-task
        // create permissions checked above; nurse task-execution permission
        // is reserved for acknowledging/completing instructions.
        const taskBranchBlocked = branchError(admission, auth);
        if (taskBranchBlocked) return taskBranchBlocked;
      }

      const patientId = admission.patientId.toString();
      const visitedAt = new Date();
      const visit = await ClinicalRecord.create({
        patient: new Types.ObjectId(patientId),
        admissionId: new Types.ObjectId(body.admissionId),
        doctor: auth.context.userId,
        recordType: "Progress Note",
        visitType: "Round",
        condition: body.condition,
        notes: notes || undefined,
        details: notes || undefined,
        chiefComplaint: details.chiefComplaint?.trim() || undefined,
        objectiveFindings: details.objectiveFindings?.trim() || undefined,
        assessment: details.assessment?.trim() || undefined,
        plan: details.plan?.trim() || undefined,
        painScore: details.painScore,
        visitedAt,
        dateRecorded: visitedAt,
        status: "Final",
      });
      visitId = visit._id as Types.ObjectId;

      let dosesCreated = 0;
      for (const order of orders) {
        if (order.type === "MEDICINE") {
          const result = await medicationOrderService.createOrder({
            admissionId: body.admissionId,
            patientId,
            visitId: visitId.toString(),
            medicationName: order.medicationName.trim(),
            isCatalogueMedicine: order.isCatalogueMedicine,
            dosage: order.dosage?.trim() ?? "",
            route: order.route.toUpperCase(),
            frequency: order.frequency.toUpperCase(),
            timesOfDay: order.frequency.toUpperCase() === "STAT" || order.frequency.toUpperCase() === "PRN" ? [] : order.timesOfDay ?? [],
            durationDays: order.frequency.toUpperCase() === "STAT" ? 1 : Number(order.durationDays),
            instructions: order.instructions?.trim() || undefined,
            startDate: visitedAt,
          }, auth.context.userId, { allowUnspecifiedDosage: true });
          orderIds.push(result.order._id as Types.ObjectId);
          dosesCreated += result.dosesCreated;
        }
      }

      for (const order of orders) {
        if (order.type === "INSTRUCTION") {
          const task = await careTaskService.createTask({
            admissionId: body.admissionId,
            patientId,
            title: order.title.trim(),
            detail: order.detail?.trim() || undefined,
            priority: order.priority ?? "Routine",
          }, auth.context.userId);
          taskIds.push(task._id as Types.ObjectId);
        }
      }

      const ordersCreated = orders.filter((order) => order.type === "MEDICINE").length;
      const tasksCreated = orders.filter((order) => order.type === "INSTRUCTION").length;
      return NextResponse.json({
        success: true,
        data: { visitId: visitId.toString(), ordersCreated, dosesCreated, tasksCreated },
        message: "Round saved",
      }, { status: 201 });
    } catch (error: unknown) {
      const cleanup = await Promise.allSettled([
        orderIds.length ? NursingMedication.deleteMany({ orderId: { $in: orderIds } }) : Promise.resolve(),
        orderIds.length ? MedicationOrder.deleteMany({ _id: { $in: orderIds } }) : Promise.resolve(),
        taskIds.length ? CareTask.deleteMany({ _id: { $in: taskIds } }) : Promise.resolve(),
        visitId ? ClinicalRecord.findByIdAndDelete(visitId) : Promise.resolve(),
      ]);
      if (cleanup.some((result) => result.status === "rejected")) {
        console.error("[ClinicalRoundController] Round rollback was incomplete:", cleanup);
      }
      const err = error as { statusCode?: number; message?: string; stack?: string };
      if (!err?.statusCode) console.error("[ClinicalRoundController.createRound]", err?.stack || error);
      const status = err?.statusCode ?? 500;
      const message = err?.message ?? (status === 500 ? "Could not save the round. Any created records were rolled back." : "Could not save the round");
      return NextResponse.json({ success: false, message }, { status });
    }
  }
}

const clinicalRoundController = new ClinicalRoundController();
export default clinicalRoundController;
