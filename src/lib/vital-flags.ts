/**
 * Heuristic review flags for bedside vitals.
 *
 * These are the same cutoffs the vitals pages already render as badges —
 * centralised here so every surface agrees. They are a highlight for the
 * care team, NOT a clinical protocol: escalation thresholds must be set by
 * qualified clinical stakeholders.
 */
export type VitalFlag = "CRITICAL" | "WATCH" | "NORMAL";

export interface VitalReading {
    bloodPressure?: string;
    heartRate?: number;
    oxygenSaturation?: number;
    respiratoryRate?: number;
    temperature?: number;
}

export function flagVitalForReview(v: VitalReading): VitalFlag {
    const hr = v.heartRate;
    const spo2 = v.oxygenSaturation;
    const temp = v.temperature;
    if (
        (spo2 !== undefined && spo2 < 92) ||
        (hr !== undefined && (hr > 120 || hr < 50)) ||
        (temp !== undefined && temp > 39)
    ) {
        return "CRITICAL";
    }
    if (
        (spo2 !== undefined && spo2 < 95) ||
        (hr !== undefined && (hr > 100 || hr < 60)) ||
        (temp !== undefined && temp > 37.8)
    ) {
        return "WATCH";
    }
    return "NORMAL";
}
