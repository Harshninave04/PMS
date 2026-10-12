export function formatDoctorName(name?: string): string {
  if (!name) return "";
  let trimmed = name.trim();
  if (!trimmed) return trimmed;
  while (/^dr\.?\s+/i.test(trimmed)) {
    trimmed = trimmed.replace(/^dr\.?\s+/i, "");
  }
  return `Dr. ${trimmed}`;
}
