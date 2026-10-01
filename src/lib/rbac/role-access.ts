import { BASELINE_REFERENCE_PERMISSIONS, PERMISSION_KEYS, REFERENCE_DATA_MODULE } from "../../types/rbac";
import { groupPermissionsByModule } from "./permissions";
import { ADMIN_ROLE, ROLE_ACCESS, type ModuleAccess } from "./roles";

export type { ModuleAccess } from "./roles";
export { ADMIN_ROLE, ALL_ROLES, ROLE_ACCESS, ROLE_LABELS } from "./roles";

/**
 * Access every staff role receives on top of its own grants:
 * - the dashboard
 * - the read-only lookups that populate form dropdowns
 */
export const BASELINE_ACCESS: readonly ModuleAccess[] = [
    { moduleName: "dashboard", permissions: [PERMISSION_KEYS.DASHBOARD_VIEW] },
    { moduleName: REFERENCE_DATA_MODULE, permissions: [...BASELINE_REFERENCE_PERMISSIONS] },
];

/** Every permission in the taxonomy, grouped by module. */
export function buildFullAccess(): ModuleAccess[] {
    return Object.entries(groupPermissionsByModule()).map(([moduleName, permissions]) => ({ moduleName, permissions }));
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

export function withBaselineAccess<T extends ModuleAccess>(accessList: readonly T[] | undefined): ModuleAccess[] {
    return mergeAccess(accessList, BASELINE_ACCESS).access;
}

/**
 * Deterministic scope for a permission on a given role (mirrors the guard's fallback).
 * Single hospital: everything is scoped to the hospital, except that doctors only
 * see their own appointments and consultations.
 */
export function buildGrant(permission: string, roleName: string) {
    const relScope = roleName === "DOCTOR" && (permission.startsWith("appointment.") || permission.startsWith("clinical."))
        ? "OWN"
        : "UNRESTRICTED";

    return { permission, orgScope: "BRANCH", relScope };
}

/** The complete access list stored on a role document, including scope grants. */
export function buildRoleAccess(roleName: string): ModuleAccess[] {
    const own = roleName === ADMIN_ROLE ? buildFullAccess() : (ROLE_ACCESS[roleName] ?? []);
    return withBaselineAccess(own).map(item => ({
        ...item,
        grants: item.permissions.map(perm => buildGrant(perm, roleName)),
    }));
}
