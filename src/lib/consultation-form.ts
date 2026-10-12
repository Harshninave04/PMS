import {
  COMMON_CHIEF_COMPLAINTS,
  MEDICATION_DOSAGE_OPTIONS,
  MEDICATION_DURATION_OPTIONS,
  MEDICATION_FREQUENCY_OPTIONS,
  MEDICATION_INSTRUCTIONS_OPTIONS,
  OTHER_OPTION,
} from "@/constants/consultation";
import type { ConsultationAppointment } from "@/types/consultation";

export interface MedicationDraft {
  id: string;
  name: string;
  dosage: string;
  dosageOther: string;
  frequency: string;
  frequencyOther: string;
  duration: string;
  durationOther: string;
  instructions: string;
  instructionsOther: string;
}

export interface ConsultationDraft {
  chiefComplaint: string;
  chiefComplaintOther: string;
  diagnosisNotes: string;
  investigations: string[];
  investigationsOther: string;
}

export function createConsultationDraft(appointment: ConsultationAppointment): ConsultationDraft {
  const reason = (appointment.reason ?? "").trim();
  const matched = COMMON_CHIEF_COMPLAINTS.find(
    (complaint) => complaint !== OTHER_OPTION && complaint.toLowerCase() === reason.toLowerCase()
  );

  return {
    chiefComplaint: matched ?? OTHER_OPTION,
    chiefComplaintOther: matched ? "" : reason,
    diagnosisNotes: "",
    investigations: [],
    investigationsOther: "",
  };
}

export function createMedicationDraft(id: string): MedicationDraft {
  return {
    id,
    name: "",
    dosage: "",
    dosageOther: "",
    frequency: "",
    frequencyOther: "",
    duration: "",
    durationOther: "",
    instructions: "",
    instructionsOther: "",
  };
}

function resolvedDropdownValue(value: string, other: string): string {
  return value === OTHER_OPTION ? other.trim() : value.trim();
}

export function validateConsultationDraft(
  draft: ConsultationDraft,
  medications: MedicationDraft[]
): string | null {
  const chiefComplaint = resolvedDropdownValue(draft.chiefComplaint, draft.chiefComplaintOther);
  if (!chiefComplaint) return "Chief complaint is required.";
  if (!COMMON_CHIEF_COMPLAINTS.includes(draft.chiefComplaint as (typeof COMMON_CHIEF_COMPLAINTS)[number])) {
    return "Choose a listed chief complaint or select Other.";
  }
  if (draft.investigations.includes(OTHER_OPTION) && !draft.investigationsOther.trim()) {
    return "Enter the other investigation.";
  }

  for (const [index, medication] of medications.entries()) {
    if (!medication.name.trim()) return `Enter a drug name for medicine ${index + 1}.`;
    const customOptions = [
      [medication.dosage, medication.dosageOther],
      [medication.frequency, medication.frequencyOther],
      [medication.duration, medication.durationOther],
      [medication.instructions, medication.instructionsOther],
    ];
    if (customOptions.some(([value, other]) => value === OTHER_OPTION && !other.trim())) {
      return `Complete each Other field for medicine ${index + 1}.`;
    }
  }

  const names = medications.map((medication) => medication.name.trim().toLocaleLowerCase());
  if (new Set(names).size !== names.length) return "Remove duplicate medicines from the prescription.";
  return null;
}

export function consultationPayload(draft: ConsultationDraft, medications: MedicationDraft[]) {
  const chiefComplaint = resolvedDropdownValue(draft.chiefComplaint, draft.chiefComplaintOther);
  const investigations = draft.investigations.flatMap((investigation) =>
    investigation === OTHER_OPTION ? [draft.investigationsOther.trim()] : [investigation]
  ).filter(Boolean);

  return {
    chiefComplaint,
    diagnosisNotes: draft.diagnosisNotes.trim(),
    investigations,
    medications: medications.map((medication) => ({
      name: medication.name.trim(),
      dosage: resolvedDropdownValue(medication.dosage, medication.dosageOther),
      frequency: resolvedDropdownValue(medication.frequency, medication.frequencyOther),
      duration: resolvedDropdownValue(medication.duration, medication.durationOther),
      instructions: resolvedDropdownValue(medication.instructions, medication.instructionsOther),
    })),
  };
}

export function getConsultationOptionLists() {
  return {
    dosage: MEDICATION_DOSAGE_OPTIONS,
    frequency: MEDICATION_FREQUENCY_OPTIONS,
    duration: MEDICATION_DURATION_OPTIONS,
    instructions: MEDICATION_INSTRUCTIONS_OPTIONS,
  };
}
