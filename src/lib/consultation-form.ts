import type { ConsultationAppointment } from "@/types/consultation";

export interface MedicationDraft {
  id: string;
  name: string;
  isCatalogueMedicine: boolean | null;
  dosage: string;
  frequency: string;
  duration: string;
  instructions: string;
}

export interface ConsultationDraft {
  chiefComplaint: string;
  diagnosisNotes: string;
  investigations: string[];
}

/** Works on plain http (LAN) origins where crypto.randomUUID is unavailable. */
export function createId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createConsultationDraft(appointment: ConsultationAppointment): ConsultationDraft {
  return {
    chiefComplaint: (appointment.reason ?? "").trim(),
    diagnosisNotes: "",
    investigations: [],
  };
}

export function createMedicationDraft(id: string = createId()): MedicationDraft {
  return { id, name: "", isCatalogueMedicine: null, dosage: "", frequency: "", duration: "", instructions: "" };
}

export function isBlankMedication(medication: MedicationDraft): boolean {
  return !(
    medication.name.trim() ||
    medication.dosage.trim() ||
    medication.frequency.trim() ||
    medication.duration.trim() ||
    medication.instructions.trim()
  );
}

/** Rows the doctor never touched are ignored on save. */
export function activeMedications(medications: MedicationDraft[]): MedicationDraft[] {
  return medications.filter((medication) => !isBlankMedication(medication));
}

export function validateConsultationDraft(
  draft: ConsultationDraft,
  medications: MedicationDraft[]
): string | null {
  if (!draft.chiefComplaint.trim()) return "Chief complaint is required.";

  const active = activeMedications(medications);
  for (const [index, medication] of active.entries()) {
    if (!medication.name.trim()) return `Enter a drug name for medicine ${index + 1}.`;
    if (medication.isCatalogueMedicine === null) return `Select a catalogue medicine or use the typed name for medicine ${index + 1}.`;
  }

  const names = active.map((medication) => medication.name.trim().toLocaleLowerCase());
  if (new Set(names).size !== names.length) return "Remove duplicate medicines from the prescription.";
  return null;
}

export function consultationPayload(draft: ConsultationDraft, medications: MedicationDraft[]) {
  return {
    chiefComplaint: draft.chiefComplaint.trim(),
    diagnosisNotes: draft.diagnosisNotes.trim(),
    investigations: [...new Set(draft.investigations.map((item) => item.trim()).filter(Boolean))],
    medications: activeMedications(medications).map((medication) => ({
      name: medication.name.trim(),
      isCatalogueMedicine: medication.isCatalogueMedicine,
      dosage: medication.dosage.trim(),
      frequency: medication.frequency.trim(),
      duration: medication.duration.trim(),
      instructions: medication.instructions.trim(),
    })),
  };
}