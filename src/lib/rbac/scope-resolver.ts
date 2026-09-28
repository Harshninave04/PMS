import { Types } from "mongoose";
import {
  AuthenticatedUserContext,
  IPermissionGrant,
  OrganizationalBoundary,
  RelationalConstraint,
  ScopeFilter
} from "@/types/rbac";

/**
 * Pure scope resolution engine.
 * Derives immutable MongoDB query filters by composing the organizational boundary
 * and the relational constraint defined in the role's permission grant.
 *
 * Controllers NEVER pass or alter the scope.
 */
export class ScopeResolver {
  /**
   * Resolves the complete MongoDB query filter for a given grant and user context.
   */
  public static resolve<T>(
    grant: IPermissionGrant,
    context: AuthenticatedUserContext,
    targetModelName?: string
  ): ScopeFilter<T> {
    // 1. Super Admin bypass (empty filter matches all records)
    if (context.roleName === "SYSTEM_SUPER_ADMIN" || grant.orgScope === "GLOBAL") {
      return {};
    }

    // 2. Resolve the organizational boundary filter
    const orgFilter = ScopeResolver.resolveOrgBoundary<T>(grant.orgScope, context, targetModelName);

    // 3. Resolve the relational constraint filter
    const relFilter = ScopeResolver.resolveRelConstraint<T>(grant.relScope, context, targetModelName);

    // 4. Combine via conjunction ($and)
    return ScopeResolver.combineFilters<T>(orgFilter, relFilter);
  }

  /**
   * Resolves the spatial / organizational boundary filter (Where the user has jurisdiction)
   */
  private static resolveOrgBoundary<T>(
    boundary: OrganizationalBoundary,
    context: AuthenticatedUserContext,
    targetModelName?: string
  ): ScopeFilter<T> {
    const normalizedModel = (targetModelName || "").toLowerCase();

    switch (boundary) {
      case "GLOBAL":
        return {};

      case "ORGANIZATION": {
        if (!context.organizationId) {
          // If user lacks organization context, deny by returning impossible match
          return { _id: new Types.ObjectId("000000000000000000000000") };
        }

        if (normalizedModel === "user") {
          return { organization: context.organizationId };
        }

        if (normalizedModel === "ward" || normalizedModel === "department") {
          return { organizationId: context.organizationId };
        }

        if (normalizedModel === "room" || normalizedModel === "bed") {
          return {};
        }

        // For records referencing branchId (Patient, Appointment, Invoice, etc.)
        return {
          $or: [
            { organizationId: context.organizationId },
            { branchId: context.branchId || context.organizationId }
          ]
        };
      }

      case "BRANCH": {
        if (!context.branchId) {
          // Deny if user has no branch assigned
          return { _id: new Types.ObjectId("000000000000000000000000") };
        }

        if (normalizedModel === "user") {
          return { branch: context.branchId };
        }

        if (normalizedModel === "ward" || normalizedModel === "department") {
          // Ward and Department use organizationId to store the branch entity
          return { organizationId: context.branchId };
        }

        if (normalizedModel === "room" || normalizedModel === "bed") {
          return {};
        }

        // Default branch field for Patient, Appointment, Invoice, Admission, Prescription
        return { branchId: context.branchId };
      }

      case "DEPARTMENT": {
        if (!context.departmentId) {
          return { _id: new Types.ObjectId("000000000000000000000000") };
        }

        const deptFilter: Record<string, unknown> = { departmentId: context.departmentId };
        if (context.branchId) {
          deptFilter.branchId = context.branchId;
        }
        return deptFilter;
      }

      case "WARD": {
        if (!context.assignedWardIds || context.assignedWardIds.length === 0) {
          return { _id: new Types.ObjectId("000000000000000000000000") };
        }

        if (normalizedModel === "nursingtask") {
          return { ward: { $in: context.assignedWardIds } };
        }

        return { wardId: { $in: context.assignedWardIds } };
      }

      default:
        return { _id: new Types.ObjectId("000000000000000000000000") };
    }
  }

  /**
   * Resolves the relational constraint filter (Who the actor is in relation to the record)
   */
  private static resolveRelConstraint<T>(
    relation: RelationalConstraint,
    context: AuthenticatedUserContext,
    targetModelName?: string
  ): ScopeFilter<T> {
    const normalizedModel = (targetModelName || "").toLowerCase();

    switch (relation) {
      case "UNRESTRICTED":
        return {};

      case "OWN": {
        // Special case: Appointment.doctorId references Doctor._id (Doctor collection),
        // NOT User._id!
        if (normalizedModel === "appointment") {
          if (!context.doctorProfileId) {
            // Actor is not a registered doctor -> impossible match
            return { _id: new Types.ObjectId("000000000000000000000000") };
          }
          return { doctorId: context.doctorProfileId };
        }

        // Prescription and Admission reference User._id as doctorId
        if (normalizedModel === "prescription" || normalizedModel === "admission") {
          return { doctorId: context.userId };
        }

        // Clinical records / consultations
        if (normalizedModel === "clinicalrecord" || normalizedModel === "consultation") {
          return {
            $or: [
              { doctorId: context.userId },
              { createdBy: context.userId }
            ]
          };
        }

        // General fallback for entities with createdBy or userId
        return {
          $or: [
            { userId: context.userId },
            { createdBy: context.userId }
          ]
        };
      }

      case "ASSIGNED": {
        if (normalizedModel === "nursingtask") {
          return { assignedNurse: context.userId };
        }

        return {
          $or: [
            { assignedTo: context.userId },
            { assignedNurse: context.userId },
            { staffId: context.staffProfileId || context.userId }
          ]
        };
      }

      default:
        return {};
    }
  }

  /**
   * Safe conjunction of two ScopeFilters without key collisions.
   */
  public static combineFilters<T>(
    filterA: ScopeFilter<T>,
    filterB: ScopeFilter<T>
  ): ScopeFilter<T> {
    const hasA = Object.keys(filterA).length > 0;
    const hasB = Object.keys(filterB).length > 0;

    if (!hasA && !hasB) return {};
    if (hasA && !hasB) return filterA;
    if (!hasA && hasB) return filterB;

    return {
      $and: [filterA, filterB]
    };
  }
}
