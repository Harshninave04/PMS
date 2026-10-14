/**
 * Pure dose-expansion for inpatient medication orders.
 *
 * Kept free of server-only imports so ward-round tests and client components
 * (dose preview) can use it too.
 */

export const MAX_DOSES_PER_ORDER = 150;

/** Suggested clock times per frequency; the doctor may edit them. */
export const FREQUENCY_SUGGESTIONS: Record<string, string[]> = {
    STAT: [],
    OD: ["08:00"],
    BD: ["08:00", "20:00"],
    TDS: ["08:00", "14:00", "20:00"],
    QID: ["06:00", "12:00", "18:00", "22:00"],
    Q6H: ["06:00", "12:00", "18:00", "00:00"],
    Q8H: ["06:00", "14:00", "22:00"],
    Q12H: ["08:00", "20:00"],
    HS: ["21:00"],
    PRN: [],
};

/**
 * A dose may be given at or after its scheduled time — never before.
 * A 3pm dose given at 2:59pm is rejected; at 3:00pm or later it is allowed.
 */
export function isDoseDue(scheduledTime: Date | string, now: Date | string = new Date()): boolean {
    return new Date(now).getTime() >= new Date(scheduledTime).getTime();
}

/** Human label for how far away a scheduled dose is. */
export function dueInLabel(scheduledTime: Date | string, now: Date | string = new Date()): string {
    const diffMs = new Date(scheduledTime).getTime() - new Date(now).getTime();
    if (diffMs <= 0) return "due now";
    const mins = Math.floor(diffMs / 60000);
    if (mins < 60) return `due in ${mins} min`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `due in ${hours}h ${mins % 60}m`;
    return `due in ${Math.floor(hours / 24)}d ${hours % 24}h`;
}

export function expandDoseTimes(
    startDate: Date,
    durationDays: number,
    timesOfDay: string[],
    frequency: string,
    now: Date = new Date()
): Date[] {
    if (frequency === "PRN") return [];
    if (frequency === "STAT") return [new Date(now)];

    const days = Math.max(1, Math.min(30, Math.floor(durationDays) || 1));
    const times = [...new Set(timesOfDay)].sort();
    const doses: Date[] = [];
    const base = new Date(startDate);
    for (let d = 0; d < days; d++) {
        for (const t of times) {
            const [h, m] = t.split(":").map(Number);
            const dose = new Date(base);
            dose.setDate(base.getDate() + d);
            dose.setHours(h, m, 0, 0);
            doses.push(dose);
            if (doses.length >= MAX_DOSES_PER_ORDER) return doses;
        }
    }
    return doses;
}
