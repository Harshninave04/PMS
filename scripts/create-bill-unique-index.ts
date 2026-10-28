/**
 * One-off maintenance script — partial unique index on Invoice.admissionId.
 *
 * RUN MANUALLY ONLY:  npx tsx scripts/create-bill-unique-index.ts
 * Never at app startup, never from seed. Prerequisite: mongodump backup first.
 *
 * What it does:
 *   1. Scans for existing duplicates (admissionId, non-cancelled status) and
 *      ABORTS without creating anything if any are found.
 *   2. Tries the user-required status $in partial filter first; MongoDB does
 *      not support $in in partialFilterExpression (only eq, $exists true,
 *      $gt/$gte/$lt/$lte, $type and a guarded $and), so this is expected to
 *      fail and fall through.
 *   3. Creates the supported equivalent using the isActive marker surfaced in
 *      the schema (set false when an invoice is cancelled):
 *         { admissionId: { $type: "objectId" }, isActive: true }
 *      Documents already in the database before this change carry no isActive
 *      and therefore stay unindexed — they are covered by the API-level
 *      duplicate pre-check instead. Nothing existing is modified.
 */
import mongoose from "mongoose";

const uri = process.env.MONGODB_URI;
if (!uri) {
    console.error("MONGODB_URI is required in the environment");
    process.exit(1);
}

const INDEX_NAME = "uniq_admissionId_active";

async function duplicateCheck(collection: mongoose.Collection) {
    const duplicates = await collection
        .aggregate([
            {
                $match: {
                    admissionId: { $type: "objectId" },
                    status: { $ne: "CANCELLED" },
                },
            },
            {
                $group: {
                    _id: "$admissionId",
                    count: { $sum: 1 },
                    invoices: { $push: "$invoiceNumber" },
                },
            },
            { $match: { count: { $gt: 1 } } },
        ])
        .toArray();
    return duplicates as Array<{ _id: unknown; count: number; invoices: string[] }>;
}

async function createStatusInIndex(collection: mongoose.Collection) {
    try {
        await collection.createIndex(
            { admissionId: 1 },
            {
                unique: true,
                name: `${INDEX_NAME}_status_in`,
                partialFilterExpression: {
                    admissionId: { $type: "objectId" },
                    status: { $in: ["UNPAID", "PARTIALLY_PAID", "PAID"] },
                },
            }
        );
        console.log("Created unique index with the status $in partial filter.");
        return true;
    } catch (error) {
        console.log(
            `status $in partial filter rejected (expected: $in is unsupported in partialFilterExpression): ${
                error instanceof Error ? error.message : String(error)
            }`
        );
        return false;
    }
}

async function main() {
    console.log("Connecting…");
    await mongoose.connect(uri as string);
    const collection = mongoose.connection.collection("invoices");

    console.log("Step 1 — duplicate pre-check (non-cancelled invoices per admission)…");
    const duplicates = await duplicateCheck(collection);
    if (duplicates.length > 0) {
        console.error("ABORTING — duplicate non-cancelled invoices per admission were found:");
        for (const d of duplicates) {
            console.error(`  admissionId ${String(d._id)} → ${d.count} invoice(s): ${d.invoices.join(", ")}`);
        }
        console.error("Resolve the duplicates manually (cancel/void the extras) and re-run this script.");
        await mongoose.disconnect();
        process.exit(2);
    }
    console.log("  no duplicates found ✓");

    console.log("Step 2 — trying the status $in partial filter…");
    const direct = await createStatusInIndex(collection);
    if (direct) {
        await mongoose.disconnect();
        console.log("Done.");
        return;
    }

    console.log("Step 3 — creating the isActive-based partial unique index…");
    await collection.createIndex(
        { admissionId: 1 },
        {
            unique: true,
            name: INDEX_NAME,
            partialFilterExpression: {
                admissionId: { $type: "objectId" },
                isActive: true,
            },
        }
    );
    console.log("Created unique index name: " + INDEX_NAME);
    console.log(
        "Note: documents predating this change have no isActive field and stay outside the index; " +
            "the invoice API pre-check still protects them. Optionally backfill isActive=true for " +
            "non-cancelled old invoices later (user-approved data change only)."
    );
    await mongoose.disconnect();
    console.log("Done.");
}

main().catch(async (error) => {
    console.error(error);
    try {
        await mongoose.disconnect();
    } catch {
        /* ignore */
    }
    process.exit(1);
});
