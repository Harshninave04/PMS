import NursingMedication from "@/models/nursing-medication.model";
import "@/models/medication-order.model";
import Admission from "@/models/admission.model";
import { ClinicalRecord } from "@/models/clinical-record.model";
import { Vitals } from "@/models/vitals.model";
import { flagVitalForReview, type VitalFlag } from "@/lib/vital-flags";
import { hospitalDayKey } from "@/lib/hospital-time";
import "@/models/bed.model";
import "@/models/patient.model";
import "@/models/user.model";
import "@/models/room.model";
import "@/models/ward.model";
import { Types } from "mongoose";

export interface NursingActor {
  userId?: Types.ObjectId | string;
  roleName?: string;
  isSuperAdmin?: boolean;
  /** Branch scoping mirrors AdmissionController: only applied when set. */
  branchId?: Types.ObjectId | string;
  orgScope?: string;
}

const ACTIVE_INPATIENT_STATUSES = ["ADMITTED", "TRANSFERRED"];

function toObjectIds(ids: Array<Types.ObjectId | string>): Types.ObjectId[] {
  return ids.map((id) => new Types.ObjectId(id.toString()));
}

function isTeamScoped(actor?: NursingActor): boolean {
  const role = (actor?.roleName ?? "").toUpperCase();
  return !!actor?.userId && !actor?.isSuperAdmin && (role === "NURSE" || role === "DOCTOR");
}

/**
 * Branch convention shared with AdmissionController.getAdmissions: a caller
 * that works inside a branch only sees that branch's stays; headquarters
 * callers (no branch) see every branch. ScopeResolver's substitution of the
 * organization id for a missing branch is deliberately NOT applied here, so
 * stays recorded before branch stamping stay visible to the care team.
 */
function applyBranchConvention(query: Record<string, unknown>, actor?: NursingActor) {
  if (actor && !actor.isSuperAdmin && actor.orgScope === "BRANCH" && actor.branchId) {
    query.branchId = new Types.ObjectId(actor.branchId.toString());
  }
}

function teamQuery(actor: NursingActor): Record<string, unknown> {
  const role = (actor.roleName ?? "").toUpperCase();
  const uid = new Types.ObjectId(actor.userId!.toString());
  const base: Record<string, unknown> = { status: { $in: ACTIVE_INPATIENT_STATUSES } };
  if (role === "NURSE") {
    base.assignedNurses = uid;
  } else {
    base.$or = [{ doctorId: uid }, { assignedDoctors: uid }];
  }
  applyBranchConvention(base, actor);
  return base;
}

export class NursingService {
  // Inpatients visible to the caller. Nurses (and doctors without a wide
  // role) only see stays where they are on the care team; admins,
  // receptionists and pharmacists keep the full ward view for coordination.
  async getMyPatients(filter: Record<string, unknown> = {}, actor?: NursingActor) {
    // The incoming ScopeResolver filter may carry a branch substitution that
    // hides stays recorded without a branch; re-derive it per convention.
    const { branchId: _droppedBranch, ...rest } = filter;
    void _droppedBranch;
    const query: Record<string, unknown> = { status: { $in: ACTIVE_INPATIENT_STATUSES }, ...rest };

    if (actor && isTeamScoped(actor)) {
      const team = teamQuery(actor);
      // Team membership replaces any caller-supplied patient scoping.
      delete query.patientId;
      Object.assign(query, team);
      // `status` already set above; teamQuery repeats it identically.
    } else {
      applyBranchConvention(query, actor);
    }

    const admissions = await Admission.find(query)
      .populate("patientId", "name uhid age gender contact bloodGroup allergies medicalHistory")
      .populate("doctorId", "name email contact")
      .populate("assignedNurses", "name email")
      .populate("assignedDoctors", "name email")
      .populate({
        path: "bedId",
        populate: {
          path: "roomId",
          populate: { path: "wardId" }
        }
      })
      .sort({ admissionDate: -1 })
      .lean();

    const admissionIds = admissions.map((admission) => admission._id);
    const [vitalRows, roundRows] = admissionIds.length
      ? await Promise.all([
          Vitals.find({ admissionId: { $in: admissionIds } })
            .sort({ dateRecorded: -1, createdAt: -1 }).lean(),
          ClinicalRecord.find({ admissionId: { $in: admissionIds }, recordType: "Progress Note", $or: [{ visitType: "Round" }, { visitType: { $exists: false } }] })
            .select("admissionId visitedAt dateRecorded createdAt")
            .sort({ visitedAt: -1, dateRecorded: -1, createdAt: -1 }).lean(),
        ])
      : [[], []];

    const latestVitals = new Map<string, (typeof vitalRows)[number]>();
    for (const vital of vitalRows) {
      const key = vital.admissionId?.toString();
      if (key && !latestVitals.has(key)) latestVitals.set(key, vital);
    }
    const latestRoundAt = new Map<string, Date>();
    const roundsToday = new Set<string>();
    const todayKey = hospitalDayKey(new Date());
    for (const round of roundRows) {
      const key = round.admissionId?.toString();
      if (!key) continue;
      const visitedAt = round.visitedAt ?? round.dateRecorded ?? round.createdAt;
      if (!visitedAt) continue;
      const roundDate = new Date(visitedAt);
      if (!latestRoundAt.has(key)) latestRoundAt.set(key, roundDate);
      if (hospitalDayKey(roundDate) === todayKey) roundsToday.add(key);
    }

    return admissions.map((adm: Record<string, unknown>) => {
      const bed = adm.bedId as Record<string, unknown> | undefined;
      const room = bed?.roomId as Record<string, unknown> | undefined;
      const ward = room?.wardId as Record<string, unknown> | undefined;
      const patient = adm.patientId as Record<string, unknown> | undefined;
      const doctor = adm.doctorId as Record<string, unknown> | undefined;
      const insurance = adm.insurance as { provider?: string } | undefined;
      const admissionId = String(adm._id ?? "");
      const latestVital = latestVitals.get(admissionId);
      const latestVitalData = latestVital ? {
        _id: latestVital._id.toString(),
        temperature: latestVital.temperature,
        heartRate: latestVital.heartRate,
        bloodPressure: latestVital.bloodPressure,
        respiratoryRate: latestVital.respiratoryRate,
        oxygenSaturation: latestVital.oxygenSaturation,
        dateRecorded: latestVital.dateRecorded,
        flag: flagVitalForReview(latestVital),
      } : undefined;

      return {
        admissionId: adm._id,
        patientId: patient?._id,
        name: patient?.name || "Admitted Patient",
        uhid: patient?.uhid || "UHID-PENDING",
        age: patient?.age,
        gender: patient?.gender,
        contact: patient?.contact,
        bloodGroup: patient?.bloodGroup,
        allergies: patient?.allergies || [],
        bedNumber: bed?.bedNumber || "Unassigned",
        roomNumber: room?.roomNumber || "Ward Room",
        wardName: ward?.wardName || "General Ward",
        wardType: ward?.wardType || "General",
        floor: ward?.floor || 1,
        doctorName: doctor?.name ? `Dr. ${doctor.name}` : "Attending Physician",
        doctorId: doctor?._id,
        assignedNurses: adm.assignedNurses ?? [],
        assignedDoctors: adm.assignedDoctors ?? [],
        diagnosis: adm.initialDiagnosis || adm.reasonForAdmission || "Clinical Care",
        admissionDate: adm.admissionDate,
        admissionType: adm.admissionType || "ELECTIVE",
        insurance: insurance?.provider || "Self Pay",
        latestVital: latestVitalData,
        latestVitalFlag: latestVitalData?.flag as VitalFlag | undefined,
        lastRoundAt: latestRoundAt.get(admissionId)?.toISOString(),
        roundedToday: roundsToday.has(admissionId),
      };
    });
  }

  async getVisibleAdmissionIds(actor?: NursingActor): Promise<Types.ObjectId[] | undefined> {
    // Undefined means "no team restriction" (wide role or super admin).
    if (!actor?.userId || actor?.isSuperAdmin) return undefined;
    if (!isTeamScoped(actor)) return undefined;
    const rows = await Admission.find(teamQuery(actor)).select("_id").lean();
    return rows.map((r) => r._id as Types.ObjectId);
  }

  async getPatientIdsForActor(actor?: NursingActor): Promise<Types.ObjectId[] | undefined> {
    if (!actor?.userId || actor?.isSuperAdmin) return undefined;
    if (!isTeamScoped(actor)) return undefined;
    const rows = await Admission.find(teamQuery(actor)).select("patientId").lean();
    return rows.map((r) => r.patientId as Types.ObjectId);
  }

  // 2. Aggregate Nursing KPIs & Stats (scoped to visible stays for team roles)
  async getNursingStats(actor?: NursingActor) {
    const scoped = actor && isTeamScoped(actor);
    const admissionQuery: Record<string, unknown> = scoped
      ? teamQuery(actor!)
      : { status: { $in: ACTIVE_INPATIENT_STATUSES } };
    if (!scoped) applyBranchConvention(admissionQuery, actor);
    const [totalInpatients, pendingMedications] = await Promise.all([
      Admission.countDocuments(admissionQuery),
      scoped
        ? NursingMedication.countDocuments({
            status: "PENDING",
            patient: { $in: await this.getPatientIdsForActor(actor) },
          })
        : NursingMedication.countDocuments({ status: "PENDING" }),
    ]);

    return { totalInpatients, pendingMedications };
  }

  // 3. Medication Administration Record (eMAR)
  // `allowedPatientIds === undefined` means no team restriction (wide role).
  async getMedications(patientId?: string, admissionId?: string, allowedPatientIds?: Types.ObjectId[]) {
    const filter: Record<string, unknown> = {};
    if (admissionId) filter.admissionId = admissionId;
    if (allowedPatientIds !== undefined) {
      if (allowedPatientIds.length === 0) return [];
      if (patientId) {
        const allowed = new Set(allowedPatientIds.map((id) => id.toString()));
        if (!allowed.has(new Types.ObjectId(patientId).toString())) return [];
        filter.patient = new Types.ObjectId(patientId);
      } else {
        filter.patient = { $in: toObjectIds(allowedPatientIds) };
      }
    } else if (patientId) {
      filter.patient = patientId;
    }
    return NursingMedication.find(filter)
      .populate("patient", "name uhid")
      .populate("administeredBy", "name")
      .populate("admissionId", "status admissionType")
      .populate("orderId", "medicationName dosage route frequency timesOfDay instructions status")
      .sort({ scheduledTime: 1, createdAt: -1 });
  }

  async createMedication(data: Record<string, unknown>) {
    return NursingMedication.create(data);
  }

  async updateMedication(id: string, data: Record<string, unknown>) {
    return NursingMedication.findByIdAndUpdate(id, data, { new: true });
  }

  async deleteMedication(id: string) {
    return NursingMedication.findByIdAndDelete(id);
  }

}

const nursingService = new NursingService();
export default nursingService;
