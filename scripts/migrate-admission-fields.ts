import "dotenv/config";
import mongoose from "mongoose";
import Admission from "../src/models/admission.model";
import AdmissionSequence from "../src/models/admission-sequence.model";

const APPLY = process.argv.includes("--apply");
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/medistra-hms";
const IPD_NUMBER_PATTERN = /^IPD-(\d{4})-(\d{4,})$/;

interface LegacyAdmission {
    _id: mongoose.Types.ObjectId;
    admissionDate?: Date | string;
    ipdNumber?: string | null;
    admissionSource?: string | null;
    consentSigned?: boolean | null;
    consentPending?: boolean | null;
    wardType?: string | null;
}

function yearFor(admission: LegacyAdmission): number {
    const date = admission.admissionDate ? new Date(admission.admissionDate) : new Date();
    return Number.isNaN(date.getTime()) ? new Date().getFullYear() : date.getFullYear();
}

async function main() {
    console.log(APPLY ? "Mode: APPLY" : "Mode: DRY RUN (no writes)");
    await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
    try {
        const admissions = await Admission.find({})
            .select("_id admissionDate ipdNumber admissionSource consentSigned consentPending wardType")
            .sort({ admissionDate: 1, _id: 1 })
            .lean<LegacyAdmission[]>();
        const sequences = new Map<number, number>();
        const seenNumbers = new Set<string>();

        for (const admission of admissions) {
            if (!admission.ipdNumber) continue;
            if (seenNumbers.has(admission.ipdNumber)) {
                throw new Error(`Duplicate IPD number found: ${admission.ipdNumber}`);
            }
            seenNumbers.add(admission.ipdNumber);
            const match = IPD_NUMBER_PATTERN.exec(admission.ipdNumber);
            if (match) {
                const year = Number(match[1]);
                sequences.set(year, Math.max(sequences.get(year) || 0, Number(match[2])));
            }
        }

        const missing = admissions.filter((admission) => !admission.ipdNumber);
        console.log(`${admissions.length} admission(s) inspected; ${missing.length} need an IPD number.`);

        for (const admission of missing) {
            const year = yearFor(admission);
            const next = (sequences.get(year) || 0) + 1;
            sequences.set(year, next);
            const ipdNumber = `IPD-${year}-${String(next).padStart(4, "0")}`;
            console.log(`  ${String(admission._id)} -> ${ipdNumber}`);
            if (APPLY) {
                await Admission.updateOne(
                    { _id: admission._id, $or: [{ ipdNumber: { $exists: false } }, { ipdNumber: null }] },
                    { $set: { ipdNumber } }
                );
            }
        }

        for (const admission of admissions) {
            const defaults: Record<string, unknown> = {};
            if (admission.admissionSource == null) defaults.admissionSource = "DIRECT";
            if (admission.consentSigned == null) defaults.consentSigned = false;
            if (admission.consentPending == null) defaults.consentPending = false;
            if (admission.wardType == null) defaults.wardType = "GENERAL";
            if (APPLY && Object.keys(defaults).length > 0) {
                await Admission.updateOne({ _id: admission._id }, { $set: defaults });
            }
        }

        if (APPLY) {
            for (const [year, sequence] of sequences) {
                await AdmissionSequence.updateOne({ year }, { $max: { sequence } }, { upsert: true });
            }
            await Admission.collection.createIndex(
                { ipdNumber: 1 },
                {
                    unique: true,
                    partialFilterExpression: { ipdNumber: { $type: "string" } },
                    name: "admission_ipd_number_unique"
                }
            );
            await AdmissionSequence.collection.createIndex(
                { year: 1 },
                { unique: true, name: "admission_sequence_year_unique" }
            );
            console.log("Admission defaults, IPD numbers, counters and unique indexes were migrated.");
        } else {
            console.log("Nothing was written. Pass --apply to migrate existing admission records.");
        }
    } finally {
        await mongoose.disconnect();
    }
}

main().catch(async (error: unknown) => {
    console.error("Admission fields migration failed:", error);
    await mongoose.disconnect().catch(() => undefined);
    process.exit(1);
});
