export const OTHER_OPTION = "Other" as const;

export const COMMON_CHIEF_COMPLAINTS = [
  "Fever",
  "Cough / Cold",
  "Headache / Migraine",
  "Abdominal pain",
  "Body ache / Weakness",
  "Follow-up visit",
  OTHER_OPTION,
] as const;

export const COMMON_INVESTIGATIONS = [
  "CBC",
  "Blood sugar",
  "X-ray",
  "ECG",
  "Urine routine",
  "Ultrasound (USG)",
  OTHER_OPTION,
] as const;

export const MEDICATION_DOSAGE_OPTIONS = [
  "1 Tablet",
  "2 Tablets",
  "1 Capsule",
  "5 ml",
  "10 ml",
  "As directed",
  OTHER_OPTION,
] as const;

export const MEDICATION_FREQUENCY_OPTIONS = [
  "Once daily (OD)",
  "Twice daily (BD)",
  "Thrice daily (TDS)",
  "Four times daily (QID)",
  "At bedtime (HS)",
  "S.O.S (as required)",
  OTHER_OPTION,
] as const;

export const MEDICATION_DURATION_OPTIONS = [
  "3 days",
  "5 days",
  "7 days",
  "10 days",
  "14 days",
  "1 month",
  OTHER_OPTION,
] as const;

export const MEDICATION_INSTRUCTIONS_OPTIONS = [
  "After meals",
  "Before meals",
  "With food",
  "On empty stomach",
  "Avoid alcohol",
  "As directed",
  OTHER_OPTION,
] as const;
