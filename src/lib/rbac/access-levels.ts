/**
 * The four access levels a hospital administrator picks per screen, and the
 * one-click presets that fill them in.
 *
 * The permission matrix used to be a ten-column grid of tick boxes with empty
 * cells for actions that do not exist. A non-technical administrator cannot read
 * that, and neither can its author six months later. This module is the model
 * the new editor is built on:
 *
 *   No access | View only | Edit | Full
 *
 * which map onto the permission keys that already exist and are already enforced
 * by every API route, so nothing here changes what a permission *means* — only
 * how plainly it is expressed.
 *
 * Pure functions only, no server-only imports, so the editor, the roles list and
 * the tests all derive the same answer from the same code.
 */
import {
    PERMISSION_MODULES,
    permissionKey,
    type ModulePermission,
    type SubItemPermission,
} from "./permissions.config";
import { defaultPermissionsFor, normalizePermissions } from "./default-permissions";

export const ACCESS_LEVELS = ["NONE", "VIEW", "EDIT", "FULL"] as const;
export type AccessLevel = (typeof ACCESS_LEVELS)[number];

export const ACCESS_LEVEL_LABELS: Record<AccessLevel, string> = {
    NONE: "No access",
    VIEW: "View only",
    EDIT: "Edit",
    FULL: "Full",
};

/** One sentence per level, shown under the picker so nobody has to guess. */
export const ACCESS_LEVEL_HELP: Record<AccessLevel, string> = {
    NONE: "Cannot open this page.",
    VIEW: "Can open the page and read it. Cannot change anything.",
    EDIT: "Can add and change records. Cannot delete them.",
    FULL: "Can add, change and delete records.",
};

/** The CRUD action each level grants, in addition to `view`. */
const LEVEL_ACTIONS: Record<Exclude<AccessLevel, "NONE" | "VIEW">, readonly string[]> = {
    EDIT: ["create", "update"],
    FULL: ["create", "update", "delete"],
};

const CRUD_ACTIONS = ["view", "create", "update", "delete"] as const;
type CrudAction = (typeof CRUD_ACTIONS)[number];

function isCrudAction(action: string): action is CrudAction {
    return (CRUD_ACTIONS as readonly string[]).includes(action);
}

/**
 * Plain-language names for the extra, domain-specific actions. These are the
 * only words an administrator sees; the permission key stays in a tooltip.
 */
export const SPECIAL_ACTION_LABELS: Readonly<Record<string, string>> = {
    upload: "Can upload documents",
    prescribe: "Can write prescriptions",
    discharge: "Can discharge patients",
    dispense: "Can dispense medicines",
    refund: "Can give refunds",
    export: "Can export reports",
};

export function specialActionLabel(action: string, fallbackLabel = ""): string {
    const known = SPECIAL_ACTION_LABELS[action];
    if (known) return known;
    const word = (fallbackLabel || action).trim().toLowerCase();
    return word ? `Can ${word}` : `Can ${action}`;
}

/** One short sentence per module, shown under the module name. */
export const MODULE_HELP: Readonly<Record<string, string>> = {
    dashboard: "The landing page every user sees when they sign in.",
    patients: "Register patients, look them up and attach their documents.",
    opd: "Book appointments and work through the outpatient queue.",
    clinical: "Consultations, prescriptions, vital signs and medical history.",
    admissions: "Admit inpatients, move them between beds and discharge them.",
    wards: "See which beds and rooms are free.",
    nursing: "Day-to-day ward care: patients, vital signs, notes and medication rounds.",
    pharmacy: "Hand out medicines and keep stock, categories and expiry dates.",
    billing: "Raise bills, take payments and chase outstanding dues.",
    reports: "Read-only reports and downloads.",
    admin: "Staff logins, roles and hospital settings.",
};

export function moduleHelp(moduleKey: string): string {
    return MODULE_HELP[moduleKey] ?? "";
}

/* -------------------------------------------------------------------------- */
/* Key helpers                                                                */
/* -------------------------------------------------------------------------- */

export function viewKeyOf(moduleKey: string, subItemKey: string): string {
    return permissionKey(moduleKey, subItemKey, "view");
}

export function actionKeyOf(moduleKey: string, subItemKey: string, action: string): string {
    return permissionKey(moduleKey, subItemKey, action);
}

/**
 * The keys a level grants, `view` always included except at `NONE`.
 *
 * Only actions the section actually declares are produced. A page with no delete
 * button must never gain a delete permission just because a level was applied,
 * and the stored set must never contain a key the sidebar cannot match.
 */
export function keysForLevel(moduleKey: string, subItem: SubItemPermission, level: AccessLevel): string[] {
    if (level === "NONE") return [];
    const wanted = new Set<string>(["view", ...(level === "VIEW" ? [] : LEVEL_ACTIONS[level])]);
    return subItem.actions
        .filter((action) => wanted.has(action))
        .map((action) => actionKeyOf(moduleKey, subItem.key, action));
}

/** Every key that exists for a section, in a stable order. */
export function allKeysForSubItem(moduleKey: string, subItem: SubItemPermission): string[] {
    return [
        ...subItem.actions.map((action) => actionKeyOf(moduleKey, subItem.key, action)),
        ...subItem.specials.map((special) => actionKeyOf(moduleKey, subItem.key, special.action)),
    ];
}

/** The change-the-record keys of a section, without its extra actions. */
export function crudKeysForSubItem(moduleKey: string, subItem: SubItemPermission): string[] {
    return subItem.actions.filter(isCrudAction).map((action) => actionKeyOf(moduleKey, subItem.key, action));
}

/** The extra action keys of a section: upload, dispense, refund, and so on. */
export function specialKeysForSubItem(moduleKey: string, subItem: SubItemPermission): string[] {
    return subItem.specials.map((special) => actionKeyOf(moduleKey, subItem.key, special.action));
}

export function allKeysForCatalogue(modules: readonly ModulePermission[] = PERMISSION_MODULES): string[] {
    return modules.flatMap((catalogueModule) =>
        catalogueModule.subItems.flatMap((subItem) => allKeysForSubItem(catalogueModule.key, subItem))
    );
}

/* -------------------------------------------------------------------------- */
/* Level <-> selection                                                        */
/* -------------------------------------------------------------------------- */

/**
 * The level a section is currently at.
 *
 * A level is only reported when it is genuinely satisfied by the stored keys.
 * `view` + `delete` but no `create` is not "Full", and `view` + `create` is not
 * "Edit" — reporting the higher one would quietly promise something the role
 * cannot do. Anything unrecognised falls back to the highest level that is
 * actually true, and a section with nothing on it becomes "No access" rather
 * than a false promise. Choosing a level in the editor repairs such a state,
 * because applying a level rewrites the section's keys outright.
 */
export function levelOf(selected: ReadonlySet<string>, moduleKey: string, subItem: SubItemPermission): AccessLevel {
    const held = (action: string) => selected.has(actionKeyOf(moduleKey, subItem.key, action));
    const hasView = held("view");
    const hasWrite = held("create") && held("update");
    const canDelete = subItem.actions.includes("delete");
    const hasDelete = canDelete && held("delete");

    if (hasView && hasWrite) return hasDelete || !canDelete ? "FULL" : "EDIT";
    // A section that can delete something without being able to write it is only
    // reachable through old data; "Edit" is the closer of the two descriptions.
    if (hasView) return hasDelete ? "EDIT" : "VIEW";
    return "NONE";
}

/**
 * Writes `level` onto a section.
 *
 * Every change-the-record key is cleared first, so lowering a level cannot leave
 * a stale action behind: dragging "Full" back to "View only" really does take
 * delete away again. The extra domain-specific checkboxes (upload, dispense,
 * refund, ...) are left alone while the section stays reachable, because they are
 * deliberate separate choices — except at `NONE`, where they are removed too:
 * an action nobody can reach is not a permission. "View only" clears them as
 * well, because that level promises the role cannot change anything.
 */
export function applyLevel(
    selected: ReadonlySet<string>,
    moduleKey: string,
    subItem: SubItemPermission,
    level: AccessLevel
): Set<string> {
    const next = new Set(selected);
    if (level === "NONE") {
        for (const key of allKeysForSubItem(moduleKey, subItem)) next.delete(key);
        return next;
    }

    for (const key of crudKeysForSubItem(moduleKey, subItem)) next.delete(key);
    for (const key of keysForLevel(moduleKey, subItem, level)) next.add(key);

    if (level === "VIEW") {
        for (const key of specialKeysForSubItem(moduleKey, subItem)) next.delete(key);
    }
    return next;
}

/** Sets every section of every module to the same level. */
export function applyLevelEverywhere(
    selected: ReadonlySet<string>,
    level: AccessLevel,
    modules: readonly ModulePermission[] = PERMISSION_MODULES
): Set<string> {
    let next = new Set(selected);
    for (const catalogueModule of modules) {
        for (const subItem of catalogueModule.subItems) {
            next = applyLevel(next, catalogueModule.key, subItem, level);
        }
    }
    return next;
}

/* -------------------------------------------------------------------------- */
/* The presets                                                                */
/* -------------------------------------------------------------------------- */

export const PRESET_IDS = ["NONE", "VIEW", "STANDARD", "FULL"] as const;
export type PresetId = (typeof PRESET_IDS)[number];

export const PRESETS: readonly {
    id: PresetId;
    label: string;
    help: string;
}[] = [
    { id: "NONE", label: "No access", help: "Hide everything from this role." },
    { id: "VIEW", label: "View only", help: "Open every page, change nothing." },
    { id: "STANDARD", label: "Standard", help: "The normal job for this role." },
    { id: "FULL", label: "Full access", help: "Open, change and delete everywhere." },
];

/**
 * "Full access" keeps the domain-specific actions too, so the preset means what
 * it says on a page like Dispense Medicines.
 */
function withAllSpecials(
    selected: Set<string>,
    modules: readonly ModulePermission[]
): Set<string> {
    for (const catalogueModule of modules) {
        for (const subItem of catalogueModule.subItems) {
            for (const special of subItem.specials) {
                selected.add(actionKeyOf(catalogueModule.key, subItem.key, special.action));
            }
        }
    }
    return selected;
}

/**
 * The selection a preset produces.
 *
 * "Standard" is the shipped default for the role being edited, so an
 * administrator can always get back to a sane baseline without knowing what the
 * baseline is. Everything else replaces the selection outright — presets fill
 * the toggles, and the administrator is free to adjust from there.
 */
export function applyPreset(
    preset: PresetId,
    roleName: string,
    modules: readonly ModulePermission[] = PERMISSION_MODULES
): Set<string> {
    if (preset === "NONE") return new Set();
    if (preset === "VIEW") return applyLevelEverywhere(new Set(), "VIEW", modules);
    if (preset === "STANDARD") return resetToRoleDefault(roleName);
    return withAllSpecials(applyLevelEverywhere(new Set(), "FULL", modules), modules);
}

/**
 * The shipped baseline for a role, normalised. This is what "Reset to default"
 * restores, so an administrator can always get back to a sane starting point
 * without having to know what that baseline is.
 */
export function resetToRoleDefault(roleName: string): Set<string> {
    return new Set(normalizePermissions(defaultPermissionsFor(roleName)));
}

/* -------------------------------------------------------------------------- */
/* Progress + change counting                                                 */
/* -------------------------------------------------------------------------- */

/** A section counts as "allowed" as soon as it can be opened at all. */
export function isSubItemAllowed(selected: ReadonlySet<string>, moduleKey: string, subItemKey: string): boolean {
    return selected.has(viewKeyOf(moduleKey, subItemKey));
}

export interface ModuleProgress {
    allowed: number;
    total: number;
}

export function moduleProgress(
    selected: ReadonlySet<string>,
    catalogueModule: ModulePermission
): ModuleProgress {
    const total = catalogueModule.subItems.length;
    const allowed = catalogueModule.subItems.filter((subItem) =>
        isSubItemAllowed(selected, catalogueModule.key, subItem.key)
    ).length;
    return { allowed, total };
}

/** Whole-catalogue progress, for the roles list. */
export function catalogueProgress(
    selected: ReadonlySet<string>,
    modules: readonly ModulePermission[] = PERMISSION_MODULES
): ModuleProgress {
    let allowed = 0;
    let total = 0;
    for (const catalogueModule of modules) {
        const progress = moduleProgress(selected, catalogueModule);
        allowed += progress.allowed;
        total += progress.total;
    }
    return { allowed, total };
}

/** How many sections differ from what is stored. Drives the status line. */
export function countChangedSections(
    next: ReadonlySet<string>,
    base: ReadonlySet<string>,
    modules: readonly ModulePermission[] = PERMISSION_MODULES
): number {
    let changed = 0;
    for (const catalogueModule of modules) {
        for (const subItem of catalogueModule.subItems) {
            const nextKeys = allKeysForSubItem(catalogueModule.key, subItem).filter((key) => next.has(key));
            const baseKeys = allKeysForSubItem(catalogueModule.key, subItem).filter((key) => base.has(key));
            if (nextKeys.length !== baseKeys.length || nextKeys.some((key) => !base.has(key))) changed += 1;
        }
    }
    return changed;
}

/**
 * True when the master toggle for a module would turn everything on.
 * Indeterminate selections count as "not fully on", so one click fixes them.
 */
export function moduleIsFullyOn(selected: ReadonlySet<string>, catalogueModule: ModulePermission): boolean {
    if (!catalogueModule.subItems.length) return false;
    return catalogueModule.subItems.every((subItem) =>
        isSubItemAllowed(selected, catalogueModule.key, subItem.key)
    );
}

export function moduleIsPartlyOn(selected: ReadonlySet<string>, catalogueModule: ModulePermission): boolean {
    const { allowed, total } = moduleProgress(selected, catalogueModule);
    return allowed > 0 && allowed < total;
}