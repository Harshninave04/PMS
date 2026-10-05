/**
 * Turns a stored Role document into the effective permission set every guard
 * and every client component checks against.
 *
 * Two layers live on a role and both are resolved here:
 *
 *  - `permissions` — sub-item keys (`patients.list:view`). Navigation and
 *    access decisions. Added by this work.
 *  - `access[].permissions` / `access[].grants[].permission` — the older
 *    module-keyed data-layer keys (`patient.patient.view`) that the existing
 *    `authorizeRequest` guard and the repositories use.
 *
 * Keeping both is deliberate: an installed database already holds the old keys,
 * and rebuilding them would break every existing query filter. The sub-item
 * layer is layered on top and is what decides what a user can *reach*.
 */
import { ALL_SUB_ITEM_PERMISSIONS } from "./permissions.config";
import { isSuperAdminRole, normalizePermissions } from "./default-permissions";
import { migrateLegacyAccess } from "./migrate-access";

export interface StoredRoleLike {
    _id?: unknown;
    role?: string | null;
    permissions?: unknown;
    permissionsCustomized?: boolean;
    access?: unknown;
}

/** Legacy module-keyed permissions stored on a role. */
export function legacyPermissionsOf(role: StoredRoleLike | null | undefined): string[] {
    const out = new Set<string>();
    const access = Array.isArray(role?.access) ? (role?.access as Record<string, unknown>[]) : [];

    for (const entry of access) {
        if (Array.isArray(entry?.permissions)) {
            for (const permission of entry.permissions as unknown[]) {
                if (typeof permission === "string" && permission.trim()) out.add(permission.trim());
            }
        }
        if (Array.isArray(entry?.grants)) {
            for (const grant of entry.grants as Record<string, unknown>[]) {
                const permission = grant?.permission;
                if (typeof permission === "string" && permission.trim()) out.add(permission.trim());
            }
        }
    }
    return [...out];
}

export interface ResolvedRolePermissions {
    /** Sub-item keys the role may reach. */
    subItem: string[];
    /** Legacy data-layer keys, passed through untouched. */
    legacy: string[];
    /** Fast lookup for both layers. */
    all: Set<string>;
    /** True when the role bypasses permission checks entirely. */
    isSuperAdmin: boolean;
}

/**
 * Resolves the effective permission set for a stored role.
 *
 * The Super Admin short-circuits to every permission the build defines, so it
 * can never be locked out by an accidental edit and needs no stored state.
 */
export function resolveRolePermissions(role: StoredRoleLike | null | undefined): ResolvedRolePermissions {
    const roleName = role?.role ?? "";
    const isSuperAdmin = isSuperAdminRole(roleName);
    const legacy = legacyPermissionsOf(role);

    // Union the stored sub-item list with what the legacy access list translates
    // to. A database that has not been through `canonical-sync` yet stores only
    // the old keys, and resolving those to nothing would empty the sidebar and
    // make every new guard deny — the migration is additive precisely so that
    // never happens.
    const storedSubItem = Array.isArray(role?.permissions) ? (role?.permissions as string[]) : [];
    const migratedSubItem = migrateLegacyAccess(legacy);

    // A stored sub-item list is what an administrator last saved on the Roles
    // screen, and it is the layer the sidebar, the page guard and the API routes
    // read. It therefore has the last word: taking the union with the legacy
    // `access` list would let a permission the administrator just removed come
    // straight back through the old keys, which is exactly the "I unticked it and
    // nothing happened" bug.
    //
    // The legacy translation is still the fallback for a role that has never been
    // through the migration (`permissions` empty), so an installed database that
    // only knows the old keys keeps working instead of resolving to nothing.
    const hasExplicitPermissionList = role?.permissionsCustomized === true || storedSubItem.length > 0;
    const subItem = isSuperAdmin
        ? [...ALL_SUB_ITEM_PERMISSIONS]
        : normalizePermissions(hasExplicitPermissionList ? storedSubItem as string[] : migratedSubItem);

    return {
        subItem,
        legacy,
        all: new Set<string>([...subItem, ...legacy]),
        isSuperAdmin,
    };
}

/** Convenience predicate against a resolved set. */
export function hasResolvedPermission(resolved: ResolvedRolePermissions, permission: string): boolean {
    const key = (permission || "").trim().toLowerCase();
    if (!key) return false;
    if (resolved.isSuperAdmin) return true;
    return resolved.all.has(key);
}

/** Permission used by sub-item guards; legacy data keys never satisfy it. */
export function hasResolvedSubItemPermission(resolved: ResolvedRolePermissions, permission: string): boolean {
    const key = (permission || "").trim().toLowerCase();
    if (!key) return false;
    return resolved.isSuperAdmin || resolved.subItem.includes(key);
}

/** Resolved sub-item keys a user may reach. */
export function resolveUserPermissions(role: StoredRoleLike | null | undefined): string[] {
    return resolveRolePermissions(role).subItem;
}
