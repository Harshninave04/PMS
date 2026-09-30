import { BASELINE_REFERENCE_PERMISSIONS, PERMISSION_KEYS, REFERENCE_DATA_MODULE } from "../../types/rbac";

export interface ModuleAccess {
    moduleName: string;
    permissions: string[];
    grants?: unknown[];
}

/**
 * Access every staff role receives on top of its own grants:
 * - its role-specific dashboard
 * - the read-only lookups that populate form dropdowns
 */
export const BASELINE_ACCESS: readonly ModuleAccess[] = [
    { moduleName: "dashboard", permissions: [PERMISSION_KEYS.DASHBOARD_VIEW] },
    { moduleName: REFERENCE_DATA_MODULE, permissions: [...BASELINE_REFERENCE_PERMISSIONS] },
];

/** Groups permission strings by their module prefix ("ward.ward.view" -> "ward"). */
function groupByModule(permissions: Iterable<string>): ModuleAccess[] {
    const modules = new Map<string, Set<string>>();
    for (const perm of permissions) {
        const moduleName = perm.split(".")[0];
        if (!modules.has(moduleName)) modules.set(moduleName, new Set());
        modules.get(moduleName)!.add(perm);
    }
    return Array.from(modules, ([moduleName, perms]) => ({ moduleName, permissions: Array.from(perms) }));
}

/** Every permission in the canonical taxonomy, plus any extra legacy permissions. */
export function buildFullAccess(extraPermissions: readonly string[] = []): ModuleAccess[] {
    return groupByModule([...Object.values(PERMISSION_KEYS), ...extraPermissions]);
}

/**
 * Merges `additions` into `accessList` without dropping or duplicating anything.
 * Returns the merged list and the permissions that were actually added.
 */
export function mergeAccess<T extends ModuleAccess>(
    accessList: readonly T[] | undefined,
    additions: readonly ModuleAccess[]
): { access: ModuleAccess[]; added: string[] } {
    const access: ModuleAccess[] = (accessList ?? []).map(item => ({ ...item, permissions: [...(item.permissions ?? [])] }));
    const added: string[] = [];

    for (const addition of additions) {
        let target = access.find(item => (item.moduleName || "").toLowerCase() === addition.moduleName.toLowerCase());
        if (!target) {
            target = { moduleName: addition.moduleName, permissions: [] };
            access.push(target);
        }
        for (const perm of addition.permissions) {
            if (!target.permissions.includes(perm)) {
                target.permissions.push(perm);
                added.push(perm);
            }
        }
    }

    return { access, added };
}

/** Role names whose seeded access is FULL_ACCESS. */
export const FULL_ACCESS_ROLES: readonly string[] = [
    "SYSTEM_SUPER_ADMIN",
    "ORGANIZATION_ADMIN",
    "HOSPITAL_ADMIN",
    "BRANCH_MANAGER",
    "FINANCE_MANAGER",
    "EMERGENCY_MANAGER",
    "OT_MANAGER",
];

/** Nursing task permissions every nurse role needs for its own worklist. */
export const NURSING_TASK_ACCESS: ModuleAccess = {
    moduleName: "nursing",
    permissions: [PERMISSION_KEYS.NURSING_TASK_VIEW, PERMISSION_KEYS.NURSING_TASK_CREATE, PERMISSION_KEYS.NURSING_TASK_EXECUTE],
};

/** HR desk access. Stored under "hr" and "staff" so both menus appear for HR roles. */
const HR_STAFF_PERMISSIONS = [PERMISSION_KEYS.STAFF_VIEW, PERMISSION_KEYS.STAFF_CREATE, PERMISSION_KEYS.STAFF_UPDATE];

export const HR_OFFICER_ACCESS: readonly ModuleAccess[] = [
    { moduleName: "hr", permissions: [...HR_STAFF_PERMISSIONS] },
    { moduleName: "staff", permissions: [PERMISSION_KEYS.STAFF_VIEW] },
];

export const HR_MANAGER_ACCESS: readonly ModuleAccess[] = [
    { moduleName: "hr", permissions: [...HR_STAFF_PERMISSIONS, PERMISSION_KEYS.STAFF_DEPT_MANAGE] },
    { moduleName: "staff", permissions: [PERMISSION_KEYS.STAFF_VIEW] },
];

/** Deterministic scope for a permission on a given role (mirrors the guard's legacy fallback). */
export function buildGrant(permission: string, roleName: string) {
    const isDoc = roleName.includes("DOCTOR") || roleName.includes("CONSULTANT");
    const isOrgLevel = roleName.includes("ORGANIZATION");
    const isGlobal = roleName.includes("SYSTEM_");
    const orgScope = isGlobal ? "GLOBAL" : (isOrgLevel ? "ORGANIZATION" : "BRANCH");

    let relScope = "UNRESTRICTED";
    if (isDoc && (permission.startsWith("appointment.") || permission.startsWith("clinical."))) {
        relScope = "OWN";
    } else if (roleName.includes("NURSE") && permission.startsWith("nursing.task.")) {
        relScope = "ASSIGNED";
    }

    return { permission, orgScope, relScope };
}

export function withBaselineAccess<T extends ModuleAccess>(accessList: readonly T[] | undefined): ModuleAccess[] {
    return mergeAccess(accessList, BASELINE_ACCESS).access;
}
