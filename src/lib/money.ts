/**
 * Shared money helpers (client + server). All rupee values in the app are
 * stored and displayed with at most 2 decimal places; every sum that the
 * server recomputes must go through round2 so totals are byte-stable.
 */
export function num(value: unknown): number {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
}

export function round2(value: number): number {
    const n = num(value);
    return Math.round(n * 100 + Number.EPSILON * Math.sign(n || 1)) / 100;
}

export function fmtMoney(value: unknown): string {
    return `₹${round2(num(value)).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}
