"use client";

import React, { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { usePermissions } from "./permission-context";
import { permissionsForRoute } from "@/lib/rbac/permissions.config";

/**
 * Client-side half of the route guard.
 *
 * `/api/me/permissions` already returns the `module.submodule:action` keys that
 * guard each route, so a page can ask for its own key and send the user to the
 * forbidden screen. This is a UX guard only: every API route re-checks the same
 * key on the server, so editing the client bundle grants nothing.
 */
export function PermissionGate({
    permission,
    children,
}: {
    /** Defaults to whatever `permissions.config` says guards the current path. */
    permission?: string | string[];
    children: React.ReactNode;
}) {
    const pathname = usePathname();
    const router = useRouter();
    const { loading, can, canAny } = usePermissions();
    const [denied, setDenied] = useState(false);

    const routePermission = permission ?? permissionsForRoute(pathname ?? "")[0];
    const keys = routePermission
        ? Array.isArray(routePermission)
            ? routePermission
            : [routePermission]
        : [];

    useEffect(() => {
        if (loading || !keys.length) return;
        const allowed = keys.length === 1 ? can(keys[0]) : canAny(...keys);
        setDenied(!allowed);
        if (!allowed) router.replace("/forbidden");
    }, [loading, keys.join("|"), can, canAny, router]);

    if (loading) return null;
    if (keys.length && denied) return null;

    return <>{children}</>;
}

export default PermissionGate;