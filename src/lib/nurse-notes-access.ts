/** Accountants must not read or append nursing discharge notes. */
export function nurseNotesForbiddenStatus(roleName?: string | null): 403 | null {
  return roleName?.trim().toUpperCase() === "ACCOUNTANT" ? 403 : null;
}
