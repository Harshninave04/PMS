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
 * Fixed sidebars for roles that do not get the full grouped tree.
 *
 * The Receptionist gets three front-desk shortcuts plus the permission-filtered
 * IPD group. The Doctor keeps a compact flat sidebar.
 */
const FLAT_NAV_FOR_ROLE: Record<string, readonly { path: string; icon: string; name?: string }[]> = {
    DOCTOR: [
        { path: "/dashboard/main", icon: "LayoutDashboard" },
        { path: "/appointments/queue", icon: "CalendarClock", name: "OPD Queue" },
        { path: "/appointments/completed-today", icon: "CheckCircle2" },
    ],
    RECEPTIONIST: [
        { path: "/appointments/book", icon: "CalendarPlus" },
        { path: "/patients/list", icon: "Users" },
        { path: "/appointments/list", icon: "Calendar" },
    ],
};

/**
 * Replaces the grouped tree with the role's fixed sidebar when it has one. The
 * selected links still pass through the permission filter above.
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

    const shortcuts = flat.flatMap(({ path, icon, name }) => {
        const item = byPath.get(path.toLowerCase());
        if (!item) return [];
        return [{ ...item, name: name ?? item.name, children: undefined, icon }];
    });

    if ((roleName ?? "").trim().toUpperCase() !== "RECEPTIONIST") return shortcuts;

    // Keep the three front-desk shortcuts and include the permission-filtered
    // Admissions group. Its children were already filtered by view/create.
    const admissions = menus.find((menu) => menu.path?.toLowerCase() === "/admissions");
    return admissions ? [...shortcuts, admissions] : shortcuts;
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
