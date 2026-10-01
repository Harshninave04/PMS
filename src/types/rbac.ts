import { Types } from "mongoose";
import { NextResponse } from "next/server";
import { PERMISSION_KEYS, type PermissionKey } from "../lib/rbac/permissions";

/**
 * Modules of the simplified hospital system
 */
export type ModuleKey =
  | "dashboard"
  | "patient"
  | "staff"
  | "appointment"
  | "admission"
  | "ward"
  | "clinical"
  | "nursing"
  | "pharmacy"
  | "billing"
  | "reports"
  | "admin"
  | "organization";

/**
 * Organizational boundary scopes (Spatial / Administrative Jurisdiction)
 */
export type OrganizationalBoundary =
  | "GLOBAL"
  | "ORGANIZATION"
  | "BRANCH"
  | "DEPARTMENT"
  | "WARD";

/**
 * Relational constraint scopes (Subject / Actor-to-Entity Connection)
 */
export type RelationalConstraint =
  | "UNRESTRICTED"
  | "ASSIGNED"
  | "OWN";

/**
 * Represents a deterministic, explicit permission-to-scope grant
 */
export interface IPermissionGrant {
  readonly permission: string;
  readonly orgScope: OrganizationalBoundary;
  readonly relScope: RelationalConstraint;
}

/**
 * Fully resolved context for an authenticated request
 */
export interface AuthenticatedUserContext {
  readonly userId: Types.ObjectId;
  readonly email: string;
  readonly name?: string;
  readonly roleId: Types.ObjectId;
  readonly roleName: string;
  readonly organizationId?: Types.ObjectId;
  readonly branchId?: Types.ObjectId;
  readonly departmentId?: Types.ObjectId;
  readonly doctorProfileId?: Types.ObjectId;
  readonly staffProfileId?: Types.ObjectId;
  readonly assignedWardIds: readonly Types.ObjectId[];
  readonly permissions: ReadonlySet<string>;
  readonly grants: ReadonlyMap<string, IPermissionGrant>;
}

/**
 * Strongly typed MongoDB filter query for scope enforcement
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export type ScopeFilter<T = unknown> = Record<string, unknown>;

/**
 * Successful authorization result containing derived, immutable query filter
 */
export interface AuthorizationSuccess<T> {
  readonly isAuthorized: true;
  readonly context: AuthenticatedUserContext;
  readonly filter: ScopeFilter<T>;
  readonly grant: IPermissionGrant;
}

/**
 * Failed authorization result with strict 401 or 403 HTTP response
 */
export interface AuthorizationFailure {
  readonly isAuthorized: false;
  readonly response: NextResponse;
  readonly errorCode: "UNAUTHENTICATED" | "FORBIDDEN" | "INACTIVE_ACCOUNT";
  readonly reason: string;
}

/**
 * Discriminated union of authorization outcome
 */
export type AuthorizationResult<T> = AuthorizationSuccess<T> | AuthorizationFailure;

export { PERMISSION_KEYS };
export type { PermissionKey };

/**
 * Module name under which baseline reference permissions are stored on a role.
 * It deliberately matches no menu module, so granting it never widens navigation.
 */
export const REFERENCE_DATA_MODULE = "reference-data";

/**
 * Read-only lookups that every staff role needs to fill in forms (department,
 * doctor, ward/bed, branch and staff pickers). Records are still bounded by the
 * role's organization/branch scope.
 */
export const BASELINE_REFERENCE_PERMISSIONS: readonly PermissionKey[] = [
  PERMISSION_KEYS.DEPARTMENT_VIEW,
  PERMISSION_KEYS.DOCTOR_VIEW,
  PERMISSION_KEYS.ORGANIZATION_VIEW,
  PERMISSION_KEYS.WARD_VIEW,
  PERMISSION_KEYS.USER_DIRECTORY_VIEW,
];
