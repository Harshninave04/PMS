/**
 * SINGLE SOURCE OF TRUTH for sidebar-level access control.
 *
 * Everything that needs to know "what can be reached, and what can be done
 * there" derives from this one file:
 *
 *   - the sidebar sub-item filter          -> `filterMenusByPermissions`
 *   - API route guards                     -> `requirePermission` / `ROUTE_PERMISSIONS`
 *   - the permission matrix UI              -> `PERMISSION_MODULES`
 *   - the permission catalogue API          -> `buildPermissionCatalogue`
 *   - the role seed / migration             -> `normalizePermissions`
 *   - the docs                              -> `docs/ROLES_PERMISSIONS.md`
 *
 * It is derived from `MENUS`, so adding a menu item to `src/lib/menu-data.ts`
 * and declaring its extra actions here is all it takes to introduce a new
 * permission.
 *
 * PERMISSION KEY FORMAT
 * ---------------------
 *     module.submodule:action        e.g. "patients.list:view"
 *
 * `module` is the first segment of the module's sidebar path, `submodule` is the
 * LAST segment of the sub-item's path. Keys come from the path rather than the
 * label because labels repeat across modules: "Vital Signs" exists in both
 * Consultation (`/clinical/vitals` -> `clinical.vitals`) and Nursing
 * (`/nursing/vitals` -> `nursing.vitals`); "Prescriptions" in Consultation and
 * Pharmacy; "Admitted Patients" in Admissions and Nursing; "Patients", "Billing"
 * and "Pharmacy" all recur under Reports.
 *
 * This module is imported by client components, so it must stay free of
 * server-only dependencies (no mongoose, no next-auth).
 */
import { MENUS } from "@/lib/menu-seed";

/** The four standard actions every sub-item supports. */
export const PERMISSION_ACTIONS = ["view", "create", "update", "delete"] as const;
export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];

export interface SpecialActionDefinition {
    /** Action segment of the permission key, e.g. "upload". */
    action: string;
    /** Column heading / tooltip text in the permission matrix. */
    label: string;
}

export interface SubItemPermission {
    /** Path-derived key segment, unique within its module. */
    key: string;
    /** Sidebar label, byte-for-byte identical to `MENUS`. */
    label: string;
    /** Next.js page route this sub-item opens. */
    route: string;
    actions: readonly PermissionAction[];
    /** Extra non-CRUD actions this sub-item supports. */
    specials: readonly SpecialActionDefinition[];
}

export interface ModulePermission {
    /** Path-derived module key, e.g. "clinical". */
    key: string;
    /** Sidebar label, byte-for-byte identical to `MENUS`. */
    label: string;
    /** The module's own path (the sidebar group header). */
    route: string;
    icon: string;
    subItems: readonly SubItemPermission[];
}

/* -------------------------------------------------------------------------- */
/* Key derivation                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Module path -> module key, where the path is not already the desired key.
 * Everything else uses the first path segment verbatim.
 */
const MODULE_KEY_OVERRIDES: Readonly<Record<string, string>> = {
    "/appointments": "opd",
    "/finance": "billing",
};

/**
 * Sub-item path -> sub-item key, where the last path segment is uninformative.
 *
 * These are the "Settings" children whose paths sit outside the `/admin` prefix
 * and would otherwise collide with a far more meaningful sibling key
 * (`/staff/list` -> `admin.list` next to `patients.list`). Every other sub-item
 * uses the last path segment, which is what keeps "Vital Signs" from colliding.
 */
const SUB_ITEM_KEY_OVERRIDES: Readonly<Record<string, string>> = {
    "/organization/details": "hospital",
    "/staff/doctors": "doctors",
    "/staff/list": "staff",
    "/staff/departments": "departments",
    "/staff/schedule": "schedule",
    "/reports": "summary",
};

/** Extra non-CRUD actions, keyed by canonical sub-item path. */
const SPECIAL_ACTIONS_BY_ROUTE: Readonly<Record<string, readonly SpecialActionDefinition[]>> = {
    "/patients/documents": [{ action: "upload", label: "Upload" }],
    "/clinical/prescriptions": [{ action: "prescribe", label: "Prescribe" }],
    "/admissions/discharge": [{ action: "discharge", label: "Discharge" }],
    "/pharmacy/dispensing": [{ action: "dispense", label: "Dispense" }],
    "/finance/payments": [{ action: "refund", label: "Refund" }],
};

/** Every Reports sub-item can export its data. */
const REPORTS_EXPORT: readonly SpecialActionDefinition[] = [{ action: "export", label: "Export" }];

function moduleKeyFor(path: string): string {
    const normalised = (path || "").replace(/\/+$/, "").toLowerCase();
    const override = MODULE_KEY_OVERRIDES[normalised];
    if (override) return override;
    return (normalised.split("/").filter(Boolean)[0] ?? normalised) || "unknown";
}

function subItemKeyFor(path: string): string {
    const normalised = (path || "").replace(/\/+$/, "").toLowerCase();
    const override = SUB_ITEM_KEY_OVERRIDES[normalised];
    if (override) return override;
    return (normalised.split("/").filter(Boolean).pop() ?? normalised) || "unknown";
}

function specialsFor(moduleKey: string, route: string): readonly SpecialActionDefinition[] {
    if (moduleKey === "reports") return REPORTS_EXPORT;
    return SPECIAL_ACTIONS_BY_ROUTE[route] ?? [];
}

/* -------------------------------------------------------------------------- */
/* The derived catalogue                                                      */
/* -------------------------------------------------------------------------- */

/** Every module and sub-item, derived from the sidebar definition. */
export const PERMISSION_MODULES: readonly ModulePermission[] = MENUS.map((menu) => {
    const key = moduleKeyFor(menu.path);
    return {
        key,
        label: menu.name,
        route: menu.path,
        icon: menu.icon ?? "",
        subItems: (menu.children ?? []).map((child) => ({
            key: subItemKeyFor(child.path),
            label: child.name,
            route: child.path,
            actions: PERMISSION_ACTIONS,
            specials: specialsFor(key, child.path.toLowerCase()),
        })),
    };
});

/** Builds the canonical `module.submodule:action` key. */
export function permissionKey(moduleKey: string, subItemKey: string, action: string): string {
    return `${moduleKey}.${subItemKey}:${action}`;
}

export interface ParsedPermission {
    moduleKey: string;
    subItemKey: string;
    action: string;
}

const PERMISSION_KEY_PATTERN = /^([a-z0-9-]+)\.([a-z0-9-]+):([a-z]+)$/;

/** Splits a permission key. Returns `null` for anything not in this format. */
export function parsePermissionKey(key: string): ParsedPermission | null {
    const match = PERMISSION_KEY_PATTERN.exec((key || "").trim().toLowerCase());
    if (!match) return null;
    return { moduleKey: match[1], subItemKey: match[2], action: match[3] };
}

export function isSubItemPermission(key: string): boolean {
    return PERMISSION_KEY_PATTERN.test((key || "").trim().toLowerCase());
}

/** Flat index of every permission the system defines. */
export const PERMISSION_INDEX: ReadonlyMap<string, SubItemPermission & { module: ModulePermission }> = new Map(
    PERMISSION_MODULES.flatMap((module) =>
        module.subItems.flatMap((subItem) => {
            const actions = [
                ...subItem.actions.map((action) => permissionKey(module.key, subItem.key, action)),
                ...subItem.specials.map((special) => permissionKey(module.key, subItem.key, special.action)),
            ];
            return actions.map((key) => [key, { ...subItem, module }] as const);
        })
    )
);

/** Every permission key the system defines. */
export const ALL_SUB_ITEM_PERMISSIONS: readonly string[] = [...PERMISSION_INDEX.keys()];

/** Every sub-item, flattened, each carrying its owning module. */
export const ALL_SUB_ITEMS: readonly (SubItemPermission & { module: ModulePermission })[] = [
    ...new Map(
        PERMISSION_MODULES.flatMap((module) =>
            module.subItems.map((subItem) => [permissionKey(module.key, subItem.key, "view"), { ...subItem, module }] as const)
        )
    ).values(),
];

export function findModule(moduleKey: string): ModulePermission | undefined {
    return PERMISSION_MODULES.find((module) => module.key === moduleKey);
}

export function findSubItem(moduleKey: string, subItemKey: string): SubItemPermission | undefined {
    return findModule(moduleKey)?.subItems.find((subItem) => subItem.key === subItemKey);
}

/**
 * Resolves the permission keys guarding a sidebar sub-item.
 * Visibility is `view` OR `create` — a page you may only create into is still
 * a page you need to reach in order to create.
 */
export function viewPermissionsFor(moduleKey: string, subItemKey: string): readonly string[] {
    const subItem = findSubItem(moduleKey, subItemKey);
    if (!subItem) return [];
    return [
        permissionKey(moduleKey, subItemKey, "view"),
        permissionKey(moduleKey, subItemKey, "create"),
    ];
}

/** Resolves the permission key guarding a sidebar path (module path or sub-item path). */
export function permissionsForRoute(path: string): readonly string[] {
    const normalised = (path || "").replace(/\/+$/, "").toLowerCase();
    if (!normalised) return [];
    for (const catalogueModule of PERMISSION_MODULES) {
        if (catalogueModule.route.toLowerCase() === normalised) {
            return catalogueModule.subItems.flatMap((subItem) =>
                viewPermissionsFor(catalogueModule.key, subItem.key)
            );
        }
        for (const subItem of catalogueModule.subItems) {
            if (subItem.route.toLowerCase() === normalised) {
                return viewPermissionsFor(catalogueModule.key, subItem.key);
            }
        }
    }
    return [];
}

/** Grouped `module > sub-item > actions` shape served by `GET /api/permissions`. */
export interface PermissionCatalogueModule {
    key: string;
    label: string;
    route: string;
    icon: string;
    subItems: {
        key: string;
        label: string;
        route: string;
        permissions: { action: string; label: string; key: string; special: boolean }[];
    }[];
}

export function buildPermissionCatalogue(): PermissionCatalogueModule[] {
    return PERMISSION_MODULES.map((module) => ({
        key: module.key,
        label: module.label,
        route: module.route,
        icon: module.icon,
        subItems: module.subItems.map((subItem) => ({
            key: subItem.key,
            label: subItem.label,
            route: subItem.route,
            permissions: [
                ...subItem.actions.map((action) => ({
                    action,
                    label: action.charAt(0).toUpperCase() + action.slice(1),
                    key: permissionKey(module.key, subItem.key, action),
                    special: false,
                })),
                ...subItem.specials.map((special) => ({
                    action: special.action,
                    label: special.label,
                    key: permissionKey(module.key, subItem.key, special.action),
                    special: true,
                })),
            ],
        })),
    }));
}