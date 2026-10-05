"use client";

import { useSession } from "next-auth/react";
import { createContext, useContext, useMemo } from "react";

export interface PermissionSnapshot {
    /** `module.submodule:action` keys the caller currently holds. */
    subItem: string[];
    /** Legacy `module.permission` keys, kept for compatibility with old guards. */
    legacy: string[];
    /** Bumped on every role change so clients can drop a stale cache. */
    epoch: number;
}

export interface PermissionContextValue extends PermissionSnapshot {
    /** True once the snapshot has arrived (or was denied outright). */
    loading: boolean;
    isSuperAdmin: boolean;
    roleName: string | null;
    can: (...permissions: string[]) => boolean;
    canAny: (...permissions: string[]) => boolean;
    canAll: (...permissions: string[]) => boolean;
}

const EMPTY: PermissionSnapshot = { subItem: [], legacy: [], epoch: 0 };

const PermissionContext = createContext<PermissionContextValue>({
    ...EMPTY,
    loading: true,
    isSuperAdmin: false,
    roleName: null,
    can: () => false,
    canAny: () => false,
    canAll: () => false,
});

/** Splits a `module.submodule:action` key; returns null for legacy keys. */
function parse(key: string): { module: string; submodule: string; action: string } | null {
    const colon = key.lastIndexOf(":");
    if (colon === -1) return null;
    const head = key.slice(0, colon);
    const dot = head.indexOf(".");
    if (dot === -1) return null;
    return {
        module: head.slice(0, dot),
        submodule: head.slice(dot + 1),
        action: key.slice(colon + 1),
    };
}

function matches(granted: string[], permission: string): boolean {
    if (permission === "*") return true;
    if (granted.includes(permission)) return true;

    const parsed = parse(permission);
    if (!parsed) return false;

    // The admin module owns users and roles, but the sidebar paths are nested
    // under several parents (`/admin/users`, `/staff/list`, ...). Granting a
    // whole module therefore satisfies every sub-item inside it.
    const aliases: Record<string, string[]> = {
        admin: ["admin"],
        staff: ["admin"],
        organization: ["admin"],
        nursing: ["nursing"],
        patients: ["patients"],
    };
    const owners = aliases[parsed.module] ?? [parsed.module];

    return granted.some((key) => {
        const grantedParsed = parse(key);
        if (!grantedParsed) return false;
        if (!owners.includes(grantedParsed.module)) return false;
        return (
            grantedParsed.submodule === parsed.submodule &&
            (grantedParsed.action === parsed.action || grantedParsed.action === "*")
        );
    });
}

export function PermissionsProvider({
    snapshot,
    isSuperAdmin,
    roleName,
    children,
}: {
    snapshot: PermissionSnapshot;
    isSuperAdmin: boolean;
    roleName: string | null;
    children: React.ReactNode;
}) {
    const value = useMemo<PermissionContextValue>(() => {
        const can = (...permissions: string[]) => {
            if (isSuperAdmin) return true;
            return permissions.every((permission) => matches(snapshot.subItem, permission));
        };
        const canAny = (...permissions: string[]) => {
            if (isSuperAdmin) return true;
            return permissions.some((permission) => matches(snapshot.subItem, permission));
        };
        const canAll = can;

        return {
            ...snapshot,
            loading: false,
            isSuperAdmin,
            roleName,
            can,
            canAny,
            canAll,
        };
    }, [snapshot, isSuperAdmin, roleName]);

    return <PermissionContext.Provider value={value}>{children}</PermissionContext.Provider>;
}

/**
 * Reads the permission snapshot the layout fetched on the server.
 *
 * There is no client-side fetch on purpose: the layout already awaits
 * `/api/me/permissions`, so navigation never flashes the wrong buttons.
 */
export function usePermissions(): PermissionContextValue {
    const value = useContext(PermissionContext);
    const { data: session } = useSession();

    if (value.loading && session?.user?.permissions) {
        // Fallback for any subtree rendered outside the provider.
        const subItem = session.user.permissions ?? [];
        return {
            subItem,
            legacy: [],
            epoch: 0,
            loading: false,
            isSuperAdmin: session.user.roleName === "ADMIN",
            roleName: session.user.roleName ?? null,
            can: (...permissions) =>
                session.user.roleName === "ADMIN" ||
                permissions.every((permission) => matches(subItem, permission)),
            canAny: (...permissions) =>
                session.user.roleName === "ADMIN" ||
                permissions.some((permission) => matches(subItem, permission)),
            canAll: (...permissions) =>
                session.user.roleName === "ADMIN" ||
                permissions.every((permission) => matches(subItem, permission)),
        };
    }

    return value;
}

export { PermissionContext, matches as permissionMatches };