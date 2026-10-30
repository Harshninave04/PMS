"use client";

import { useSession } from "next-auth/react";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";

export const PERMISSIONS_UPDATED_EVENT = "pms:permissions-updated";

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
    const [currentSnapshot, setCurrentSnapshot] = useState(snapshot);
    const snapshotRef = useRef(snapshot);
    const [currentRoleName, setCurrentRoleName] = useState(roleName);
    const [currentIsSuperAdmin, setCurrentIsSuperAdmin] = useState(isSuperAdmin);
    const identityRef = useRef({ roleName, isSuperAdmin });

    useEffect(() => {
        snapshotRef.current = snapshot;
        identityRef.current = { roleName, isSuperAdmin };
        setCurrentSnapshot(snapshot);
        setCurrentRoleName(roleName);
        setCurrentIsSuperAdmin(isSuperAdmin);
    }, [snapshot, roleName, isSuperAdmin]);

    useEffect(() => {
        let active = true;
        const refresh = async () => {
            try {
                const response = await fetch("/api/me/permissions", { cache: "no-store" });
                if (!response.ok) return;
                const result = await response.json();
                const data = result?.success ? result.data : null;
                if (!active || !data || !Array.isArray(data.permissions)) return;

                const nextPermissions = data.permissions as string[];
                const nextRoleName = typeof data.roleName === "string" ? data.roleName : null;
                const nextIsSuperAdmin = Boolean(data.isSuperAdmin);
                const previous = snapshotRef.current;
                const identityChanged = identityRef.current.roleName !== nextRoleName ||
                    identityRef.current.isSuperAdmin !== nextIsSuperAdmin;
                const permissionsChanged = previous.epoch !== Number(data.epoch ?? 0) ||
                    previous.subItem.length !== nextPermissions.length ||
                    previous.subItem.some((permission, index) => permission !== nextPermissions[index]);
                if (permissionsChanged) {
                    const nextSnapshot = { ...previous, subItem: nextPermissions, epoch: Number(data.epoch ?? previous.epoch) };
                    snapshotRef.current = nextSnapshot;
                    setCurrentSnapshot(nextSnapshot);
                }
                if (identityChanged) identityRef.current = { roleName: nextRoleName, isSuperAdmin: nextIsSuperAdmin };
                setCurrentRoleName(nextRoleName);
                setCurrentIsSuperAdmin(nextIsSuperAdmin);
                if (permissionsChanged || identityChanged) window.dispatchEvent(new Event(PERMISSIONS_UPDATED_EVENT));
            } catch {
                // Keep the last server-rendered snapshot when a transient refresh fails.
            }
        };

        const refreshWhenVisible = () => {
            if (document.visibilityState === "visible") void refresh();
        };
        window.addEventListener("focus", refreshWhenVisible);
        document.addEventListener("visibilitychange", refreshWhenVisible);
        const timer = window.setInterval(refreshWhenVisible, 60_000);
        return () => {
            active = false;
            window.removeEventListener("focus", refreshWhenVisible);
            document.removeEventListener("visibilitychange", refreshWhenVisible);
            window.clearInterval(timer);
        };
    }, []);

    const value = useMemo<PermissionContextValue>(() => {
        const can = (...permissions: string[]) => {
            if (currentIsSuperAdmin) return true;
            return permissions.every((permission) => matches(currentSnapshot.subItem, permission));
        };
        const canAny = (...permissions: string[]) => {
            if (currentIsSuperAdmin) return true;
            return permissions.some((permission) => matches(currentSnapshot.subItem, permission));
        };
        const canAll = can;

        return {
            ...currentSnapshot,
            loading: false,
            isSuperAdmin: currentIsSuperAdmin,
            roleName: currentRoleName,
            can,
            canAny,
            canAll,
        };
    }, [currentSnapshot, currentIsSuperAdmin, currentRoleName]);

    return <PermissionContext.Provider value={value}>{children}</PermissionContext.Provider>;
}

/**
 * Reads the permission snapshot the layout fetched on the server.
 *
 * The layout supplies the first snapshot to avoid flashing controls. The
 * provider then refreshes it on focus and periodically so role edits apply to
 * already-open sessions without requiring a sign-out.
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
