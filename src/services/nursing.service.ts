import NursingMedication from "@/models/nursing-medication.model";
import Admission from "@/models/admission.model";
import "@/models/bed.model";
import "@/models/patient.model";
import "@/models/user.model";
import "@/models/room.model";
import "@/models/ward.model";

/** Fields a client may set. `administeredBy` is stamped from the session, never the body. */
const WRITABLE_MEDICATION_FIELDS = [
  "patient",
  "medicationName",
  "dosage",
  "route",
  "scheduledTime",
  "administeredTime",
  "status",
  "withheldReason",
  "notes",
] as const;

function pickWritable(data: Record<string, unknown>, fields: readonly string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const field of fields) {
    if (data[field] !== undefined) result[field] = data[field];
  }
  return result;
}

export class NursingService {
  // 1. My Inpatients (Real admitted ward inpatients)
  async getMyPatients(filter: Record<string, unknown> = {}) {
    const query: Record<string, unknown> = { status: { $in: ["ADMITTED", "ACTIVE"] }, ...filter };

    const admissions = await Admission.find(query)
      .populate("patientId", "name uhid age gender contact bloodGroup allergies medicalHistory")
      .populate("doctorId", "name email contact")
      .populate({
        path: "bedId",
        populate: {
          path: "roomId",
          populate: { path: "wardId" }
        }
      })
      .sort({ admissionDate: -1 })
      .lean();

    return admissions.map((adm: Record<string, unknown>) => {
      const bed = adm.bedId as Record<string, unknown> | undefined;
      const room = bed?.roomId as Record<string, unknown> | undefined;
      const ward = room?.wardId as Record<string, unknown> | undefined;
      const patient = adm.patientId as Record<string, unknown> | undefined;
      const doctor = adm.doctorId as Record<string, unknown> | undefined;
      const insurance = adm.insurance as { provider?: string } | undefined;

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
        diagnosis: adm.initialDiagnosis || adm.reasonForAdmission || "Clinical Care",
        admissionDate: adm.admissionDate,
        admissionType: adm.admissionType || "ELECTIVE",
        insurance: insurance?.provider || "Self Pay"
      };
    });
  }

  // 2. Aggregate Nursing KPIs & Stats
  async getNursingStats() {
    const [totalInpatients, pendingMedications] = await Promise.all([
      Admission.countDocuments({ status: { $in: ["ADMITTED", "ACTIVE"] } }),
      NursingMedication.countDocuments({ status: "PENDING" })
    ]);

    return { totalInpatients, pendingMedications };
  }

  // 3. Medication Administration Record (eMAR)
  async getMedications(patientId?: string) {
    const filter: Record<string, unknown> = {};
    if (patientId) filter.patient = patientId;
    return NursingMedication.find(filter)
      .populate("patient", "name uhid")
      .populate("administeredBy", "name")
      .sort({ scheduledTime: 1, createdAt: -1 });
  }

  async createMedication(data: Record<string, unknown>, administeredBy?: string) {
    return NursingMedication.create({
      ...pickWritable(data, WRITABLE_MEDICATION_FIELDS),
      // The administering nurse is whoever holds the session, not whoever the
      // client named in the request body.
      administeredBy: administeredBy ?? null,
    });
  }

  async getMedicationById(id: string) {
    return NursingMedication.findById(id);
  }

  async updateMedication(id: string, data: Record<string, unknown>) {
    return NursingMedication.findByIdAndUpdate(id, pickWritable(data, WRITABLE_MEDICATION_FIELDS), {
      new: true,
      runValidators: true,
    });
  }

  async deleteMedication(id: string) {
    return NursingMedication.findByIdAndDelete(id);
  }

}

const nursingService = new NursingService();
export default nursingService;
