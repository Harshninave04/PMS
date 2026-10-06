import { Types } from "mongoose";
import { IAccess, IManagedRole, RoleOwnership } from "@/interfaces/role.interface";
import { PERMISSION_KEYS } from "@/lib/rbac/permissions";
import { BASELINE_REFERENCE_PERMISSIONS, REFERENCE_DATA_MODULE } from "@/types/rbac";

export interface CreateRoleDto {
    role: string;
    access: IAccess[];
    managedRoles?: IManagedRole[];
}

export interface UpdateRoleDto {
    role?: string;
    access?: IAccess[];
    managedRoles?: IManagedRole[];
    managedBy?: RoleOwnership;
}

const ORG_SCOPES = ["GLOBAL", "ORGANIZATION", "BRANCH", "DEPARTMENT", "WARD"] as const;
const REL_SCOPES = ["UNRESTRICTED", "ASSIGNED", "OWN"] as const;

const ROLE_NAME_PATTERN = /^[A-Z][A-Z0-9_]{1,31}$/;

/**
 * Every permission string the application recognises. A request that names a
 * permission outside this set is rejected rather than persisted, so a crafted
 * payload cannot introduce permission strings the UI never renders.
 */
const KNOWN_PERMISSIONS: ReadonlySet<string> = new Set<string>([
  ...Object.values(PERMISSION_KEYS),
  ...BASELINE_REFERENCE_PERMISSIONS,
]);

/** Module names are derived from the permission prefixes plus the private baseline module. */
const KNOWN_MODULES: ReadonlySet<string> = new Set<string>([
  ...new Set([...KNOWN_PERMISSIONS].map((p) => p.split(".")[0])),
  REFERENCE_DATA_MODULE,
]);

/** Names that must never be introduced through the role editor. */
const RESERVED_ROLE_NAMES: ReadonlySet<string> = new Set(["SYSTEM_SUPER_ADMIN"]);

export class RoleValidationError extends Error {
    readonly statusCode = 400;

    constructor(message: string) {
        super(message);
        this.name = "RoleValidationError";
    }
}

function assertStringArray(value: unknown, field: string): string[] {
    if (!Array.isArray(value)) {
        throw new RoleValidationError(`"${field}" must be an array`);
    }
    if (!value.every((entry) => typeof entry === "string")) {
        throw new RoleValidationError(`"${field}" must contain only strings`);
    }
    return value as string[];
}

export function assertValidRoleName(role: unknown): string {
    if (typeof role !== "string" || !ROLE_NAME_PATTERN.test(role)) {
        throw new RoleValidationError(
            "Role name must be 2-32 characters of A-Z, 0-9 or underscore and start with a letter"
        );
    }
    if (RESERVED_ROLE_NAMES.has(role)) {
        throw new RoleValidationError(`"${role}" is a reserved role name and cannot be assigned`);
    }
    return role;
}

/**
 * Rebuilds the `access` array from an untrusted payload using only recognised
 * permissions, and re-derives `grants` from the permissions that survived.
 * Unknown permissions are dropped; anything that leaves no permissions is not
 * stored at all.
 */
export function sanitizeAccess(value: unknown): IAccess[] {
    if (!Array.isArray(value)) {
        throw new RoleValidationError('"access" must be an array of modules');
    }

    const access: IAccess[] = [];

    for (const rawModule of value) {
        if (typeof rawModule !== "object" || rawModule === null) {
            throw new RoleValidationError('"access" entries must be objects');
        }

        const { moduleName, grants } = rawModule as Record<string, unknown>;

        if (typeof moduleName !== "string" || !KNOWN_MODULES.has(moduleName)) {
            throw new RoleValidationError(`Unknown module: ${String(moduleName)}`);
        }

        const requested = assertStringArray((rawModule as IAccess).permissions, `${moduleName}.permissions`);

        const permissions = [...new Set(requested)].filter((perm) => {
            if (!KNOWN_PERMISSIONS.has(perm)) {
                throw new RoleValidationError(`Unknown permission: ${perm}`);
            }
            // A permission must live in the module it claims.
            if (REFERENCE_DATA_MODULE !== moduleName && perm.split(".")[0] !== moduleName) {
                throw new RoleValidationError(`Permission "${perm}" does not belong to module "${moduleName}"`);
            }
            return true;
        });

        if (permissions.length === 0) continue;

        // Preserve operator-chosen scope, but only for permissions that still
        // exist in the rebuilt list, and only with recognised enum values.
        const requestedGrants = Array.isArray(grants) ? grants : [];
        const rebuiltGrants = permissions.map((permission) => {
            const match = requestedGrants.find(
                (g: unknown) => typeof g === "object" && g !== null && (g as { permission?: unknown }).permission === permission
            ) as { orgScope?: unknown; relScope?: unknown } | undefined;

            const orgScope = ORG_SCOPES.includes(match?.orgScope as (typeof ORG_SCOPES)[number])
                ? (match?.orgScope as (typeof ORG_SCOPES)[number])
                : "BRANCH";

            const relScope = REL_SCOPES.includes(match?.relScope as (typeof REL_SCOPES)[number])
                ? (match?.relScope as (typeof REL_SCOPES)[number])
                : "UNRESTRICTED";

            return { permission, orgScope, relScope };
        });

        access.push({ moduleName, permissions, grants: rebuiltGrants });
    }

    return access;
}

/**
 * Rebuilds `managedRoles` from an untrusted payload.
 *
 * The stored shape is `{ roleId, permissions }`. An earlier version of this
 * function expected a bare array of id strings and wrote them straight through,
 * which replaced every managed-role entry with an object whose `permissions`
 * was empty and whose `roleId` was never a real ObjectId. Both the shape and the
 * referenced role are therefore checked before anything is stored.
 */
export function sanitizeManagedRoles(value: unknown): IManagedRole[] {
    if (!Array.isArray(value)) {
        throw new RoleValidationError('"managedRoles" must be an array');
    }

    const roleIds = new Set<string>();
    const managed: IManagedRole[] = [];

    for (const raw of value) {
        if (typeof raw !== "object" || raw === null) {
            throw new RoleValidationError('"managedRoles" entries must be objects');
        }

        const { roleId } = raw as Record<string, unknown>;

        // Accept an id string as well as an ObjectId, since JSON cannot carry one.
        const id = roleId instanceof Types.ObjectId ? roleId.toString() : String(roleId ?? "");
        if (!Types.ObjectId.isValid(id)) {
            throw new RoleValidationError(`"managedRoles" contains an invalid role id: ${id || "missing"}`);
        }
        if (roleIds.has(id)) continue;
        roleIds.add(id);

        const permissions = assertStringArray(
            (raw as { permissions?: unknown }).permissions ?? [],
            `managedRoles[${id}].permissions`
        ).filter((perm) => {
            if (!KNOWN_PERMISSIONS.has(perm)) {
                throw new RoleValidationError(`Unknown permission in managedRoles: ${perm}`);
            }
            return true;
        });

        managed.push({ roleId: new Types.ObjectId(id), permissions: [...new Set(permissions)] });
    }

    return managed;
}

/**
 * Whitelist for `RoleRepository.update`: only these fields may ever be written.
 *
 * `managedBy` is deliberately not client-writable. Ownership flips to "admin"
 * automatically whenever a role is edited, and flipping back to "code" is what
 * makes the boot-time reconciler overwrite an operator's decision, so it has to
 * go through an explicit reset path rather than a field in an update payload.
 */
export function sanitizeUpdateRoleDto(payload: Record<string, unknown>): UpdateRoleDto {
    const update: UpdateRoleDto = {};

    if (payload.role !== undefined) {
        update.role = assertValidRoleName(payload.role);
    }
    if (payload.access !== undefined) {
        update.access = sanitizeAccess(payload.access);
    }
    if (payload.managedRoles !== undefined) {
        update.managedRoles = sanitizeManagedRoles(payload.managedRoles);
    }

    return update;
}