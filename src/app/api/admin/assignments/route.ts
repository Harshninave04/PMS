import { NextResponse } from "next/server";
import { AdminService } from "@/services/admin.service";
import { authorizeRequest } from "@/lib/rbac/guard";
import { AuthenticatedUserContext, PERMISSION_KEYS } from "@/types/rbac";
import dbConnect from "@/lib/dbConnect";
import Role from "@/models/role.model";
import User from "@/models/user.model";

/**
 * role.role.assign alone must not let a user escalate privileges. Only a
 * SYSTEM_SUPER_ADMIN may hand out SYSTEM_* roles or change a super admin, and
 * nobody may change their own role. Returns the refusal reason, or null.
 */
async function checkAssignmentEscalation(
  context: AuthenticatedUserContext,
  roleId: string,
  targetUserIds: unknown
): Promise<string | null> {
  if (context.roleName === "SYSTEM_SUPER_ADMIN") return null;

  await dbConnect();
  const ids = (Array.isArray(targetUserIds) ? targetUserIds : []).map(String);

  if (ids.includes(context.userId.toString())) {
    return "Forbidden: You cannot change your own role";
  }

  const targetRole = await Role.findById(roleId).select("role").lean<{ role: string }>();
  if (!targetRole) return "Forbidden: Target role not found";
  if (targetRole.role.startsWith("SYSTEM_")) {
    return "Forbidden: Only a system super admin can assign system roles";
  }

  const superAdminRole = await Role.findOne({ role: "SYSTEM_SUPER_ADMIN" }).select("_id").lean<{ _id: unknown }>();
  if (superAdminRole && ids.length) {
    const touchesSuperAdmin = await User.exists({ _id: { $in: ids }, role: superAdminRole._id });
    if (touchesSuperAdmin) return "Forbidden: Only a system super admin can change a super admin's role";
  }

  return null;
}

export async function GET(req: Request) {
  const authResult = await authorizeRequest(req, PERMISSION_KEYS.ROLE_VIEW);
  if (!authResult.isAuthorized) return authResult.response;

  try {
    const { searchParams } = new URL(req.url);
    const roleId = searchParams.get("roleId") || "ALL";
    const search = searchParams.get("search") || "";

    const data = await AdminService.getUserAssignments({ roleId, search });
    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const authResult = await authorizeRequest(req, PERMISSION_KEYS.ROLE_ASSIGN);
  if (!authResult.isAuthorized) return authResult.response;

  try {
    const { userIds, roleId, userId } = await req.json();

    if (!roleId) {
      return NextResponse.json(
        { success: false, message: "Target roleId is required." },
        { status: 400 }
      );
    }

    const escalation = await checkAssignmentEscalation(authResult.context, roleId, userId ? [userId] : userIds);
    if (escalation) {
      return NextResponse.json({ success: false, message: escalation }, { status: 403 });
    }

    if (userId) {
      const user = await AdminService.updateUserRole(userId, roleId);
      return NextResponse.json({
        success: true,
        message: "User role updated successfully.",
        data: user,
      });
    }

    if (Array.isArray(userIds) && userIds.length > 0) {
      const result = await AdminService.bulkAssignRoles(userIds, roleId);
      return NextResponse.json({
        success: true,
        message: `Successfully updated roles for ${userIds.length} users.`,
        data: result,
      });
    }

    return NextResponse.json(
      { success: false, message: "Either userId or userIds array must be provided." },
      { status: 400 }
    );
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
