import { Types } from "mongoose";
import Role from "@/models/role.model";
import dbConnect from "@/lib/dbConnect";
import { ALL_ROLES } from "@/lib/rbac/roles";

/**
 * Maps a dashboard URL to the role module that grants access to it. Kept in
 * step with the sidebar tree in `menu-data.ts`.
 */
const PATH_PREFIX_MODULES: ReadonlyArray<readonly [string, string]> = [
    ["/dashboard", "dashboard"],
    ["/patients", "patient"],
    ["/appointments", "appointment"],
    ["/clinical", "clinical"],
    ["/admissions", "admission"],
    ["/wards", "ward"],
    ["/nursing", "nursing"],
    ["/pharmacy", "pharmacy"],
    ["/finance", "billing"],
    ["/reports", "reports"],
    ["/staff", "staff"],
    ["/organization", "organization"],
    ["/admin/users", "user"],
    ["/admin/roles", "role"],
    ["/admin", "admin"],
];

// Longest prefix first, so /admin/users is not swallowed by /admin.
const ORDERED_PREFIXES = [...PATH_PREFIX_MODULES].sort((a, b) => b[0].length - a[0].length);

/** The modules a pathname requires, or null when the path is not governed. */
export function requiredModulesForPath(pathname: string): string[] | null {
    for (const [prefix, moduleName] of ORDERED_PREFIXES) {
        if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
            // The admin panel hosts several modules; /admin/users needs "user",
            // /admin/roles needs "role", and either also implies admin.
            return moduleName === "user" || moduleName === "role"
                ? [moduleName, "admin"]
                : [moduleName];
        }
    }

    return null;
}

/**
 * Whether a role may open `pathname`.
 *
 * The sidebar already hides panels a role cannot use, but that is cosmetic:
 * without this every authenticated user could still type a URL to reach
 * /admin/users or /finance/invoices. The API guard stops them reading data;
 * this stops the page rendering at all.
 *
 * Access is read from the live Role document rather than the JWT so that a
 * permission change takes effect on the next navigation.
 */
export async function canAccessPath(
    pathname: string,
    roleId?: string | null,
    roleName?: string | null
): Promise<boolean> {
    const required = requiredModulesForPath(pathname);
    if (!required) return true;

    await dbConnect();

    const roleDoc =
        roleId && Types.ObjectId.isValid(roleId)
            ? await Role.findById(roleId).select("role access").lean()
            : null;

    const effectiveRole = roleDoc?.role ?? roleName ?? null;

    // Unknown or unrecognised role: fall back to the sidebar rule so an
    // unmigrated database does not lock everyone out of the whole app.
    if (!effectiveRole || !ALL_ROLES.includes(effectiveRole)) return true;

    const access = (roleDoc?.access ?? []) as ReadonlyArray<{ moduleName?: string }>;
    const modules = new Set(access.map((entry) => (entry.moduleName || "").toLowerCase().trim()).filter(Boolean));

    return required.some((moduleName) => modules.has(moduleName));
}