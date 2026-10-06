/**
 * One-off backfill for databases created before the scoping fields landed.
 *
 * Records written by older builds have no `organizationId` on rooms and beds,
 * no `assignedWards` on nursing staff, no `branchId` on clinical documents, and
 * no `managedBy` marker on roles. Without these, every scoped query silently
 * degrades to "match nothing", which reads as an empty screen rather than an
 * error.
 *
 * The script is deliberately conservative:
 *   - it only ever *adds* a field it can derive from a document that already
 *     exists, and never overwrites a value an operator set by hand;
 *   - anything it cannot derive is counted and reported, never guessed;
 *   - `assignedWards` cannot be derived at all, so it is only reported.
 *
 * Usage:
 *   npm run backfill:scope          (dry run, prints counts)
 *   npm run backfill:scope:apply    (writes the changes)
 */
import "dotenv/config";
import mongoose from "mongoose";

type ObjectId = mongoose.Types.ObjectId;

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/medistra-hms";
const APPLY = process.argv.includes("--apply");

type Countable = { countDocuments(filter: Record<string, unknown>): Promise<number> };

interface Derived {
    collection: string;
    source: string;
    count: number;
}

const derived: Derived[] = [];
const unrecoverable: { collection: string; reason: string; count: number }[] = [];

/** `{ field: null }` in Mongo matches both an explicit null and a missing key. */
const MISSING = { $in: [null] } as Record<string, unknown>;

async function countMissing(
    db: mongoose.Connection,
    collection: string,
    filter: Record<string, unknown>
): Promise<number> {
    const handle = db.collection(collection) as unknown as Countable;
    return await handle.countDocuments(filter);
}

/**
 * Copy `sourceField` onto `targetField` for documents that are missing the
 * target, joining on `localField` -> `_id` of `fromCollection`.
 */
async function backfillFromRef(
    db: mongoose.Connection,
    collection: string,
    fromCollection: string,
    localField: string,
    sourceField: string,
    targetField: string
): Promise<number> {
    const handle = db.collection(collection);
    const missing = { [targetField]: MISSING };
    if (!APPLY) return await handle.countDocuments(missing);

    // Read the unresolved documents and resolve them here rather than with an
    // aggregation pipeline: a $merge writes but reports no count, and joining
    // in the shell would make it impossible to tell a resolved document from an
    // unresolvable one.
    const candidates = (await handle
        .find(missing, { projection: { [localField]: 1 } })
        .toArray()) as Record<string, unknown>[];

    if (!candidates.length) return 0;

    const ids = candidates
        .map((doc) => doc[localField])
        .filter((value): value is ObjectId => value instanceof mongoose.Types.ObjectId);

    const sources = new Map<string, unknown>();
    if (ids.length) {
        const sourceDocs = (await db
            .collection(fromCollection)
            .find({ _id: { $in: ids } }, { projection: { [sourceField]: 1 } })
            .toArray()) as Record<string, unknown>[];
        for (const source of sourceDocs) {
            const value = source[sourceField];
            // A source that itself has no value tells us nothing; leave it be.
            if (value !== undefined && value !== null) sources.set(String(source._id), value);
        }
    }

    const operations = candidates
        .filter((doc) => doc._id && doc[localField] && sources.has(String(doc[localField])))
        .map((doc) => ({
            updateOne: {
                filter: { _id: doc._id as ObjectId, [targetField]: MISSING },
                update: { $set: { [targetField]: sources.get(String(doc[localField])) } },
            },
        }));

    if (!operations.length) return 0;
    const result = await handle.bulkWrite(operations, { ordered: false });
    return result.modifiedCount;
}

async function backfill() {
    console.log(`Target database: ${MONGODB_URI.replace(/\/\/([^:]+):([^@]+)@/, "//$1:****@")}`);
    console.log(APPLY ? "Mode: APPLY\n" : "Mode: DRY RUN (pass --apply to write)\n");

    await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
    const db = mongoose.connection;

    try {
        // 1. Rooms inherit their organization from the ward they sit in.
        const roomsMissing = await countMissing(db, "rooms", { organizationId: MISSING });
        derived.push({ collection: "rooms", source: "wardId -> wards.organizationId", count: roomsMissing });
        const roomsWritten = await backfillFromRef(
            db,
            "rooms",
            "wards",
            "wardId",
            "organizationId",
            "organizationId"
        );

        // 2. Beds inherit their organization from the room's ward.
        const bedsMissing = await countMissing(db, "beds", { organizationId: MISSING });
        derived.push({ collection: "beds", source: "roomId -> rooms.organizationId", count: bedsMissing });
        const bedsWritten = await backfillFromRef(
            db,
            "beds",
            "rooms",
            "roomId",
            "organizationId",
            "organizationId"
        );

        // 3. Clinical documents inherit their branch from the patient's branch,
        //    which is how patients themselves are scoped.
        for (const collection of ["admissions", "prescriptions", "invoices", "payments", "appointments"]) {
            const missing = await countMissing(db, collection, { branchId: MISSING });
            if (!missing) continue;
            derived.push({ collection, source: "patientId -> patients.branchId", count: missing });
            await backfillFromRef(db, collection, "patients", "patientId", "branchId", "branchId");
        }

        // 4. Roles created before `managedBy` existed were code-owned, so the
        //    boot-time reconciler is allowed to keep refreshing them.
        const rolesMissing = await countMissing(db, "roles", { managedBy: MISSING });
        if (rolesMissing) {
            if (APPLY) {
                await db
                    .collection("roles")
                    .updateMany({ managedBy: MISSING }, { $set: { managedBy: "code" } });
            }
            derived.push({ collection: "roles", source: "default 'code'", count: rolesMissing });
        }

        // 5. Ward rostering has no derivable source. A nurse's assigned wards
        //    are a rostering decision, so guessing them would grant or deny
        //    clinical access to real patients. Report for manual assignment.
        const staffMissing = await countMissing(db, "staffs", {
            $or: [{ assignedWards: MISSING }, { assignedWards: { $size: 0 } }],
        });
        if (staffMissing) {
            unrecoverable.push({
                collection: "staffs",
                reason: "assignedWards is a rostering decision — assign wards in Settings > Staff",
                count: staffMissing,
            });
        }

        console.log("Derivable:");
        if (!derived.length) console.log("   nothing to do");
        for (const entry of derived) {
            console.log(`   ${entry.collection.padEnd(15)} ${String(entry.count).padStart(6)}  ${entry.source}`);
        }

        if (unrecoverable.length) {
            console.log("\nNeeds manual attention:");
            for (const entry of unrecoverable) {
                console.log(`   ${entry.collection.padEnd(15)} ${String(entry.count).padStart(6)}  ${entry.reason}`);
            }
        }

        if (!APPLY) {
            console.log("\nNothing was written. Re-run with --apply to make these changes.");
            return;
        }

        console.log(
            `\nDone. ${roomsWritten} room(s) and ${bedsWritten} bed(s) updated in this run; ` +
            "sign staff out and back in so their scope is rebuilt."
        );
    } finally {
        await mongoose.disconnect();
    }
}

backfill()
    .then(() => process.exit(0))
    .catch(async (err) => {
        console.error("Scope backfill failed:", err);
        await mongoose.disconnect().catch(() => undefined);
        process.exit(1);
    });
