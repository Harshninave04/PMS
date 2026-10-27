/**
 * Indian-format dates (dd/mm/yyyy) shared by every billing screen.
 */
export function formatDateIN(value: Date | string | number | null | undefined): string {
    if (value === null || value === undefined || value === "") return "";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" });
}
