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
import { resolveRolePermissions, type ResolvedRolePermissions } from "@/lib/rbac/role-permissions";
import { isSuperAdminRole } from "@/lib/rbac/default-permissions";
import { findRouteRule } from "@/lib/rbac/route-permissions";

/**
 * Closed-loop authorization guard for API route controllers.
 *
 * Controllers provide ONLY the required permission string and optional target model.
 * Controllers NEVER pass or select the scope.
 * The engine resolves identity, verifies permissions, and computes the exact immutable scope filter.
 */
export async function authorizeRequest<T = Record<string, unknown>>(
  request: Request,
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
      Staff.findOne({ userId: userObjectId }).select("_id departmentId").lean()
    ]);

    const resolvedDoctorProfileId = doctorProfile ? new Types.ObjectId(doctorProfile._id.toString()) : undefined;
    const resolvedStaffProfileId = staffProfile ? new Types.ObjectId(staffProfile._id.toString()) : undefined;
    const resolvedDepartmentId = (doctorProfile?.departmentId || staffProfile?.departmentId)
      ? new Types.ObjectId((doctorProfile?.departmentId || staffProfile?.departmentId).toString())
      : undefined;

    // 5. Index Permissions and Grants
    const permissionsSet = new Set<string>();
    const grantsMap = new Map<string, IPermissionGrant>();

    if (Array.isArray(roleDoc.access)) {
      for (const moduleAccess of roleDoc.access) {
        // Collect flat permissions
        if (Array.isArray(moduleAccess.permissions)) {
          for (const perm of moduleAccess.permissions) {
            permissionsSet.add(perm);
          }
        }

        // Collect structured grants if present
        if (Array.isArray(moduleAccess.grants)) {
          for (const grant of moduleAccess.grants) {
            permissionsSet.add(grant.permission);
            grantsMap.set(grant.permission, {
              permission: grant.permission,
              orgScope: grant.orgScope || "BRANCH",
              relScope: grant.relScope || "UNRESTRICTED"
            });
          }
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
      assignedWardIds: [],
      permissions: permissionsSet,
      grants: grantsMap
    };

    // 6. Super Admin Fast Path
    if (isSuperAdminRole(roleDoc.role)) {
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
    const resolvedPermissions = resolveRolePermissions(roleDoc);
    const routeRule = findRouteRule(request);
    const allowed = routeRule
      ? routeRule.permissions === null ||
        routeRule.permissions.some((p) => resolvedPermissions.all.has(p.toLowerCase()))
      : permissionsSet.has(requiredPermission);

    if (!allowed) {
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

/* -------------------------------------------------------------------------- */
/* Sub-item guard                                                             */
/* -------------------------------------------------------------------------- */

export interface RequestIdentity {
  userId: string;
  email: string;
  name?: string;
  roleId: string;
  roleName: string;
  organizationId?: string;
  permissions: ResolvedRolePermissions;
}

function denied(status: 401 | 403, message: string, code: string): NextResponse {
  return NextResponse.json({ success: false, message, code }, { status });
}

/**
 * Resolves who is calling, or `null` when they are not allowed to call at all.
 *
 * Always reads the role document from the database, so a permission change made
 * by an administrator applies to the very next request without the affected user
 * having to log out. There is no cached permission snapshot on the session.
 */
export async function resolveRequestIdentity(): Promise<
  { identity: RequestIdentity } | { response: NextResponse }
> {
  await dbConnect();

  const session = await getServerSession(authOptions);
  const sessionUserId = session?.user?.id;
  if (!sessionUserId || !Types.ObjectId.isValid(sessionUserId)) {
    return {
      response: denied(401, "Unauthorized: Please log in to proceed", "UNAUTHENTICATED"),
    };
  }

  const userDoc = await User.findById(sessionUserId).select("name email role organization isActive").lean();
  if (!userDoc) {
    return { response: denied(401, "Unauthorized: Account does not exist", "UNAUTHENTICATED") };
  }
  if (userDoc.isActive === false) {
    return { response: denied(403, "Forbidden: Your account has been deactivated", "INACTIVE_ACCOUNT") };
  }
  if (!userDoc.role) {
    return { response: denied(403, "Forbidden: No role assigned to your account", "NO_ROLE") };
  }

  const roleDoc = await Role.findById(userDoc.role).lean();
  if (!roleDoc) {
    return { response: denied(403, "Forbidden: Role definition not found", "NO_ROLE") };
  }

  return {
    identity: {
      userId: sessionUserId,
      email: userDoc.email,
      name: userDoc.name,
      roleId: String(roleDoc._id),
      roleName: roleDoc.role,
      organizationId: userDoc.organization ? String(userDoc.organization) : undefined,
      permissions: resolveRolePermissions(roleDoc),
    },
  };
}

/**
 * The single guard every API route uses.
 *
 * ```ts
 * const denied = await requirePermission(request, "patients.list:view");
 * if (denied) return denied;
 * ```
 *
 * Deny by default: no permission means no access, and nothing is granted just
 * because a route forgot to ask. Returns the error response to send, or `null`
 * when the caller may proceed.
 *
 * Pass `null` (or omit) for endpoints that only need a valid, active session —
 * `/api/menu` for the sidebar, `/api/me/permissions`, and the role list the
 * user and role pickers read from.
 */
export async function requirePermission(
  _request: Request,
  permission: string | null
): Promise<NextResponse | null> {
  const resolved = await resolveRequestIdentity();
  if ("response" in resolved) return resolved.response;
  if (!permission) return null;

  const { permissions } = resolved.identity;
  if (permissions.isSuperAdmin || permissions.all.has(permission.toLowerCase())) return null;

  return denied(
    403,
    `Forbidden: you do not have permission (${permission})`,
    "FORBIDDEN"
  );
}

/**
 * Same contract as `requirePermission`, but satisfied by holding *any* of the
 * listed permissions. Used where two capabilities legitimately open the same
 * read — e.g. the role list backs both the Roles screen and the user role picker.
 */
export async function requireAnyPermission(
  _request: Request,
  alternatives: readonly string[]
): Promise<NextResponse | null> {
  const resolved = await resolveRequestIdentity();
  if ("response" in resolved) return resolved.response;
  if (!alternatives.length) return null;

  const { permissions } = resolved.identity;
  if (permissions.isSuperAdmin) return null;
  if (alternatives.some((permission) => permissions.all.has(permission.toLowerCase()))) return null;

  return denied(403, "Forbidden: you do not have permission to view this", "FORBIDDEN");
}
