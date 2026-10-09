/**
 * Sidebar navigation for the simplified hospital system.
 *
 * The literal tree lives in `src/lib/menu-seed.ts`, which has no imports and is
 * therefore safe for `rbac/permissions.config.ts` to read while it derives the
 * permission catalogue. Keeping it separate is what stops the seed and the
 * permission catalogue from importing each other in a cycle.
 */
import { MENUS } from "./menu-seed";
import { permissionsForRoute } from "./rbac/permissions.config";

export { MENUS, getMenuModuleKey } from "./menu-seed";
export type { MenuSeed } from "./menu-seed";

export interface MenuNode {
    moduleKey?: string;
    path?: string;
    name?: string;
    children?: MenuNode[];
}

/** Every path this build owns, parents and children alike. */
export const CANONICAL_MENU_PATHS: ReadonlySet<string> = new Set(
    MENUS.flatMap(({ children, ...parent }) => [
        parent.path ?? "",
        ...(children ?? []).map((child) => child.path ?? ""),
    ])
);

function isCanonicalMenu(menu: MenuNode): boolean {
    return CANONICAL_MENU_PATHS.has((menu.path ?? "").toLowerCase());
}

/**
 * Drops every stored menu this build does not ship.
 *
 * The sidebar reads `Menu` documents from MongoDB, and that database outlives a
 * code change: it keeps rows for modules that no longer exist, so they would
 * render as links to pages that were deleted. Filtering here means the UI is
 * correct even when the rows have not been cleaned up yet — the reconciler in
 * `rbac/canonical-sync` removes them from the database, this stops them from
 * ever being shown.
 */
export function restrictToCanonicalMenus<T extends MenuNode>(menus: readonly T[]): T[] {
    return menus
        .filter(isCanonicalMenu)
        .map((menu) =>
            Array.isArray(menu.children)
                ? { ...menu, children: menu.children.filter(isCanonicalMenu) }
                : menu
        );
}

/**
 * Fixed, flat sidebars for roles that do not get the grouped tree.
 *
 * The Receptionist works from three shortcuts only: no OPD section, no other
 * modules — the desk's whole world is booking, looking a patient up, and the
 * appointment roster, in that order.
 */
const FLAT_NAV_FOR_ROLE: Record<string, readonly { path: string; icon: string }[]> = {
    RECEPTIONIST: [
        { path: "/appointments/book", icon: "CalendarPlus" },
        { path: "/patients/list", icon: "Users" },
        { path: "/appointments/list", icon: "Calendar" },
    ],
};

/**
 * Replaces the grouped tree with the role's fixed sidebar when it has one, so
 * `/api/menu` answers the Receptionist with three flat links while every other
 * role keeps the tree it already had.
 *
 * The selection still rides on the permission filter that ran first: a shortcut
 * only appears when the user may actually open its page, so a role whose
 * permissions were narrowed shows fewer shortcuts instead of a dead link.
 */
export function applyRoleNav<T extends MenuNode>(
    roleName: string | null | undefined,
    menus: readonly T[]
): T[] {
    const flat = FLAT_NAV_FOR_ROLE[(roleName ?? "").trim().toUpperCase()];
    if (!flat) return [...menus];

    const byPath = new Map<string, T>();
    for (const menu of menus) {
        if (menu.path) byPath.set(menu.path.toLowerCase(), menu);
        for (const child of menu.children ?? []) {
            if (child.path) byPath.set(child.path.toLowerCase(), child as T);
        }
    }

    return flat.flatMap(({ path, icon }) => {
        const item = byPath.get(path.toLowerCase());
        if (!item) return [];
        return [{ ...item, children: undefined, icon }];
    });
}

/**
 * Keeps only the sub-items a user may actually open, and only the groups that
 * still have something left in them.
 *
 * This is sub-item level: the caller passes the user's resolved permission set
 * (`module.submodule:action` keys, see `src/lib/rbac/permissions.config.ts`),
 * not a module list. A Receptionist holding only `patients.register:create`
 * sees "Register Patient" and nothing else under Patients, where the old
 * module-keyed filter would have handed them the whole module.
 *
 * A sub-item is visible when the user holds its `view` OR its `create` action —
 * a page you may only create into still has to be reachable in order to create.
 */
export function filterMenusByPermissions<T extends MenuNode>(
    menus: readonly T[],
    permissions: Iterable<string> | null | undefined
): T[] {
    const granted = new Set<string>();
    for (const permission of permissions ?? []) {
        const key = (permission || "").trim().toLowerCase();
        if (key) granted.add(key);
    }

    const canOpen = (path: string): boolean => {
        const keys = permissionsForRoute(path);
        if (keys.length === 0) return false;
        return keys.some((key) => granted.has(key));
    };

    return menus
        .map((menu) => ({
            ...menu,
            children: Array.isArray(menu.children) ? menu.children.filter((child) => canOpen(child.path ?? "")) : menu.children,
        }))
        .filter((menu) => {
            if (!Array.isArray(menu.children)) return canOpen(menu.path ?? "");
            return menu.children.length > 0;
        });
}
