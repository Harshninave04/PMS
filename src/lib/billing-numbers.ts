import BillingCounter from "@/models/billing-counter.model";

// Sequential INV-/REC- numbers: INV-YYYYMM-0001 (defect 7.2 — replaces the old
// random 4-digit codes). findOneAndUpdate upsert keeps the increment atomic.
export async function nextBillingNumber(prefix: string): Promise<string> {
    const month = new Date().toISOString().slice(0, 7).replace("-", "");
    const key = `${prefix}-${month}`;
    const counter = await BillingCounter.findOneAndUpdate(
        { key },
        { $inc: { seq: 1 } },
        { new: true, upsert: true }
    ).select("seq").lean();
    const seq = (counter as { seq?: number } | null)?.seq ?? 1;
    return `${prefix}-${month}-${String(seq).padStart(4, "0")}`;
}
