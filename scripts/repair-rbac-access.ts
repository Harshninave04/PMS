/**
 * Optional maintenance command. The app already reconciles roles and menus on
 * boot (`src/instrumentation.ts` -> `src/lib/rbac/canonical-sync.ts`), so you
 * should not need this after a normal install or upgrade.
 *
 * Use it when you want to see, or force, the reconciliation without restarting
 * the app — for example to check what an old database would be migrated to, or
 * to repair one while the server is stopped.
 *
 * It shares its implementation with the boot-time reconciler, so both do
 * exactly the same thing. It never deletes a user: roles with no equivalent are
 * reported and left alone.
 *
 * Usage:
 *   npm run repair:rbac          (dry run, prints what would change)
 *   npm run repair:rbac:apply    (writes the changes)
 */
import "dotenv/config";
import mongoose from "mongoose";
import {
    reconcileCanonicalAccess,
    reportHasChanges,
    type ReconcileReport,
} from "../src/lib/rbac/canonical-sync";

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/medistra-hms";
const APPLY = process.argv.includes("--apply");

function summarise(report: ReconcileReport): void {
    console.log(`   menus            ${report.menus}`);
    if (report.rolesCreated.length) console.log(`   roles created    ${report.rolesCreated.join(", ")}`);
    if (report.rolesRefreshed.length) console.log(`   roles refreshed  ${report.rolesRefreshed.join(", ")}`);
    if (report.legacyRolesDeleted.length) console.log(`   old roles removed ${report.legacyRolesDeleted.join(", ")}`);
    if (report.usersMoved) console.log(`   users moved      ${report.usersMoved}`);

    for (const entry of report.legacyRolesKept) {
        console.log(
            `   kept ${entry.role}: ${entry.users} user(s) have no equivalent role, reassign them in Settings > Users`
        );
    }
    if (report.usersAttachedToHospital) {
        console.log(`   users attached to the hospital  ${report.usersAttachedToHospital}`);
    }
}

async function repair() {
    console.log(`Target database: ${MONGODB_URI.replace(/\/\/([^:]+):([^@]+)@/, "//$1:****@")}`);
    console.log(APPLY ? "Mode: APPLY\n" : "Mode: DRY RUN (pass --apply to write)\n");

    await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
    try {
        const report = await reconcileCanonicalAccess({
            apply: APPLY,
            log: (message) => console.log(`   ${message}`),
        });

        summarise(report);
        console.log("");
        if (!reportHasChanges(report)) {
            console.log("Roles and menus already match this build. Nothing to do.");
        } else if (APPLY) {
            console.log("Done. Users must log out and back in to pick up their new role.");
        } else {
            console.log("Nothing was written. Re-run with --apply to make these changes.");
        }
    } finally {
        await mongoose.disconnect();
    }
}

repair()
    .then(() => process.exit(0))
    .catch(async (err) => {
        console.error("RBAC repair failed:", err);
        await mongoose.disconnect().catch(() => undefined);
        process.exit(1);
    });