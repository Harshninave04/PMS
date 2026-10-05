/**
 * Server-only checks that keep the hospital from locking itself out.
 *
 * The Super Admin role cannot be narrowed through the interface, which closes
 * the usual hole. The remaining way to end up with no administrator is to move
 * the *last* person holding that role onto a different one. Both rules live
 * here so the user screen and any future caller enforce exactly the same thing.
 */
import { Types } from "mongoose";
import Role from "@/models/role.model";
import User from "@/models/user.model";
import { ADMIN_ROLE } from "./roles";

/** The Super Admin role document, or `null` on an unseeded database. */
export async function superAdminRoleId(): Promise<Types.ObjectId | null> {
  const role = await Role.findOne({ role: ADMIN_ROLE }).select("_id").lean();
  return role ? (new Types.ObjectId(String(role._id))) : null;
}

/**
 * Active users holding the Super Admin role, optionally excluding one so a user
 * can be judged on what would remain after they are moved.
 */
export async function countActiveSuperAdmins(excludeUserId?: string): Promise<number> {
  const roleId = await superAdminRoleId();
  if (!roleId) return 0;

  return await User.countDocuments({
    role: roleId,
    isActive: { $ne: false },
    ...(excludeUserId && Types.ObjectId.isValid(excludeUserId) ? { _id: { $ne: new Types.ObjectId(excludeUserId) } } : {}),
  });
}

export interface SuperAdminGuardResult {
  allowed: boolean;
  /** Present when `allowed` is false. */
  message?: string;
}

/**
 * Refuses a change that would leave the hospital with no active administrator.
 */
export async function guardLastSuperAdmin(options: {
  targetUserId: string;
  /** The role name the user is being moved to, when this is a role change. */
  nextRoleName?: string | null;
}): Promise<SuperAdminGuardResult> {
  const roleId = await superAdminRoleId();
  if (!roleId) {
    return { allowed: false, message: "The Super Admin role is missing. Run the seed to restore it." };
  }

  const target = await User.findById(options.targetUserId).select("role isActive").lean();
  if (!target) return { allowed: false, message: "That user no longer exists." };

  const targetHoldsSuperAdmin = target.role && String(target.role) === String(roleId);
  if (!targetHoldsSuperAdmin) return { allowed: true };

  // Still an administrator after the change? Then nothing is at risk.
  const stayingSuperAdmin = options.nextRoleName?.trim().toUpperCase() === ADMIN_ROLE;
  if (stayingSuperAdmin) return { allowed: true };

  if (target.isActive === false) return { allowed: true };

  const remaining = await countActiveSuperAdmins(options.targetUserId);
  if (remaining > 0) return { allowed: true };

  return {
    allowed: false,
    message: `This is the last active Super Admin. Give someone else the Super Admin role before changing this one, or nobody will be able to manage roles and permissions.`,
  };
}

/** True when `roleName` is the one role that is never restricted. */
export function isSuperAdminRoleName(roleName: string | null | undefined): boolean {
  return (roleName || "").trim().toUpperCase() === ADMIN_ROLE;
}