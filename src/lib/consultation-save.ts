import type { Types } from "mongoose";

export interface NormalizedConsultationInput {
  chiefComplaint: string;
  diagnosisNotes: string;
  investigations: string[];
  medications: {
    name: string;
    dosage?: string;
    frequency?: string;
    duration?: string;
    instructions?: string;
  }[];
}

export interface TrustedConsultationIds {
  appointmentId: Types.ObjectId | string;
  patientId: Types.ObjectId | string;
  doctorUserId: Types.ObjectId | string;
  branchId?: Types.ObjectId | string;
}

export function isAppointmentReadyForConsultation(queueStatus?: string, status?: string): boolean {
  return queueStatus === "CALLED" || queueStatus === "IN_CONSULTATION" || status === "IN_PROGRESS";
}

function trimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeConsultationInput(body: unknown): { data?: NormalizedConsultationInput; error?: string } {
  if (!body || typeof body !== "object") return { error: "Invalid consultation data" };
  const input = body as Record<string, unknown>;
  const chiefComplaint = trimmed(input.chiefComplaint);
  if (!chiefComplaint) return { error: "Chief complaint is required" };

  const rawInvestigations = Array.isArray(input.investigations)
    ? input.investigations
    : typeof input.investigations === "string"
      ? input.investigations.split(/\n+/)
      : [];
  const investigations = [...new Set(rawInvestigations.map(trimmed).filter(Boolean))];
  const diagnosisNotes = trimmed(input.diagnosisNotes ?? input.plan);
  const rawMedications = Array.isArray(input.medications) ? input.medications : [];
  const medications = rawMedications.map((raw) => {
    const medication = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
    return {
      name: trimmed(medication.name),
      dosage: trimmed(medication.dosage) || undefined,
      frequency: trimmed(medication.frequency) || undefined,
      duration: trimmed(medication.duration) || undefined,
      instructions: trimmed(medication.instructions) || undefined,
    };
  });

  if (medications.some((medication) => !medication.name)) {
    return { error: "Every prescription row must include a drug name" };
  }
  const medicationNames = medications.map((medication) => medication.name.toLocaleLowerCase());
  if (new Set(medicationNames).size !== medicationNames.length) {
    return { error: "Duplicate medicines are not allowed in one prescription" };
  }

  return { data: { chiefComplaint, diagnosisNotes, investigations, medications } };
}

export function buildConsultationDocuments(input: NormalizedConsultationInput, ids: TrustedConsultationIds) {
  return {
    clinicalRecord: {
      patient: ids.patientId,
      doctor: ids.doctorUserId,
      appointmentId: ids.appointmentId,
      recordType: "Consultation",
      chiefComplaint: input.chiefComplaint,
      assessment: input.diagnosisNotes || undefined,
      plan: input.investigations.join(", ") || undefined,
      dateRecorded: new Date(),
      status: "Final" as const,
    },
    prescription: input.medications.length > 0
      ? {
          patientId: ids.patientId,
          doctorId: ids.doctorUserId,
          branchId: ids.branchId,
          appointmentId: ids.appointmentId,
          visitDate: new Date(),
          symptoms: input.chiefComplaint,
          diagnosis: input.diagnosisNotes || undefined,
          notes: input.investigations.join(", ") || undefined,
          medications: input.medications,
        }
      : null,
  };
}
