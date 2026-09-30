import mongoose from "mongoose";
import SystemSetting from "@/models/system-setting.model";
import Role from "@/models/role.model";
import User from "@/models/user.model";
import Organization from "@/models/organization.model";
import Menu from "@/models/menu.model";
import { ensureDefaults } from "@/lib/bootstrap/ensure-defaults";
import {
    BOOTSTRAP_SENTINEL_DONE as SENTINEL_DONE,
    BOOTSTRAP_SENTINEL_IN_PROGRESS as SENTINEL_IN_PROGRESS,
    BOOTSTRAP_SENTINEL_KEY as SENTINEL_KEY,
} from "@/lib/bootstrap/constants";

/**
 * First-run bootstrap.
 *
 * On the very first connection to an empty database this seeds every piece of
 * reference data the app needs to be usable: menus, roles, the super admin,
 * the organization and its branches, departments, designations,
 * specializations, diagnostic catalogs, pharmacy/inventory/procurement
 * catalogs, notification templates, access policies and system settings.
 *
 * Design rules:
 *  - it runs at most once, tracked by a sentinel in SystemSetting
 *  - it NEVER deletes or overwrites anything
 *  - it never creates demo/operational records (sample staff logins, donors,
 *    audit logs, ...) - those remain opt-in via `npm run seed` / `seed:demo`
 *  - failures are logged, never thrown into the request path
 *  - set DISABLE_DEFAULT_BOOTSTRAP=true to opt out
 */

/**
 * A claim older than this is treated as abandoned (the process died mid-seed)
 * and may be taken over.
 */
const CLAIM_STALE_AFTER_MS = 10 * 60 * 1000;

const DUPLICATE_KEY = 11000;

/**
 * Collections that must be empty for the database to count as "brand new".
 * Roles/menus/organizations are included so a partially-migrated database is
 * never mistaken for a fresh install.
 */
const CORE_COLLECTIONS: ReadonlyArray<{ name: string; model: mongoose.Model<unknown> }> = [
    { name: "users", model: User as unknown as mongoose.Model<unknown> },
    { name: "roles", model: Role as unknown as mongoose.Model<unknown> },
    { name: "menus", model: Menu as unknown as mongoose.Model<unknown> },
    { name: "organizations", model: Organization as unknown as mongoose.Model<unknown> }
];

export type FirstRunOutcome = "disabled" | "already-completed" | "seeded" | "not-empty" | "failed";

export interface FirstRunResult {
    outcome: FirstRunOutcome;
    existingDocuments: number;
    collectionsChecked: string[];
}

let firstRunPromise: Promise<FirstRunResult> | null = null;

export function ensureFirstRunSeed(): Promise<FirstRunResult> {
    if (process.env.DISABLE_DEFAULT_BOOTSTRAP === "true") {
        return Promise.resolve({
            outcome: "disabled",
            existingDocuments: 0,
            collectionsChecked: []
        });
    }

    if (!firstRunPromise) {
        firstRunPromise = runFirstRun().catch((error) => {
            // Do not cache a failure - a later request should be able to retry.
            firstRunPromise = null;
            console.error("[bootstrap] First-run seed failed:", error);
            return { outcome: "failed", existingDocuments: 0, collectionsChecked: [] } as FirstRunResult;
        });
    }

    return firstRunPromise;
}

async function runFirstRun(): Promise<FirstRunResult> {
    const collectionsChecked = CORE_COLLECTIONS.map((c) => c.name);

    // 1. Claim the sentinel BEFORE doing any work.
    //
    // SystemSetting.key carries a unique index, so a plain insert doubles as an
    // atomic lock: exactly one process can create the claim, and every other
    // process gets a duplicate-key error and backs off. This matters in Docker,
    // where several replicas (or a restart storm) can hit an empty database at
    // the same moment and would otherwise seed it concurrently.
    const claim = await claimSentinel();
    if (claim === "already-done") {
        return { outcome: "already-completed", existingDocuments: 0, collectionsChecked };
    }
    if (claim === "held-by-other") {
        console.log("[bootstrap] Another process is seeding this database - skipping.");
        return { outcome: "already-completed", existingDocuments: 0, collectionsChecked };
    }
    if (claim === "stale") {
        console.warn("[bootstrap] Taking over an abandoned first-run claim.");
    }

    // 2. Confirm the database really is empty before seeding anything.
    const counts = await Promise.all(CORE_COLLECTIONS.map((c) => c.model.countDocuments()));
    const existingDocuments = counts.reduce((sum, n) => sum + n, 0);

    if (existingDocuments > 0) {
        // Pre-existing database (e.g. created by the old `npm run seed` before
        // this bootstrap existed). Adopt it: only top up roles and the admin,
        // never re-seed reference data over real content.
        await ensureDefaults();
        await markCompleted();
        console.log(
            `[bootstrap] Existing database detected (${existingDocuments} documents). ` +
            "Reference data seeding skipped; roles and admin ensured."
        );
        return { outcome: "not-empty", existingDocuments, collectionsChecked };
    }

    // 3. Genuine first run - seed all required reference data.
    console.log("[bootstrap] Empty database detected - seeding required reference data...");
    // Imported lazily so a normal request never pays the cost of loading the
    // full seed catalog, and so this module stays importable on its own.
    const { seedDatabase } = await import("@/seed");

    await seedDatabase({
        wipe: false,
        demo: false,
        disconnect: false
    });

    await markCompleted();

    console.log("[bootstrap] First-run reference data seeded successfully.");
    return { outcome: "seeded", existingDocuments: 0, collectionsChecked };
}

interface SentinelDoc {
    value: string;
    updatedAt?: Date;
}

async function readSentinel(): Promise<SentinelDoc | null> {
    const doc = await SystemSetting.findOne({ key: SENTINEL_KEY }).lean();
    return doc ? { value: doc.value as string, updatedAt: doc.updatedAt } : null;
}

type ClaimResult = "claimed" | "already-done" | "held-by-other" | "stale";

/**
 * Atomically claims the first-run seed.
 *
 * The unique index on SystemSetting.key makes the insert a compare-and-set: the
 * first caller wins, everyone else observes the duplicate-key error.
 */
async function claimSentinel(): Promise<ClaimResult> {
    const existing = await readSentinel();
    if (existing?.value === SENTINEL_DONE) {
        // Still run the cheap role/admin repair pass.
        await ensureDefaults();
        return "already-done";
    }

    if (existing?.value === SENTINEL_IN_PROGRESS) {
        const age = Date.now() - new Date(existing.updatedAt ?? Date.now()).getTime();
        if (age < CLAIM_STALE_AFTER_MS) {
            return "held-by-other";
        }
        return "stale";
    }

    // The unique index on SystemSetting.key is what makes the insert below a
    // real compare-and-set. Mongoose builds indexes asynchronously, so on a
    // brand-new collection the index may not exist yet - without this wait,
    // concurrent processes would each insert a claim and both go on to seed.
    await ensureSentinelIndex();

    try {
        await SystemSetting.create({
            category: "bootstrap",
            key: SENTINEL_KEY,
            value: SENTINEL_IN_PROGRESS,
            description: "First-run reference data seed in progress."
        });
        return "claimed";
    } catch (error) {
        if ((error as { code?: number })?.code === DUPLICATE_KEY) {
            // Lost the race - another process inserted the claim a moment ago.
            return "held-by-other";
        }
        throw error;
    }
}

let sentinelIndexEnsured = false;

/**
 * Blocks until SystemSetting's unique index on `key` exists.
 *
 * A failure here is not fatal: the worst case is the pre-index behaviour, which
 * the Role unique index still guards against duplicate roles.
 */
async function ensureSentinelIndex(): Promise<void> {
    if (sentinelIndexEnsured) return;
    try {
        await SystemSetting.init();
        sentinelIndexEnsured = true;
    } catch (error) {
        console.warn(
            "[bootstrap] Could not pre-build the bootstrap sentinel index; " +
            "relying on the role unique index to prevent duplicates.",
            error
        );
    }
}

async function markCompleted(): Promise<void> {
    await SystemSetting.updateOne(
        { key: SENTINEL_KEY },
        {
            $set: {
                value: SENTINEL_DONE,
                description: "Set when the first-run reference data seed completed."
            }
        },
        { upsert: true }
    );
}

/**
 * Removes the first-run sentinel so the next connect re-evaluates the database.
 * Intended for tests and manual recovery; prefer `npm run seed` in production.
 */
export async function resetFirstRunSentinel(): Promise<void> {
    await SystemSetting.deleteOne({ key: SENTINEL_KEY });
    firstRunPromise = null;
}

export default ensureFirstRunSeed;
