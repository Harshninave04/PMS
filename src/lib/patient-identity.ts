export function normalizePatientName(value: unknown): string {
  return typeof value === "string"
    ? value.trim().toLocaleLowerCase().replace(/\s+/g, " ")
    : "";
}

export function normalizePatientPhone(value: unknown): string {
  return typeof value === "string" ? value.replace(/\D/g, "") : "";
}

export function isPlaceholderPatientName(value: unknown): boolean {
  const normalized = normalizePatientName(value);
  return !normalized || /^(unknown(?: patient)?|patient unknown|emergency(?: patient)?|unnamed|not known|anonymous|n\/?a|-)$/i.test(normalized);
}

export function patientNamePattern(normalizedName: string): RegExp {
  const escapedParts = normalizedName
    .split(" ")
    .filter(Boolean)
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(`^\\s*${escapedParts.join("\\s+")}\\s*$`, "i");
}

export function patientPhonePattern(digits: string): RegExp {
  return new RegExp(`^\\D*${digits.split("").join("\\D*")}\\D*$`);
}
