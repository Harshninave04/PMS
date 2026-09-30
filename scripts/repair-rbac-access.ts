/**
 * Additive RBAC repair for an existing database.
 *
 * Roles seeded before this fix were missing the read permissions that every
 * form dropdown depends on (departments, doctors, wards/beds, branches, staff),
 * admin roles were missing whole modules, nurses could not open their own task
 * list, and seeded staff had no organization, so every branch-scoped query
 * returned nothing. This script repairs that in place, like `seed:demo`, without
 * the destructive `npm run seed`.
 *
 * It NEVER deletes or narrows anything. It only:
 *   1. adds the baseline reference permissions to every role,
 *   2. completes the access of full-access admin roles,
 *   3. adds nursing task permissions to nurse roles, and
 *   4. attaches users that have neither organization nor branch to the main
 *      organization, when exactly one main organization exists.
 *
 * Usage:
 *   npm run repair:rbac            (dry run, prints what would change)
 *   npm run repair:rbac -- --apply (writes the changes)
 */
import "dotenv/config";
import mongoose from "mongoose";
import type { Collection } from "mongodb";
import {
    BASELINE_ACCESS,
    FULL_ACCESS_ROLES,
    ModuleAccess,
    NURSING_TASK_ACCESS,
    buildFullAccess,
    buildGrant,
    mergeAccess
} from "../src/lib/rbac/role-access";

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/medistra-hms";
const APPLY = process.argv.includes("--apply");

const FULL_ACCESS = buildFullAccess(["clinical.diagnosis.update", "clinical.prescription.update"]);

function additionsFor(roleName: string): ModuleAccess[] {
    const additions: ModuleAccess[] = [...BASELINE_ACCESS];
    if (FULL_ACCESS_ROLES.includes(roleName)) additions.push(...FULL_ACCESS);
    if (roleName.includes("NURSE")) additions.push(NURSING_TASK_ACCESS);
    return additions;
}

async function repairRoles(roles: Collection): Promise<number> {
    let changed = 0;
    for (const role of await roles.find({}).toArray()) {
        const { access, added } = mergeAccess(role.access, additionsFor(role.role));
        if (added.length === 0) continue;

        // Give each newly added permission an explicit grant with the same scope
        // rules the seed uses; existing grants are left untouched.
        const addedSet = new Set(added);
        for (const item of access) {
            const grants = Array.isArray(item.grants) ? [...item.grants] : [];
            for (const perm of item.permissions) {
                if (addedSet.has(perm)) grants.push(buildGrant(perm, role.role));
            }
            item.grants = grants;
        }

        changed++;
        console.log(`   ${role.role.padEnd(24)} +${added.length}: ${added.join(", ")}`);
        if (APPLY) await roles.updateOne({ _id: role._id }, { $set: { access } });
    }
    return changed;
}

async function repairUsers(users: Collection, organizations: Collection, roles: Collection): Promise<number> {
    const mainOrgs = await organizations.find({ branchType: "MAIN" }).toArray();
    if (mainOrgs.length !== 1) {
        console.log(`   skipped: found ${mainOrgs.length} main organizations, cannot pick one automatically.`);
        console.log("   Assign an organization/branch to these users from Admin > Users instead.");
        return 0;
    }
    const mainOrg = mainOrgs[0];

    const superAdmin = await roles.findOne({ role: "SYSTEM_SUPER_ADMIN" }, { projection: { _id: 1 } });
    const unassigned = await users.find({
        organization: null,
        branch: null,
        ...(superAdmin ? { role: { $ne: superAdmin._id } } : {})
    }, { projection: { email: 1 } }).toArray();

    for (const user of unassigned) console.log(`   ${user.email} -> ${mainOrg.organizationName}`);
    if (APPLY && unassigned.length) {
        await users.updateMany(
            { _id: { $in: unassigned.map(u => u._id) } },
            { $set: { organization: mainOrg._id } }
        );
    }
    return unassigned.length;
}

async function repair() {
    console.log(`Target database: ${MONGODB_URI.replace(/\/\/([^:]+):([^@]+)@/, "//$1:****@")}`);
    console.log(APPLY ? "Mode: APPLY\n" : "Mode: DRY RUN (pass --apply to write)\n");
    await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
    const db = mongoose.connection.db;
    if (!db) throw new Error("No database selected after connecting.");

    console.log("1. Adding missing role permissions...");
    const roleCount = await repairRoles(db.collection("roles"));
    console.log(`   ${roleCount} role(s) ${APPLY ? "updated" : "would be updated"}\n`);

    console.log("2. Attaching users without organization or branch...");
    const userCount = await repairUsers(db.collection("users"), db.collection("organizations"), db.collection("roles"));
    console.log(`   ${userCount} user(s) ${APPLY ? "updated" : "would be updated"}`);

    if (APPLY) console.log("\nDone. API access applies on the next request; re-login refreshes the session badge.");
    await mongoose.disconnect();
}

repair()
    .then(() => process.exit(0))
    .catch(async (err) => {
        console.error("RBAC repair failed:", err);
        await mongoose.disconnect().catch(() => undefined);
        process.exit(1);
    });
