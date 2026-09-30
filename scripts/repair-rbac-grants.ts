/**
 * Additive RBAC grant repair.
 *
 * `npm run seed` is destructive: it clears every user, role, menu and staff
 * record before reseeding. That is fine for a disposable database but unsafe
 * against a live hospital database, and it is the ONLY way the grants
 * introduced alongside branch-scoped doctor/staff reference data would
 * otherwise reach an existing deployment. This script applies those grants to
 * an already-seeded database WITHOUT deleting or replacing anything.
 *
 * What it does, all additively:
 *   1. Grants `doctor.doctor.view` + `department.department.view` to the roles
 *      that legitimately need them (front desk, clinical, diagnostics, admins).
 *   2. Grants the `staff.*` / `hr.*` family to the admin and HR roles.
 *   3. Binds `organization` + `branch` on every seeded user, because a
 *      `BRANCH`-scoped grant resolves to deny-all when the actor has no campus.
 *   4. Backfills `branchId` / `organizationId` on Doctor and Staff profiles.
 *
 * Existing permissions, grants and modules are preserved. Nothing is removed.
 *
 * Usage:
 *   npm run rbac:repair
 *
 * MONGODB_URI must point at the database the running app actually uses.
 */
import "dotenv/config";
import mongoose, { Types } from "mongoose";
import {
    backfillProfileBranchScope,
    campusIdFor,
    resolveDemoCampus,
    resolveOrganizationForBranch,
    type CampusDocuments
} from "../src/lib/seed/branch-scope";

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/medistra-hms";

const DOCTOR_VIEW = "doctor.doctor.view";
const DEPARTMENT_VIEW = "department.department.view";
const STAFF_FAMILY = ["staff.staff.view", "staff.staff.create", "staff.staff.update", "staff.department.manage"];

/**
 * Roles that must be able to read the doctor roster.
 *
 * The booking form, appointment lists/calendar/queue and the lab + radiology
 * order forms all populate a doctor dropdown from `GET /api/doctor`. Without
 * the grant a receptionist gets a 403 and the dropdown is empty.
 */
const DOCTOR_ROLES = [
    // Front desk: books appointments against a doctor.
    "RECEPTIONIST",
    "FRONT_DESK_MANAGER",
    // Clinical: book follow-ups and refer across departments.
    "DOCTOR",
    "CONSULTANT",
    "EMERGENCY_DOCTOR",
    "NURSE",
    "NURSE_MANAGER",
    "EMERGENCY_NURSE",
    "OT_NURSE",
    // Diagnostics: lab/radiology orders carry the requesting doctor.
    "LAB_TECHNICIAN",
    "LAB_SUPERVISOR",
    "RADIOLOGY_TECHNICIAN",
    "RADIOLOGIST",
    // Ward administration.
    "BRANCH_MANAGER",
    "HOSPITAL_ADMIN",
    "ORGANIZATION_ADMIN"
];

/** Department reference data accompanies the roster (a doctor row is booked against a department). */
const DEPARTMENT_READ_ROLES = new Set(DOCTOR_ROLES);

/** Roles allowed to administer staff and HR employee dossiers. */
const STAFF_ADMIN_ROLES = [
    "BRANCH_MANAGER",
    "HOSPITAL_ADMIN",
    "ORGANIZATION_ADMIN",
    "HR_OFFICER",
    "HR_MANAGER"
];

/** Mirrors the scope rules applied by enrichAccessWithGrants() in src/seed.ts. */
function defaultOrgScopeFor(roleName: string): string {
    if (roleName.includes("SYSTEM_")) return "GLOBAL";
    if (roleName.includes("ORGANIZATION")) return "ORGANIZATION";
    return "BRANCH";
}

function defaultRelScopeFor(roleName: string, permission: string): string {
    const isClinicalDoctorModule =
        permission.startsWith("appointment.") || permission.startsWith("clinical.");
    const isDoctorRole = roleName.includes("DOCTOR") || roleName.includes("CONSULTANT");
    return isDoctorRole && isClinicalDoctorModule ? "OWN" : "UNRESTRICTED";
}

interface AccessItem {
    moduleName: string;
    permissions?: string[];
    grants?: Array<{ permission: string; orgScope: string; relScope: string }>;
    [key: string]: unknown;
}

function moduleItem(access: AccessItem[], moduleName: string): AccessItem {
    const found = access.find((item) => (item?.moduleName || "").toLowerCase().trim() === moduleName);
    if (found) return found;
    const created: AccessItem = { moduleName, permissions: [], grants: [] };
    access.push(created);
    return created;
}

/**
 * Adds `permissions` to `access` in place, merging into any existing module
 * item rather than appending a duplicate. Also records a structured grant so
 * ScopeResolver gets an explicit orgScope/relScope instead of relying on the
 * legacy fallback in authorizeRequest.
 *
 * Returns true when something was actually added.
 */
function grantPermissions(access: AccessItem[], roleName: string, moduleName: string, permissions: string[]): boolean {
    const item = moduleItem(access, moduleName);
    const existingPermissions = Array.isArray(item.permissions) ? item.permissions : [];
    const existingGrants = Array.isArray(item.grants) ? item.grants : [];

    let changed = false;

    for (const permission of permissions) {
        if (!existingPermissions.includes(permission)) {
            existingPermissions.push(permission);
            changed = true;
        }

        if (!existingGrants.some((grant) => grant?.permission === permission)) {
            existingGrants.push({
                permission,
                orgScope: defaultOrgScopeFor(roleName),
                relScope: defaultRelScopeFor(roleName, permission)
            });
            changed = true;
        }
    }

    if (changed) {
        item.permissions = existingPermissions;
        item.grants = existingGrants;
    }

    return changed;
}

async function repairRoleGrants(roles: any) {
    const updated: string[] = [];
    const skipped: string[] = [];
    const allRoles = await roles.find({}).toArray();

    for (const role of allRoles) {
        const roleName: string = role.role;
        const access: AccessItem[] = Array.isArray(role.access) ? [...role.access] : [];

        let changed = false;

        // SYSTEM_SUPER_ADMIN short-circuits to GLOBAL scope in authorizeRequest,
        // so it needs nothing added.
        if (roleName !== "SYSTEM_SUPER_ADMIN") {
            if (DOCTOR_ROLES.includes(roleName)) {
                changed = grantPermissions(access, roleName, "doctor", [DOCTOR_VIEW]) || changed;
            }
            if (DEPARTMENT_READ_ROLES.has(roleName)) {
                changed = grantPermissions(access, roleName, "department", [DEPARTMENT_VIEW]) || changed;
            }
            if (STAFF_ADMIN_ROLES.includes(roleName)) {
                changed = grantPermissions(access, roleName, "staff", STAFF_FAMILY) || changed;
                changed = grantPermissions(access, roleName, "hr", STAFF_FAMILY) || changed;
            }
        }

        if (changed) {
            await roles.updateOne({ _id: role._id }, { $set: { access } });
            updated.push(roleName);
        } else {
            skipped.push(roleName);
        }
    }

    return { updated, skipped };
}

async function resolveCampuses(organizations: any): Promise<CampusDocuments> {
    const main = (await organizations.findOne(
        { organizationId: "MEDISTRA-MAIN" },
        { projection: { _id: 1 } }
    ))?._id as Types.ObjectId | undefined;

    if (!main) {
        throw new Error(
            "Organization MEDISTRA-MAIN not found. Run `npm run seed` once to create the campus records first."
        );
    }

    const saltLake =
        ((await organizations.findOne(
            { organizationId: "MEDISTRA-SL-01" },
            { projection: { _id: 1 } }
        ))?._id as Types.ObjectId | undefined) ?? main;

    const newTown =
        ((await organizations.findOne(
            { organizationId: "MEDISTRA-NT-02" },
            { projection: { _id: 1 } }
        ))?._id as Types.ObjectId | undefined) ?? main;

    return { main, saltLake, newTown };
}

/**
 * Binds organization + branch on users that have none.
 *
 * A BRANCH-scoped grant answers with the deny-all sentinel when the actor has
 * no campus, which surfaces as an empty list rather than a 403 - so this is a
 * correctness fix, not cosmetics. Users that already carry a campus are left
 * untouched so an operator's manual reassignment is never overwritten.
 */
async function repairUserTenantScope(users: any, campuses: CampusDocuments, roles: any) {
    const rolesById = new Map<string, string>();
    for (const role of await roles.find({}).toArray()) {
        rolesById.set(role._id.toString(), role.role);
    }

    const updated: string[] = [];
    const unscopedRoles = await users.find({}).toArray();

    for (const user of unscopedRoles) {
        if (user.branch || user.organization) continue;

        const roleName = rolesById.get(user.role?.toString()) ?? "";
        if (!roleName) continue;

        const branch = campusIdFor(resolveDemoCampus(roleName), campuses);
        const organization = resolveOrganizationForBranch(branch, campuses);

        await users.updateOne(
            { _id: user._id },
            { $set: { branch, organization } }
        );
        updated.push(`${user.email} [${roleName}] -> ${branch.toString().slice(-6)}`);
    }

    return updated;
}

async function repair() {
    console.log(`Target database: ${MONGODB_URI.replace(/\/\/([^:]+):([^@]+)@/, "//$1:****@")}`);
    await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 8000 });

    const db = mongoose.connection.db;
    if (!db) throw new Error("No database selected after connecting.");

    const users = db.collection("users");
    const roles = db.collection("roles");
    const organizations = db.collection("organizations");

    console.log("\n1. Repairing role permission grants...");
    const grants = await repairRoleGrants(roles);
    console.log(`   updated ${grants.updated.length} role(s): ${grants.updated.join(", ") || "none"}`);
    console.log(`   already correct ${grants.skipped.length} role(s)`);

    console.log("\n2. Binding organization + branch on users...");
    const campuses = await resolveCampuses(organizations);
    const bound = await repairUserTenantScope(users, campuses, roles);
    console.log(`   bound ${bound.length} user(s)`);
    for (const line of bound) console.log(`     - ${line}`);

    console.log("\n3. Backfilling branch scope on Doctor / Staff profiles...");
    const backfilled = await backfillProfileBranchScope();
    console.log(`   ${backfilled.doctors} doctor(s), ${backfilled.staff} staff profile(s)`);

    console.log("\nDone. Sign out and back in so the new session picks up the grants.");

    await mongoose.disconnect();
}

repair().catch(async (error) => {
    console.error("RBAC repair failed:", error);
    await mongoose.disconnect();
    process.exit(1);
});
