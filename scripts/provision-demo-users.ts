/**
 * Additive demo-user provisioning.
 *
 * `npm run seed` is destructive: it clears every user, role, menu and staff
 * record before reseeding. That is fine for a disposable database but unsafe
 * against a live hospital database, so this script exists to provision demo
 * logins without touching anything that is already there.
 *
 * This script NEVER deletes or replaces existing records. It only:
 *   1. grants `dashboard.dashboard.view` to roles that are missing it, and
 *   2. creates or refreshes the shared-credential demo accounts.
 *
 * Usage (from inside the compose network, so the same database is targeted):
 *   SEED_DEMO_USERS=true npm run seed:demo
 *
 * MONGODB_URI must point at the database the running app actually uses. When
 * the app runs under docker compose that is the internal `mongodb` host, not
 * the host-published port.
 */
import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/medistra-hms";
const DEMO_ENABLED = process.env.SEED_DEMO_USERS === "true";
const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD || "Demo@2026";
const DEMO_DOMAIN = "@medistra.hospital";

const DASHBOARD_MODULE = "dashboard";
const DASHBOARD_PERMISSION = "dashboard.dashboard.view";

/**
 * One login per dashboard profile defined in src/lib/rbac/dashboard-profiles.ts.
 * Tuple: [profileKey, roleName, displayName] - mirrors src/seed.ts so both
 * entry points provision identical accounts.
 */
const DEMO_USER_MATRIX: [string, string, string][] = [
    ["administration", "SYSTEM_SUPER_ADMIN", "Demo Super Admin"],
    ["administration", "HOSPITAL_ADMIN", "Demo Hospital Admin"],
    ["itAdministration", "SYSTEM_IT_ADMIN", "Demo IT Administrator"],
    ["audit", "SYSTEM_AUDITOR", "Demo Compliance Auditor"],
    ["clinical", "DOCTOR", "Demo Doctor"],
    ["nursing", "NURSE", "Demo Nurse"],
    ["laboratory", "LAB_TECHNICIAN", "Demo Lab Technician"],
    ["radiology", "RADIOLOGIST", "Demo Radiologist"],
    ["pharmacy", "PHARMACIST", "Demo Pharmacist"],
    ["inventory", "STOREKEEPER", "Demo Storekeeper"],
    ["procurement", "PROCUREMENT_OFFICER", "Demo Procurement Officer"],
    ["frontDesk", "RECEPTIONIST", "Demo Receptionist"],
    ["finance", "CASHIER", "Demo Cashier"],
    ["humanResources", "HR_OFFICER", "Demo HR Officer"],
    ["bloodBank", "BLOOD_BANK_TECHNICIAN", "Demo Blood Bank Technician"],
    ["insurance", "INSURANCE_OFFICER", "Demo Insurance Officer"],
    ["emergency", "EMERGENCY_DOCTOR", "Demo Emergency Doctor"],
    ["operationTheatre", "OT_NURSE", "Demo OT Nurse"],
    ["wards", "BRANCH_MANAGER", "Demo Ward Administrator"]
];

interface AccessItem {
    moduleName: string;
    permissions?: string[];
    grants?: Array<{ permission: string; orgScope: string; relScope: string }>;
    [key: string]: unknown;
}

/** Mirrors the scope rules applied by enrichAccessWithGrants() in src/seed.ts. */
function defaultOrgScopeFor(roleName: string): string {
    if (roleName.includes("SYSTEM_")) return "GLOBAL";
    if (roleName.includes("ORGANIZATION")) return "ORGANIZATION";
    return "BRANCH";
}

function buildDashboardAccess(roleName: string): AccessItem {
    const orgScope = defaultOrgScopeFor(roleName);
    return {
        moduleName: DASHBOARD_MODULE,
        permissions: [DASHBOARD_PERMISSION],
        grants: [{ permission: DASHBOARD_PERMISSION, orgScope, relScope: "UNRESTRICTED" }]
    };
}

/** True when the role already carries the dashboard view permission. */
function hasDashboardAccess(access: unknown): boolean {
    if (!Array.isArray(access)) return false;
    return access.some((item: AccessItem) => {
        const isDashboard = (item?.moduleName || "").toLowerCase().trim() === DASHBOARD_MODULE;
        if (!isDashboard) return false;
        if (Array.isArray(item.permissions) && item.permissions.includes(DASHBOARD_PERMISSION)) return true;
        return Array.isArray(item.grants) && item.grants.some(g => g?.permission === DASHBOARD_PERMISSION);
    });
}

/**
 * Adds the dashboard grant to roles that lack it, leaving every other module
 * grant byte-for-byte intact.
 */
async function ensureDashboardGrants(roles: any): Promise<{ updated: string[]; skipped: string[] }> {
    const updated: string[] = [];
    const skipped: string[] = [];
    const allRoles = await roles.find({}).toArray();

    for (const role of allRoles) {
        if (hasDashboardAccess(role.access)) {
            skipped.push(role.role);
            continue;
        }
        const access: AccessItem[] = Array.isArray(role.access) ? [...role.access] : [];
        access.push(buildDashboardAccess(role.role));
        await roles.updateOne({ _id: role._id }, { $set: { access } });
        updated.push(role.role);
    }
    return { updated, skipped };
}

/**
 * Creates the demo accounts, or refreshes them when they already exist.
 * Only addresses `demo.*@medistra.hospital`; no other user is ever written.
 */
async function ensureDemoUsers(users: any, rolesByName: Map<string, any>): Promise<{ created: string[]; refreshed: string[] }> {
    const created: string[] = [];
    const refreshed: string[] = [];
    const password = await bcrypt.hash(DEMO_PASSWORD, 10);

    for (const [profileKey, roleName, displayName] of DEMO_USER_MATRIX) {
        const role = rolesByName.get(roleName);
        if (!role) {
            console.warn(`   ! skipping ${roleName}: role not found in this database`);
            continue;
        }

        const email = `demo.${roleName.toLowerCase()}${DEMO_DOMAIN}`;
        const existing = await users.findOne({ email });

        if (existing) {
            await users.updateOne(
                { _id: existing._id },
                { $set: { name: displayName, password, role: role._id, isActive: true } }
            );
            refreshed.push(email);
        } else {
            await users.insertOne({
                name: displayName,
                email,
                password,
                gender: "UNSPECIFIED",
                role: role._id,
                isActive: true,
                lastLoginAt: null
            });
            created.push(email);
        }
        console.log(`   - ${profileKey.padEnd(18)} ${email.padEnd(44)} [${roleName}]`);
    }
    return { created, refreshed };
}

async function provision() {
    if (!DEMO_ENABLED) {
        console.log("SEED_DEMO_USERS is not \"true\" - nothing to do.");
        console.log("Re-run with SEED_DEMO_USERS=true to provision the demo logins.");
        await mongoose.disconnect();
        return;
    }

    console.log(`Target database: ${MONGODB_URI.replace(/\/\/([^:]+):([^@]+)@/, "//$1:****@")}`);
    await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
    const db = mongoose.connection.db;
    if (!db) throw new Error("No database selected after connecting.");

    const users = db.collection("users");
    const roles = db.collection("roles");

    const userCountBefore = await users.countDocuments({});
    const demoBefore = await users.countDocuments({ email: { $regex: `^demo\\..*${DEMO_DOMAIN}$` } });
    console.log(`Existing users: ${userCountBefore} (demo accounts: ${demoBefore})`);

    console.log("\n1. Ensuring every role can load its dashboard...");
    const grants = await ensureDashboardGrants(roles);
    console.log(`   granted to ${grants.updated.length} role(s), already present on ${grants.skipped.length}`);
    if (grants.updated.length) console.log(`   added: ${grants.updated.join(", ")}`);

    console.log(`\n2. Provisioning ${DEMO_USER_MATRIX.length} demo logins (password: ${DEMO_PASSWORD})...`);
    const rolesByName = new Map<string, any>();
    for (const role of await roles.find({}, { projection: { role: 1 } }).toArray()) rolesByName.set(role.role, role);
    const users2 = await ensureDemoUsers(users, rolesByName);

    const userCountAfter = await users.countDocuments({});
    console.log(`\nDone. created ${users2.created.length}, refreshed ${users2.refreshed.length}.`);
    console.log(`User count ${userCountBefore} -> ${userCountAfter} (no records were deleted).`);

    await mongoose.disconnect();
}

provision()
    .then(() => process.exit(0))
    .catch(async (err) => {
        console.error("Demo provisioning failed:", err);
        await mongoose.disconnect().catch(() => undefined);
        process.exit(1);
    });
