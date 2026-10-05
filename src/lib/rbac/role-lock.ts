/**
 * Who may change a role's permissions, and what to call it on screen.
 *
 * The rule is deliberately tiny and lives in exactly one place, because it is
 * the rule that used to be wrong: the six built-in roles are all `isSystem`,
 * and treating "system" as "read only" made Doctor, Nurse, Receptionist,
 * Pharmacist and Accountant uneditable. That is backwards for a hospital — the
 * Super Admin is precisely the person who needs to widen a Pharmacist to also
 * handle billing.
 *
 * So:
 *   - `ADMIN` (Super Admin) is the only locked role. Narrowing it would remove
 *     the only way back from a bad change, so it always has full access.
 *   - Every other role — system or custom — is editable by anyone who holds
 *     `admin.roles:update`, with two safety rules that live on the server:
 *     nobody may edit the role they administer themselves, and nobody may grant
 *     a permission they do not hold themselves.
 *   - `isSystem` still means what it says: a built-in role cannot be renamed or
 *     deleted. It has nothing to do with editing its permissions.
 *
 * Kept free of server-only imports so the roles list, the permission editor and
 * the API all derive the same answer.
 */
import { ADMIN_ROLE } from "./roles";

/** Why a role cannot be edited, in the words shown to the administrator. */
export type RoleLockReason = "SUPER_ADMIN" | "NOT_PERMITTED" | "OWN_ROLE" | "NOT_LOCKED";

export interface RoleLock {
    locked: boolean;
    reason: RoleLockReason;
    /** One short sentence, safe to show as-is in the UI. */
    message: string;
}

/**
 * `isSystem` only governs rename and delete. It must never be read as
 * "permissions are read only".
 */
export function isRenameLocked(roleName: string): boolean {
    return isSuperAdminName(roleName);
}

export function isSuperAdminName(roleName: string | null | undefined): boolean {
    return (roleName || "").trim().toUpperCase() === ADMIN_ROLE;
}

/**
 * Decides whether the permissions screen for `roleName` is read only.
 *
 * `isSystem` is deliberately NOT an input. See the note at the top of the file.
 */
export function roleLock(options: {
    roleName: string | null | undefined;
    /** The caller holds `admin.roles:update`. */
    mayUpdate?: boolean;
    /** True when this is the caller's own role. */
    isOwnRole?: boolean;
}): RoleLock {
    const { roleName, mayUpdate = false, isOwnRole = false } = options;

    if (isSuperAdminName(roleName)) {
        return {
            locked: true,
            reason: "SUPER_ADMIN",
            message: "Super Admin always has access to everything, so it cannot be changed.",
        };
    }
    if (!mayUpdate) {
        return {
            locked: true,
            reason: "NOT_PERMITTED",
            message: "You need the Manage Roles & Permissions permission to change this role.",
        };
    }
    if (isOwnRole) {
        return {
            locked: true,
            reason: "OWN_ROLE",
            message: "You cannot change the permissions of the role you use yourself.",
        };
    }
    return { locked: false, reason: "NOT_LOCKED", message: "" };
}

/**
 * Short hover text for a control the administrator cannot use. Returns an empty
 * string when the control is available, so callers can always render `title`.
 */
export function disabledReason(lock: RoleLock): string {
    return lock.locked ? lock.message : "";
}