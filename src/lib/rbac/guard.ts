import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Model, Types } from "mongoose";
import authOptions from "@/lib/auth";
import dbConnect from "@/lib/dbConnect";
import User from "@/models/user.model";
import Role from "@/models/role.model";
import Doctor from "@/models/doctor.model";
import Staff from "@/models/staff.model";
import {
  AuthenticatedUserContext,
  AuthorizationResult,
  IPermissionGrant,
  ScopeFilter
} from "@/types/rbac";
import { ScopeResolver } from "@/lib/rbac/scope-resolver";

/**
 * Closed-loop authorization guard for API route controllers.
 *
 * Controllers provide ONLY the required permission string and optional target model.
 * Controllers NEVER pass or select the scope.
 * The engine resolves identity, verifies permissions, and computes the exact immutable scope filter.
 */
export async function authorizeRequest<T = Record<string, unknown>>(
  _request: Request,
  requiredPermission: string,
  targetModelOrName?: Model<T> | string
): Promise<AuthorizationResult<T>> {
  try {
    await dbConnect();

    // 1. Session Extraction
    const session = await getServerSession(authOptions);
    if (!session || !session.user || !session.user.id) {
      return {
        isAuthorized: false,
        errorCode: "UNAUTHENTICATED",
        reason: "Unauthorized: Missing or invalid authentication session",
        response: NextResponse.json(
          { success: false, message: "Unauthorized: Please log in to proceed" },
          { status: 401 }
        )
      };
    }

    const currentUserId = session.user.id;
    if (!Types.ObjectId.isValid(currentUserId)) {
      return {
        isAuthorized: false,
        errorCode: "UNAUTHENTICATED",
        reason: "Unauthorized: Invalid user identifier in session",
        response: NextResponse.json(
          { success: false, message: "Unauthorized: Malformed session identity" },
          { status: 401 }
        )
      };
    }

    // 2. Fetch User Record
    const userDoc = await User.findById(currentUserId).lean();
    if (!userDoc) {
      return {
        isAuthorized: false,
        errorCode: "UNAUTHENTICATED",
        reason: "Unauthorized: User account not found",
        response: NextResponse.json(
          { success: false, message: "Unauthorized: Account does not exist" },
          { status: 401 }
        )
      };
    }

    if (userDoc.isActive === false) {
      return {
        isAuthorized: false,
        errorCode: "INACTIVE_ACCOUNT",
        reason: "Forbidden: Account has been deactivated",
        response: NextResponse.json(
          { success: false, message: "Forbidden: Your account has been deactivated" },
          { status: 403 }
        )
      };
    }

    // 3. Fetch Role Record
    if (!userDoc.role) {
      return {
        isAuthorized: false,
        errorCode: "FORBIDDEN",
        reason: "Forbidden: User has no assigned role",
        response: NextResponse.json(
          { success: false, message: "Forbidden: No role assigned to your account" },
          { status: 403 }
        )
      };
    }

    const roleDoc = await Role.findById(userDoc.role).lean();
    if (!roleDoc) {
      return {
        isAuthorized: false,
        errorCode: "FORBIDDEN",
        reason: "Forbidden: Assigned role not found in system",
        response: NextResponse.json(
          { success: false, message: "Forbidden: Role definition not found" },
          { status: 403 }
        )
      };
    }

    // 4. Resolve Auxiliary Clinical / Staff Profiles
    const userObjectId = new Types.ObjectId(userDoc._id.toString());
    const [doctorProfile, staffProfile] = await Promise.all([
      Doctor.findOne({ userId: userObjectId }).select("_id departmentId").lean(),
      Staff.findOne({ userId: userObjectId }).select("_id departmentId assignedWards").lean()
    ]);

    const resolvedDoctorProfileId = doctorProfile ? new Types.ObjectId(doctorProfile._id.toString()) : undefined;
    const resolvedStaffProfileId = staffProfile ? new Types.ObjectId(staffProfile._id.toString()) : undefined;
    const resolvedDepartmentId = (doctorProfile?.departmentId || staffProfile?.departmentId)
      ? new Types.ObjectId((doctorProfile?.departmentId || staffProfile?.departmentId).toString())
      : undefined;

    // Wards the staff member is rostered to. Populated from the profile so the
    // WARD orgScope is actually evaluable rather than hardcoded to empty.
    const resolvedWardIds = ((staffProfile?.assignedWards ?? []) as unknown[])
      .map((wardId) => String(wardId))
      .filter((wardId) => Types.ObjectId.isValid(wardId))
      .map((wardId) => new Types.ObjectId(wardId));

    // 5. Index Permissions and Grants
    const permissionsSet = new Set<string>();
    const grantsMap = new Map<string, IPermissionGrant>();

    if (Array.isArray(roleDoc.access)) {
      for (const moduleAccess of roleDoc.access) {
        // `permissions` is the authoritative list. `grants` is derived from it
        // (see buildGrant) and only ever carries scope metadata, so a stale
        // grant must never be able to re-add a permission an administrator has
        // since revoked through the permissions editor.
        if (Array.isArray(moduleAccess.permissions)) {
          for (const perm of moduleAccess.permissions) {
            permissionsSet.add(perm);
          }
        }
      }

      for (const moduleAccess of roleDoc.access) {
        if (!Array.isArray(moduleAccess.grants)) continue;

        for (const grant of moduleAccess.grants) {
          if (!permissionsSet.has(grant.permission)) continue;

          grantsMap.set(grant.permission, {
            permission: grant.permission,
            orgScope: grant.orgScope || "BRANCH",
            relScope: grant.relScope || "UNRESTRICTED"
          });
        }
      }
    }

    const userContext: AuthenticatedUserContext = {
      userId: userObjectId,
      email: userDoc.email,
      name: userDoc.name,
      roleId: new Types.ObjectId(roleDoc._id.toString()),
      roleName: roleDoc.role,
      organizationId: userDoc.organization ? new Types.ObjectId(userDoc.organization.toString()) : undefined,
      branchId: userDoc.branch ? new Types.ObjectId(userDoc.branch.toString()) : undefined,
      departmentId: resolvedDepartmentId,
      doctorProfileId: resolvedDoctorProfileId,
      staffProfileId: resolvedStaffProfileId,
      assignedWardIds: resolvedWardIds,
      permissions: permissionsSet,
      grants: grantsMap
    };

    // 6. Super Admin Fast Path
    if (roleDoc.role === "SYSTEM_SUPER_ADMIN") {
      const superAdminGrant: IPermissionGrant = {
        permission: requiredPermission,
        orgScope: "GLOBAL",
        relScope: "UNRESTRICTED"
      };

      return {
        isAuthorized: true,
        context: userContext,
        filter: {} as ScopeFilter<T>,
        grant: superAdminGrant
      };
    }

    // 7. Permission Verification
    if (!permissionsSet.has(requiredPermission)) {
      return {
        isAuthorized: false,
        errorCode: "FORBIDDEN",
        reason: `Forbidden: Missing required permission [${requiredPermission}]`,
        response: NextResponse.json(
          {
            success: false,
            message: `Forbidden: You do not have permission to perform this action (${requiredPermission})`
          },
          { status: 403 }
        )
      };
    }

    // 8. Derive Effective Scope (Deterministic Grant)
    let effectiveGrant = grantsMap.get(requiredPermission);

    // Backward-compatibility fallback for legacy seeded roles without structured grants
    if (!effectiveGrant) {
      const isClinicalDoctorModule = requiredPermission.startsWith("appointment.") || requiredPermission.startsWith("clinical.");
      const isDoctorRole = roleDoc.role.includes("DOCTOR") || roleDoc.role.includes("CONSULTANT");

      effectiveGrant = {
        permission: requiredPermission,
        orgScope: roleDoc.role.includes("ORGANIZATION") ? "ORGANIZATION" : "BRANCH",
        relScope: (isDoctorRole && isClinicalDoctorModule) ? "OWN" : "UNRESTRICTED"
      };
    }

    // 9. Derive Target Model Name
    const modelName = typeof targetModelOrName === "string"
      ? targetModelOrName
      : targetModelOrName?.modelName;

    // 10. Compute Immutable Scope Filter via ScopeResolver
    const filter = ScopeResolver.resolve<T>(effectiveGrant, userContext, modelName);

    return {
      isAuthorized: true,
      context: userContext,
      filter,
      grant: effectiveGrant
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal authorization error";
    return {
      isAuthorized: false,
      errorCode: "FORBIDDEN",
      reason: `Authorization failure: ${message}`,
      response: NextResponse.json(
        { success: false, message: "Internal server error during authorization check" },
        { status: 500 }
      )
    };
  }
}
