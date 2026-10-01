/**
 * Keeps the database's roles and menus in step with the code.
 *
 * A hospital system is installed once and then patched many times, and the
 * MongoDB volume lives longer than any given build. Without this, a database
 * seeded by an older version keeps serving the old roles and the old sidebar,
 * and every operator has to remember a migration command. Instead the app
 * reconciles itself: `src/instrumentation.ts` runs this once when the server
 * starts, and `MenuController` filters to the canonical menus on every request
 * so the UI is correct even if this never got a chance to write.
 *
 * Everything is compared before it is written, so a healthy database costs one
 * read per collection and no writes at all. Nothing here deletes a user.
 */
import mongoose, { Types } from "mongoose";
import Menu from "@/models/menu.model";
import Role from "@/models/role.model";
import User from "@/models/user.model";
import Organization from "@/models/organization.model";
import { MENUS, getMenuModuleKey } from "@/lib/menu-data";
import { ALL_ROLES, buildRoleAccess, type ModuleAccess } from "@/lib/rbac/role-access";

/** Old role name -> the role that replaces it. Anything absent is kept as is. */
export const LEGACY_ROLE_MAP: Record<string, string> = {
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

export interface ReconcileOptions {
    /** `false` reports what would change and writes nothing. Default `true`. */
    apply?: boolean;
    log?: (message: string) => void;
    /** Give up waiting for Mongo after this long so a boot never hangs. */
    timeoutMs?: number;
}

export interface ReconcileReport {
    menus: "unchanged" | "created" | "replaced";
    rolesCreated: string[];
    rolesRefreshed: string[];
    legacyRolesDeleted: string[];
    /** Legacy roles that still hold users, so they were left alone. */
    legacyRolesKept: { role: string; users: number }[];
    usersMoved: number;
    usersAttachedToHospital: number;
    durationMs: number;
}

interface MenuSigNode {
    name: string;
    path: string;
    moduleKey: string;
    children: MenuSigNode[];
}

interface StoredMenuDoc {
    _id: unknown;
    name?: string;
    path?: string;
    moduleKey?: string;
    children?: unknown[];
}

/* -------------------------------------------------------------------------- */
/* Comparisons — pure, so the "do we need to write?" decision is testable      */
/* -------------------------------------------------------------------------- */

/** The menu tree this build defines, derived straight from `MENUS`. */
export function expectedMenuTree(): MenuSigNode[] {
    return MENUS.map(({ children, ...parent }) => {
        const parentKey = getMenuModuleKey(parent);
        return {
            name: parent.name,
            path: parent.path ?? "",
            moduleKey: parentKey,
            children: (children ?? []).map((child) => ({
                name: child.name,
                path: child.path ?? "",
                moduleKey: getMenuModuleKey(child) || parentKey,
                children: [] as MenuSigNode[],
            })),
        };
    });
}

/**
 * The menu tree currently in the database. A document is a child when another
 * document's `children` array holds its id, which mirrors how the sidebar
 * separates top-level entries from nested ones.
 */
export function actualMenuTree(docs: readonly StoredMenuDoc[]): MenuSigNode[] {
    const byId = new Map<string, StoredMenuDoc>();
    for (const doc of docs) byId.set(String(doc._id), doc);

    const referenced = new Set<string>();
    for (const doc of docs) {
        for (const child of doc.children ?? []) referenced.add(String(child));
    }

    return docs
        .filter((doc) => !referenced.has(String(doc._id)))
        .map((doc) => {
            const moduleKey = getMenuModuleKey({ moduleKey: doc.moduleKey, path: doc.path, name: doc.name });
            return {
                name: doc.name ?? "",
                path: doc.path ?? "",
                moduleKey,
                children: (doc.children ?? [])
                    .map((id) => byId.get(String(id)))
                    .filter((child): child is StoredMenuDoc => Boolean(child))
                    .map((child) => ({
                        name: child.name ?? "",
                        path: child.path ?? "",
                        moduleKey: getMenuModuleKey({ moduleKey: child.moduleKey, path: child.path, name: child.name }) || moduleKey,
                        children: [] as MenuSigNode[],
                    })),
            };
        });
}

/**
 * Order-independent fingerprint of a menu tree. Object ids are deliberately
 * left out, because a rewrite always mints new ones.
 */
export function menuTreeSignature(nodes: readonly MenuSigNode[]): string {
    const sorted = [...nodes]
        .map((node) => ({
            name: node.name,
            path: node.path,
            moduleKey: node.moduleKey,
            children: menuTreeSignature(node.children),
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
    return JSON.stringify(sorted);
}

/** True when the stored menus are exactly the ones this build ships. */
export function menusAreCanonical(docs: readonly StoredMenuDoc[]): boolean {
    return menuTreeSignature(actualMenuTree(docs)) === menuTreeSignature(expectedMenuTree());
}

/**
 * Order-independent fingerprint of a role's access list. Modules, permissions
 * and grants are each sorted, so a database written by an older build still
 * matches once the content is right.
 */
export function roleAccessSignature(access: readonly Partial<ModuleAccess>[] | null | undefined): string {
    const normalised = (access ?? [])
        .map((item) => ({
            moduleName: (item.moduleName ?? "").toLowerCase(),
            permissions: [...new Set(item.permissions ?? [])].sort(),
            grants: (item.grants ?? [])
                .map((grant) => {
                    const g = grant as { permission?: string; orgScope?: string; relScope?: string };
                    return `${g.permission ?? ""}:${g.orgScope ?? ""}:${g.relScope ?? ""}`;
                })
                .sort(),
        }))
        .sort((a, b) => a.moduleName.localeCompare(b.moduleName));
    return JSON.stringify(normalised);
}

/** True when a stored role already grants exactly what the code defines. */
export function roleIsCanonical(roleName: string, access: readonly Partial<ModuleAccess>[] | null | undefined): boolean {
    return roleAccessSignature(access) === roleAccessSignature(buildRoleAccess(roleName));
}

/* -------------------------------------------------------------------------- */
/* The reconciler                                                             */
/* -------------------------------------------------------------------------- */

let inFlight: Promise<ReconcileReport> | null = null;

function emptyReport(startedAt: number): ReconcileReport {
    return {
        menus: "unchanged",
        rolesCreated: [],
        rolesRefreshed: [],
        legacyRolesDeleted: [],
        legacyRolesKept: [],
        usersMoved: 0,
        usersAttachedToHospital: 0,
        durationMs: Date.now() - startedAt,
    };
}

function describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const guard = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
    });
    return Promise.race([work, guard]).finally(() => {
        if (timer) clearTimeout(timer);
    }) as Promise<T>;
}

async function syncMenus(apply: boolean, log: (message: string) => void): Promise<ReconcileReport["menus"]> {
    const docs = await Menu.find({}).lean<StoredMenuDoc[]>();
    if (menusAreCanonical(docs)) return "unchanged";

    const outcome: ReconcileReport["menus"] = docs.length === 0 ? "created" : "replaced";
    log(`menus: ${docs.length} stored document(s) do not match the ${MENUS.length} this build ships -> ${outcome}`);
    if (!apply) return outcome;

    await Menu.deleteMany({});
    for (const { children, ...parent } of MENUS) {
        const parentKey = getMenuModuleKey(parent);
        const childIds: Types.ObjectId[] = [];
        for (const child of children ?? []) {
            const created = await Menu.create({
                ...child,
                icon: "",
                children: [],
                moduleKey: getMenuModuleKey(child) || parentKey,
            });
            childIds.push(created._id as Types.ObjectId);
        }
        await Menu.create({ ...parent, moduleKey: parentKey, children: childIds });
    }
    return outcome;
}

async function syncRoles(apply: boolean): Promise<{ created: string[]; refreshed: string[] }> {
    const created: string[] = [];
    const refreshed: string[] = [];

    for (const roleName of ALL_ROLES) {
        const access = buildRoleAccess(roleName);
        const existing = await Role.findOne({ role: roleName }).lean();

        if (!existing) {
            if (apply) await Role.create({ role: roleName, access });
            created.push(roleName);
            continue;
        }
        if (roleIsCanonical(roleName, existing.access)) continue;
        if (apply) await Role.updateOne({ _id: existing._id }, { $set: { access } });
        refreshed.push(roleName);
    }
    return { created, refreshed };
}

async function syncLegacyRoles(
    apply: boolean,
    roleIds: Map<string, Types.ObjectId>
): Promise<{ deleted: string[]; kept: { role: string; users: number }[]; usersMoved: number }> {
    const deleted: string[] = [];
    const kept: { role: string; users: number }[] = [];
    let usersMoved = 0;

    const legacyRoles = await Role.find({ role: { $nin: [...ALL_ROLES] } }).lean();
    for (const legacy of legacyRoles) {
        const holders = await User.countDocuments({ role: legacy._id });
        const target = LEGACY_ROLE_MAP[legacy.role];

        // No equivalent role: leave the role and its users completely alone so
        // nobody is locked out, and report them for a human to reassign.
        if (holders > 0 && !target) {
            kept.push({ role: legacy.role, users: holders });
            continue;
        }

        if (holders > 0 && apply) {
            const targetId = roleIds.get(target as string);
            if (targetId) {
                const moved = await User.updateMany({ role: legacy._id }, { $set: { role: targetId } });
                usersMoved += moved.modifiedCount ?? 0;
            }
        }
        if (apply) await Role.deleteOne({ _id: legacy._id });
        deleted.push(legacy.role);
    }
    return { deleted, kept, usersMoved };
}

async function attachUnassignedUsers(apply: boolean): Promise<number> {
    const mainOrganizations = await Organization.find({ branchType: "MAIN" }).lean();
    if (mainOrganizations.length !== 1) return 0;

    const unassigned = await User.find({ organization: null, branch: null }, { projection: { email: 1 } }).lean();
    if (!unassigned.length) return 0;
    if (!apply) return unassigned.length;

    await User.updateMany(
        { _id: { $in: unassigned.map((user) => user._id) } },
        { $set: { organization: mainOrganizations[0]._id } }
    );
    return unassigned.length;
}

async function runReconcile({
    apply = true,
    log = () => {},
    timeoutMs = 15000,
}: ReconcileOptions): Promise<ReconcileReport> {
    const startedAt = Date.now();
    const report = emptyReport(startedAt);

    try {
        if (mongoose.connection.readyState !== 1) {
            const { default: dbConnect } = await import("@/lib/dbConnect");
            await dbConnect();
        }

        await withTimeout(
            (async () => {
                report.menus = await syncMenus(apply, log);

                const { created, refreshed } = await syncRoles(apply);
                report.rolesCreated = created;
                report.rolesRefreshed = refreshed;
                if (created.length) log(`roles created: ${created.join(", ")}`);
                if (refreshed.length) log(`roles refreshed: ${refreshed.join(", ")}`);

                const roleIds = new Map<string, Types.ObjectId>();
                for (const doc of await Role.find({ role: { $in: [...ALL_ROLES] } }, { role: 1 }).lean()) {
                    roleIds.set(doc.role, doc._id as Types.ObjectId);
                }

                const legacy = await syncLegacyRoles(apply, roleIds);
                report.legacyRolesDeleted = legacy.deleted;
                report.legacyRolesKept = legacy.kept;
                report.usersMoved = legacy.usersMoved;
                if (legacy.deleted.length) log(`old roles removed: ${legacy.deleted.join(", ")}`);
                if (legacy.usersMoved) log(`${legacy.usersMoved} user(s) moved onto a current role`);
                for (const entry of legacy.kept) {
                    log(`kept ${entry.role}: ${entry.users} user(s) have no equivalent role, reassign them in Settings > Users`);
                }

                const attached = await attachUnassignedUsers(apply);
                report.usersAttachedToHospital = attached;
                if (attached) log(`${attached} user(s) attached to the hospital`);
            })(),
            timeoutMs
        );
    } catch (error) {
        // A read-only or unreachable database must never stop the app from
        // starting: the request-time menu filter still keeps the UI correct.
        log(`skipped: ${describe(error)}`);
    }

    report.durationMs = Date.now() - startedAt;
    return report;
}

/**
 * Brings roles and menus in line with the code. Safe to call on every boot and
 * from the repair CLI: concurrent callers share one run, and nothing is written
 * unless the database actually disagrees with the build.
 */
export function reconcileCanonicalAccess(options: ReconcileOptions = {}): Promise<ReconcileReport> {
    if (inFlight) return inFlight;
    inFlight = runReconcile(options).finally(() => {
        inFlight = null;
    });
    return inFlight;
}

/** `true` when a report changed something, for tests and the CLI. */
export function reportHasChanges(report: ReconcileReport): boolean {
    return (
        report.menus !== "unchanged" ||
        report.rolesCreated.length > 0 ||
        report.rolesRefreshed.length > 0 ||
        report.legacyRolesDeleted.length > 0 ||
        report.usersMoved > 0 ||
        report.usersAttachedToHospital > 0
    );
}