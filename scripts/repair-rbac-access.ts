/**
 * Moves an existing database onto the simplified setup without `npm run seed`
 * (which wipes users, roles and menus).
 *
 * It:
 *   1. creates or refreshes the 6 fixed roles (Admin, Doctor, Nurse,
 *      Receptionist, Pharmacist, Accountant) with their canonical access,
 *   2. replaces the sidebar menus with the simplified menu,
 *   3. moves users from the old role names onto the matching new role, and
 *      deletes old roles that no user holds any more,
 *   4. attaches users that have neither organization nor branch to the
 *      hospital, when exactly one main organization exists.
 *
 * Users on roles with no equivalent (e.g. lab or HR roles) are listed and left
 * untouched; reassign them from Settings > Users.
 *
 * Usage:
 *   npm run repair:rbac            (dry run, prints what would change)
 *   npm run repair:rbac -- --apply (writes the changes)
 */
import "dotenv/config";
import mongoose from "mongoose";
import type { Collection, ObjectId } from "mongodb";
import { ALL_ROLES, buildRoleAccess } from "../src/lib/rbac/role-access";
import { MENUS, getMenuModuleKey } from "../src/lib/menu-data";

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/medistra-hms";
const APPLY = process.argv.includes("--apply");

/** Old role name -> new role name. */
const LEGACY_ROLE_MAP: Record<string, string> = {
    SYSTEM_SUPER_ADMIN: "ADMIN",
    ORGANIZATION_ADMIN: "ADMIN",
    HOSPITAL_ADMIN: "ADMIN",
    BRANCH_MANAGER: "ADMIN",
    DOCTOR: "DOCTOR",
    CONSULTANT: "DOCTOR",
    EMERGENCY_DOCTOR: "DOCTOR",
    NURSE: "NURSE",
    NURSE_MANAGER: "NURSE",
    EMERGENCY_NURSE: "NURSE",
    OT_NURSE: "NURSE",
    RECEPTIONIST: "RECEPTIONIST",
    FRONT_DESK_MANAGER: "RECEPTIONIST",
    PHARMACIST: "PHARMACIST",
    PHARMACY_MANAGER: "PHARMACIST",
    CASHIER: "ACCOUNTANT",
    BILLING_OFFICER: "ACCOUNTANT",
    BILLING_MANAGER: "ACCOUNTANT",
    FINANCE_MANAGER: "ACCOUNTANT",
};

async function syncRoles(roles: Collection): Promise<Map<string, ObjectId>> {
    const ids = new Map<string, ObjectId>();
    for (const roleName of ALL_ROLES) {
        const existing = await roles.findOne({ role: roleName }, { projection: { _id: 1 } });
        console.log(`   ${roleName.padEnd(14)} ${existing ? "refresh access" : "create"}`);
        if (!APPLY) {
            if (existing) ids.set(roleName, existing._id);
            continue;
        }
        const access = buildRoleAccess(roleName);
        if (existing) {
            await roles.updateOne({ _id: existing._id }, { $set: { access } });
            ids.set(roleName, existing._id);
        } else {
            const now = new Date();
            const res = await roles.insertOne({ role: roleName, access, createdAt: now, updatedAt: now });
            ids.set(roleName, res.insertedId);
        }
    }
    return ids;
}

async function syncMenus(menus: Collection): Promise<void> {
    console.log(`   replace ${await menus.countDocuments()} menu item(s) with ${MENUS.length} menus`);
    if (!APPLY) return;
    await menus.deleteMany({});
    const now = new Date();
    for (const { children, ...parent } of MENUS) {
        const parentKey = getMenuModuleKey(parent);
        const childIds: ObjectId[] = [];
        for (const child of children ?? []) {
            const res = await menus.insertOne({ ...child, icon: "", children: [], moduleKey: getMenuModuleKey(child) || parentKey, createdAt: now, updatedAt: now });
            childIds.push(res.insertedId);
        }
        await menus.insertOne({ ...parent, moduleKey: parentKey, children: childIds, createdAt: now, updatedAt: now });
    }
}

async function migrateUsers(users: Collection, roles: Collection, newRoleIds: Map<string, ObjectId>): Promise<void> {
    const legacyRoles = await roles.find({ role: { $nin: [...ALL_ROLES] } }).toArray();

    for (const legacy of legacyRoles) {
        const holders = await users.countDocuments({ role: legacy._id });
        const target = LEGACY_ROLE_MAP[legacy.role];

        if (holders > 0 && !target) {
            console.log(`   ${legacy.role.padEnd(24)} ${holders} user(s) kept — no equivalent role, reassign manually`);
            continue;
        }
        if (holders > 0) {
            console.log(`   ${legacy.role.padEnd(24)} ${holders} user(s) -> ${target}`);
            const targetId = newRoleIds.get(target);
            if (APPLY && targetId) await users.updateMany({ role: legacy._id }, { $set: { role: targetId } });
        }
        console.log(`   ${legacy.role.padEnd(24)} delete role`);
        if (APPLY) await roles.deleteOne({ _id: legacy._id });
    }
}

async function attachUnassignedUsers(users: Collection, organizations: Collection): Promise<void> {
    const mainOrgs = await organizations.find({ branchType: "MAIN" }).toArray();
    if (mainOrgs.length !== 1) {
        console.log(`   skipped: found ${mainOrgs.length} main organizations, cannot pick one automatically.`);
        return;
    }
    const hospital = mainOrgs[0];
    const unassigned = await users.find({ organization: null, branch: null }, { projection: { email: 1 } }).toArray();
    for (const user of unassigned) console.log(`   ${user.email} -> ${hospital.organizationName}`);
    if (APPLY && unassigned.length) {
        await users.updateMany({ _id: { $in: unassigned.map(u => u._id) } }, { $set: { organization: hospital._id } });
    }
}

async function repair() {
    console.log(`Target database: ${MONGODB_URI.replace(/\/\/([^:]+):([^@]+)@/, "//$1:****@")}`);
    console.log(APPLY ? "Mode: APPLY\n" : "Mode: DRY RUN (pass --apply to write)\n");
    await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
    const db = mongoose.connection.db;
    if (!db) throw new Error("No database selected after connecting.");

    console.log("1. Roles");
    const roleIds = await syncRoles(db.collection("roles"));

    console.log("\n2. Menus");
    await syncMenus(db.collection("menus"));

    console.log("\n3. Users on old roles");
    await migrateUsers(db.collection("users"), db.collection("roles"), roleIds);

    console.log("\n4. Users without a hospital");
    await attachUnassignedUsers(db.collection("users"), db.collection("organizations"));

    if (APPLY) console.log("\nDone. Users must log out and back in to pick up their new role.");
    await mongoose.disconnect();
}

repair()
    .then(() => process.exit(0))
    .catch(async (err) => {
        console.error("RBAC repair failed:", err);
        await mongoose.disconnect().catch(() => undefined);
        process.exit(1);
    });
