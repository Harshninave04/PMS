"use client";

import React from "react";
import { usePermissions } from "./permission-context";

type PermissionGateMode = "any" | "all";

export interface CanProps {
    /** `module.submodule:action` keys. Super Admin always passes. */
    permission?: string | string[];
    /** `any` (default) passes when one key is held, `all` requires every key. */
    mode?: PermissionGateMode;
    /** Rendered when access is denied. `null` hides the subtree entirely. */
    fallback?: React.ReactNode;
    children: React.ReactNode;
}

/**
 * Renders `children` only when the signed-in user holds the permission.
 *
 * This is a usability guard, not a security boundary — hiding a button does not
 * stop the request it would have made. The server enforces the same keys via
 * `requirePermission`, so the two always agree.
 */
export const Can: React.FC<CanProps> = ({ permission, mode = "any", fallback = null, children }) => {
    const { loading, can, canAny } = usePermissions();

    // Never flash protected controls while the session is still resolving.
    if (loading) return null;

    const keys = permission ? (Array.isArray(permission) ? permission : [permission]) : [];
    if (!keys.length) return <>{children}</>;

    const allowed = mode === "all" ? can(...keys) : canAny(...keys);
    return allowed ? <>{children}</> : <>{fallback}</>;
};

export default Can;