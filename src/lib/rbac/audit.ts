/**
 * Writes the audit trail for role changes and broadcasts the invalidation that
 * makes an edit take effect immediately.
 */
import RoleAudit, { type IRoleAudit } from "@/models/role-audit.model";

/** Bumped whenever any role's permissions change. */
let permissionEpoch = 0;

export function currentPermissionEpoch(): number {
    return permissionEpoch;
}

/**
 * Invalidates every cached view of "who can do what".
 *
 * The server reads the role document on each guarded request, so it is already
 * correct; this exists for the two places that do hold on to a copy — the client
 * permission cache, and any response that embedded a permission list.
 */
export function invalidatePermissionCaches(): number {
    permissionEpoch += 1;
    return permissionEpoch;
}

interface RoleChangeActor {
    userId?: string | null;
    email?: string | null;
    roleName?: string | null;
}

function difference(before: readonly string[], after: readonly string[]): { added: string[]; removed: string[] } {
    const beforeSet = new Set(before);
    const afterSet = new Set(after);
    return {
        added: after.filter((permission) => !beforeSet.has(permission)),
        removed: before.filter((permission) => !afterSet.has(permission)),
    };
}

/**
 * Records a role change. Never throws: a failing audit write must not roll back
 * or block the permission change that already succeeded.
 */
export async function recordRoleChange(entry: {
    action: IRoleAudit["action"];
    role: string;
    roleId?: string | null;
    actor?: RoleChangeActor;
    before?: readonly string[];
    after?: readonly string[];
    reason?: string;
}): Promise<void> {
    const before = [...(entry.before ?? [])];
    const after = [...(entry.after ?? [])];
    const { added, removed } = difference(before, after);

    try {
        await RoleAudit.create({
            action: entry.action,
            role: entry.role,
            roleId: entry.roleId ? String(entry.roleId) : undefined,
            actor: {
                userId: entry.actor?.userId ? String(entry.actor.userId) : undefined,
                email: entry.actor?.email ?? undefined,
                roleName: entry.actor?.roleName ?? undefined,
            },
            before,
            after,
            added,
            removed,
            reason: entry.reason,
        });
    } catch (error) {
        console.error("[rbac] failed to write role audit entry:", error);
    }
}