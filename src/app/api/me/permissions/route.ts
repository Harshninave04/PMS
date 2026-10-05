import { NextRequest, NextResponse } from "next/server";
import { resolveRequestIdentity } from "@/lib/rbac/guard";
import { currentPermissionEpoch } from "@/lib/rbac/audit";
import { PERMISSION_MODULES, permissionsForRoute } from "@/lib/rbac/permissions.config";

/**
 * GET /api/me/permissions — the signed-in user's resolved access.
 *
 * This is what fills `usePermissions()` and therefore what drives the sidebar,
 * the route guards and every `<Can>` on the page. It is deliberately readable by
 * any active user with no permission of its own: a user always has to be able to
 * find out what they can do.
 *
 * Nothing here is cached across a role edit — the role document is read on every
 * call, so an administrator's change reaches the affected user's next page load
 * without a re-login. `epoch` lets the client notice that something changed.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
    try {
        const resolved = await resolveRequestIdentity();
        if ("response" in resolved) return resolved.response;

        const { permissions, roleName, roleId, email, name } = resolved.identity;

        return NextResponse.json(
            {
                success: true,
                data: {
                    userId: resolved.identity.userId,
                    name,
                    email,
                    roleId,
                    roleName,
                    isSuperAdmin: permissions.isSuperAdmin,
                    permissions: permissions.subItem,
                    epoch: currentPermissionEpoch(),
                    /** Page -> the permission keys that open it, for the route guard. */
                    routes: PERMISSION_MODULES.flatMap((module) => [
                        ...(module.subItems.length
                            ? []
                            : [{ route: module.route, permissions: permissionsForRoute(module.route) }]),
                        ...module.subItems.map((subItem) => ({
                            route: subItem.route,
                            permissions: permissionsForRoute(subItem.route),
                        })),
                    ]),
                },
            },
            { status: 200 }
        );
    } catch (e: unknown) {
        const err = e as { message?: string };
        return NextResponse.json(
            { success: false, message: err?.message || "Failed to load permissions" },
            { status: 500 }
        );
    }
}