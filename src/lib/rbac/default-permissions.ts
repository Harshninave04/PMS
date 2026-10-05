/**
 * Default sub-item level access for the six roles this product ships, plus the
 * normalizer that every permission write goes through.
 *
 * Kept free of server-only imports: the permission matrix seeds its initial
 * state from here and the boot reconciler writes it to MongoDB.
 */
import {
    ALL_SUB_ITEM_PERMISSIONS,
    permissionKey,
    type ModulePermission,
    type PermissionAction,
} from "./permissions.config";
import { ADMIN_ROLE } from "./roles";

const ALL = [...ALL_SUB_ITEM_PERMISSIONS];

/** Shorthand: all four CRUD actions on a sub-item. */
function crud(moduleKey: string, subItemKey: string): string[] {
    const actions: PermissionAction[] = ["view", "create", "update", "delete"];
    return actions.map((action) => permissionKey(moduleKey, subItemKey, action));
}

/** Shorthand: an explicit list of actions on a sub-item. */
function act(moduleKey: string, subItemKey: string, ...actions: string[]): string[] {
    return actions.map((action) => permissionKey(moduleKey, subItemKey, action));
}

/**
 * Sub-items that are only reachable through another sub-item. Granting them
 * implies the prerequisite, so a role can never be given a screen whose data it
 * is not allowed to list.
 */
const SUB_ITEM_PREREQUISITES: Readonly<Record<string, readonly string[]>> = {
    "patients.profile": [permissionKey("patients", "list", "view")],
    "patients.documents": [permissionKey("patients", "list", "view")],
};

/**
 * Access as shipped for each of the six in-scope roles.
 *
 * Read literally from the product specification: a sub-item listed without a
 * qualifier gets `view`; a listed sub-item only gets a write action where the
 * role already held the equivalent legacy permission, so the upgrade does not
 * quietly widen or narrow anyone's day-to-day work.
 */
export const DEFAULT_ROLE_PERMISSIONS: Readonly<Record<string, readonly string[]>> = {
    /** Super Admin / Admin: every permission the system defines. */
    [ADMIN_ROLE]: ALL,

    DOCTOR: [
        ...act("dashboard", "main", "view"),

        ...act("patients", "list", "view", "update"),
        ...act("patients", "profile", "view", "update"),
        ...act("patients", "documents", "view", "upload"),

        ...act("opd", "queue", "view", "update"),
        ...act("opd", "list", "view", "update"),

        ...crud("clinical", "consultations"),
        ...act("clinical", "prescriptions", "view", "update", "prescribe"),
        ...act("clinical", "vitals", "view", "create", "update"),
        ...act("clinical", "history", "view"),

        ...act("admissions", "new", "view", "create"),
        ...act("admissions", "current", "view", "update"),
        ...act("admissions", "summary", "view"),
        ...act("admissions", "history", "view"),

        ...act("wards", "availability", "view"),
    ],

    NURSE: [
        ...act("dashboard", "main", "view"),

        ...act("patients", "list", "view"),
        ...act("patients", "profile", "view"),

        ...crud("nursing", "patients"),
        ...crud("nursing", "vitals"),
        ...crud("nursing", "notes"),
        ...crud("nursing", "medications"),

        ...act("clinical", "vitals", "view", "create", "update"),

        ...act("wards", "availability", "view"),
        ...act("wards", "list", "view"),

        ...act("admissions", "current", "view"),
    ],

    RECEPTIONIST: [
        ...act("dashboard", "main", "view"),

        ...act("patients", "register", "view", "create"),
        ...act("patients", "list", "view", "create", "update"),
        ...act("patients", "profile", "view", "update"),
        ...act("patients", "documents", "view", "upload"),

        ...act("opd", "book", "view", "create", "update"),
        ...act("opd", "queue", "view", "update"),
        ...act("opd", "list", "view", "update"),

        ...act("admissions", "new", "view", "create"),
        ...act("admissions", "current", "view", "update"),

        ...act("wards", "availability", "view"),

        ...act("billing", "create", "view", "create"),
        ...act("billing", "invoices", "view"),
        ...act("billing", "payments", "view", "create"),
    ],

    PHARMACIST: [
        ...act("dashboard", "main", "view"),

        ...crud("pharmacy", "prescriptions"),
        ...crud("pharmacy", "dispensing"),
        ...act("pharmacy", "dispensing", "dispense"),
        ...crud("pharmacy", "medicines"),
        ...crud("pharmacy", "categories"),
        ...crud("pharmacy", "stock"),
        ...crud("pharmacy", "expiry"),

        ...act("patients", "list", "view"),
        ...act("clinical", "prescriptions", "view"),
        ...act("reports", "pharmacy", "view"),
    ],

    ACCOUNTANT: [
        ...act("dashboard", "main", "view"),

        ...crud("billing", "create"),
        ...crud("billing", "invoices"),
        ...crud("billing", "payments"),
        ...crud("billing", "outstanding"),

        ...act("reports", "billing", "view"),
        ...act("patients", "list", "view"),
        ...act("admissions", "current", "view"),
    ],
};

/** The six roles this build ships defaults for. */
export const ROLES_WITH_DEFAULTS: readonly string[] = Object.keys(DEFAULT_ROLE_PERMISSIONS);

/**
 * Normalises a permission list into the canonical, grantable set.
 *
 * Two rules, both enforced on every write so the database can never hold an
 * inconsistent combination:
 *
 *  1. Any write action implies that sub-item's `view`. Nobody can reach a
 *     screen they may not look at in order to fill in a form.
 *  2. Sub-items listed in `SUB_ITEM_PREREQUISITES` imply their prerequisite.
 *
 * Unknown keys are dropped, so removing a menu item removes its permissions on
 * the next write instead of leaving them stranded in the database.
 */
export function normalizePermissions(
    permissions: Iterable<string> | null | undefined,
    modules: readonly ModulePermission[] = []
): string[] {
    const known = modules.length
        ? new Set(
              modules.flatMap((module) =>
                  module.subItems.flatMap((subItem) => [
                      ...subItem.actions.map((action) => permissionKey(module.key, subItem.key, action)),
                      ...subItem.specials.map((special) => permissionKey(module.key, subItem.key, special.action)),
                  ])
              )
          )
        : new Set(ALL_SUB_ITEM_PERMISSIONS);

    const granted = new Set<string>();
    for (const raw of permissions ?? []) {
        const key = (raw || "").trim().toLowerCase();
        if (key && known.has(key)) granted.add(key);
    }

    let changed = true;
    while (changed) {
        changed = false;
        for (const key of [...granted]) {
            const separator = key.indexOf(":");
            const target = key.slice(0, separator);
            const action = key.slice(separator + 1);

            // Rule 1: a write implies the matching view.
            if (action !== "view") {
                const viewKey = `${target}:view`;
                if (known.has(viewKey) && !granted.has(viewKey)) {
                    granted.add(viewKey);
                    changed = true;
                }
            }

            // Rule 2: a dependent sub-item implies its prerequisite.
            for (const prerequisite of SUB_ITEM_PREREQUISITES[target] ?? []) {
                if (known.has(prerequisite) && !granted.has(prerequisite)) {
                    granted.add(prerequisite);
                    changed = true;
                }
            }
        }
    }

    return [...granted].sort();
}

/** True when the role is the one role that is never restricted. */
export function isSuperAdminRole(roleName: string | null | undefined): boolean {
    return (roleName || "").toUpperCase() === ADMIN_ROLE;
}

/** Default permissions for a role, normalized. Unknown roles start empty. */
export function defaultPermissionsFor(roleName: string): string[] {
    // Super Admin goes through the same normaliser so that every role's default
    // list is already closed under the view/dependency rules and sorted the same
    // way — otherwise `normalizePermissions(defaultPermissionsFor(x))` would not
    // equal `defaultPermissionsFor(x)` for Admin and only for Admin.
    if (isSuperAdminRole(roleName)) return normalizePermissions(ALL_SUB_ITEM_PERMISSIONS);
    return normalizePermissions(DEFAULT_ROLE_PERMISSIONS[roleName] ?? []);
}

/** Order-independent fingerprint used to decide whether a seed write is needed. */
export function permissionSignature(permissions: Iterable<string> | null | undefined): string {
    return JSON.stringify([...new Set(Array.from(permissions ?? [], (p) => (p || "").trim().toLowerCase()))].sort());
}

/** Sub-items a permission set grants at least one action on. */
export function grantedSubItems(permissions: Iterable<string> | null | undefined): Map<string, Set<string>> {
    const result = new Map<string, Set<string>>();
    for (const raw of permissions ?? []) {
        const key = (raw || "").trim().toLowerCase();
        const separator = key.indexOf(":");
        if (separator < 1) continue;
        const target = key.slice(0, separator);
        const action = key.slice(separator + 1);
        if (!result.has(target)) result.set(target, new Set());
        result.get(target)!.add(action);
    }
    return result;
}