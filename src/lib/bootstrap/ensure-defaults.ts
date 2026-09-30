import bcrypt from "bcryptjs";
import Role from "@/models/role.model";
import RoleHierarchy from "@/models/role-hierarchy.model";
import User from "@/models/user.model";
import {
    DEFAULT_ROLE_DEFINITIONS,
    DEFAULT_ROLE_HIERARCHY,
    buildRoleAccess,
} from "@/lib/rbac/default-roles";

const SUPER_ADMIN_ROLE = "SYSTEM_SUPER_ADMIN";

const DUPLICATE_KEY = 11000;

const DEFAULT_ADMIN_EMAIL = process.env.DEFAULT_ADMIN_EMAIL || "admin@hospital.com";
const DEFAULT_ADMIN_PASSWORD = process.env.DEFAULT_ADMIN_PASSWORD || "password123";
const DEFAULT_ADMIN_NAME = process.env.DEFAULT_ADMIN_NAME || "Super Admin";

export interface EnsureDefaultsResult {
    rolesCreated: string[];
    rolesExisting: number;
    hierarchyCreated: number;
    adminCreated: boolean;
    skipped: boolean;
}

let ensurePromise: Promise<EnsureDefaultsResult> | null = null;

/**
 * Idempotent, additive bootstrap so a fresh or partially-populated database is
 * always usable for account provisioning.
 *
 * Guarantees:
 *  - never deletes or overwrites an existing role, user, or hierarchy row
 *  - only INSERTs the default roles that are missing
 *  - safe to call concurrently; the work is memoised per process
 *  - never throws into the request path: failures are logged, not propagated
 *
 * Set DISABLE_DEFAULT_BOOTSTRAP=true to opt out entirely.
 */
export async function ensureDefaults(): Promise<EnsureDefaultsResult> {
    if (process.env.DISABLE_DEFAULT_BOOTSTRAP === "true") {
        return { rolesCreated: [], rolesExisting: 0, hierarchyCreated: 0, adminCreated: false, skipped: true };
    }

    if (!ensurePromise) {
        ensurePromise = runEnsureDefaults().catch((error) => {
            // Reset so a later request can retry instead of caching the failure.
            ensurePromise = null;
            console.error("[bootstrap] Failed to ensure default roles/admin:", error);
            return { rolesCreated: [], rolesExisting: 0, hierarchyCreated: 0, adminCreated: false, skipped: true };
        });
    }

    return ensurePromise;
}

async function runEnsureDefaults(): Promise<EnsureDefaultsResult> {
    const result: EnsureDefaultsResult = {
        rolesCreated: [],
        rolesExisting: 0,
        hierarchyCreated: 0,
        adminCreated: false,
        skipped: false,
    };

    // 1. Insert any missing default role. Existing roles are left untouched so
    //    permission edits made through the admin UI are never reverted.
    //
    //    The unique index on Role.role is enforced here first: it turns the
    //    check-then-insert below into a safe operation even if several
    //    processes (Docker replicas) run the bootstrap simultaneously.
    await ensureRoleIndex();

    const existingNames = new Set(
        (await Role.find({}, { role: 1 }).lean()).map((r) => r.role as string)
    );

    for (const definition of DEFAULT_ROLE_DEFINITIONS) {
        if (existingNames.has(definition.role)) {
            result.rolesExisting += 1;
            continue;
        }
        try {
            await Role.create({
                role: definition.role,
                access: buildRoleAccess(definition.role, definition.access),
            });
            result.rolesCreated.push(definition.role);
        } catch (error) {
            // Another process inserted this role between the check and the
            // insert. That is the desired end state, so keep going.
            if ((error as { code?: number })?.code === DUPLICATE_KEY) {
                result.rolesExisting += 1;
                continue;
            }
            throw error;
        }
    }

    // 2. Insert any missing default hierarchy row (parent -> target delegation).
    //    Runs unconditionally so rows deleted by hand are restored, and so a
    //    process that lost the role race still tops up the hierarchy.
    {
        const allRoles = await Role.find({}, { role: 1 }).lean();
        const byName = new Map(allRoles.map((r) => [r.role as string, r._id]));

        for (const link of DEFAULT_ROLE_HIERARCHY) {
            const parentId = byName.get(link.parent);
            const targetId = byName.get(link.target);
            if (!parentId || !targetId) continue;

            const exists = await RoleHierarchy.findOne({ parentRole: parentId, targetRole: targetId }).lean();
            if (exists) continue;

            try {
                await RoleHierarchy.create({
                    parentRole: parentId,
                    targetRole: targetId,
                    permissions: link.permissions,
                });
                result.hierarchyCreated += 1;
            } catch (error) {
                if ((error as { code?: number })?.code !== DUPLICATE_KEY) throw error;
            }
        }
    }

    // 3. Guarantee someone can actually log in. Only fires when no user holds
    //    the super admin role, so it never resurrects an account on a healthy DB.
    result.adminCreated = await ensureBootstrapAdmin();

    if (result.rolesCreated.length > 0 || result.adminCreated) {
        console.log(
            `[bootstrap] Provisioned ${result.rolesCreated.length} default role(s)` +
            `${result.adminCreated ? " and the bootstrap super admin" : ""}`
        );
    }

    return result;
}

let roleIndexEnsured = false;

/**
 * Blocks until Role's unique index on `role` exists.
 *
 * Mongoose creates indexes asynchronously, so on a brand-new collection the
 * index may not be there yet when the check-then-insert loop above runs. Waiting
 * turns that loop into a safe operation under concurrency; the explicit
 * E11000 handling is the second line of defence if the build fails.
 */
async function ensureRoleIndex(): Promise<void> {
    if (roleIndexEnsured) return;
    try {
        await Role.init();
        roleIndexEnsured = true;
    } catch (error) {
        console.warn(
            "[bootstrap] Could not pre-build the unique role index; " +
            "falling back to duplicate-tolerant inserts.",
            error
        );
    }
}

async function ensureBootstrapAdmin(): Promise<boolean> {
    const superAdminRole = await Role.findOne({ role: SUPER_ADMIN_ROLE }).lean();
    if (!superAdminRole) return false;

    const superAdminCount = await User.countDocuments({ role: superAdminRole._id });
    if (superAdminCount > 0) return false;

    const existingByEmail = await User.findOne({ email: DEFAULT_ADMIN_EMAIL }).lean();
    if (existingByEmail) {
        console.warn(
            `[bootstrap] No user holds ${SUPER_ADMIN_ROLE}, but ${DEFAULT_ADMIN_EMAIL} already exists. ` +
            "Promote that account manually or run `npm run seed`."
        );
        return false;
    }

    await User.create({
        name: DEFAULT_ADMIN_NAME,
        email: DEFAULT_ADMIN_EMAIL,
        password: await bcrypt.hash(DEFAULT_ADMIN_PASSWORD, 10),
        gender: "MALE",
        role: superAdminRole._id,
        isActive: true,
    });

    console.log(`[bootstrap] Created bootstrap super admin: ${DEFAULT_ADMIN_EMAIL}`);
    return true;
}

/**
 * Test seam - clears the per-process memo so the next call re-runs the work.
 */
export function resetEnsureDefaultsCache(): void {
    ensurePromise = null;
    roleIndexEnsured = false;
}

export default ensureDefaults;
