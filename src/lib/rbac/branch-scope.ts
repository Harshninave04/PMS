import { Types } from "mongoose";
import { AuthenticatedUserContext } from "@/types/rbac";

/**
 * Branch tenancy helpers for records that carry a `branchId`
 * (Appointment, Patient, ...).
 *
 * This centralises the boundary pattern used by AppointmentController and
 * PatientController.addDocument: a permission grant whose organizational
 * boundary is BRANCH keeps the caller inside their own branch's records.
 * Cross-branch records are never assumed unreachable — instead of post-hoc
 * 403 checks, the branch filter is merged into every read AND every
 * conditional update, so records from another branch are simply not found
 * and the routes answer 404.
 */

/**
 * Accepts either the guard's `AuthorizationResult` (route handlers pass the
 * whole authorization outcome) or a plain `{ branchId, orgScope }` pair
 * (pure tests and callers without a full authorization result).
 */
export type ScopeSource =
  | { context: { branchId?: Types.ObjectId | null | undefined }; grant: { orgScope?: string | null | undefined } }
  | (Pick<AuthenticatedUserContext, "branchId"> & { orgScope?: string | null | undefined });

interface BranchFacet {
    branchId?: Types.ObjectId | null | undefined;
    orgScope?: string | null | undefined;
}

function branchFacetOf(source: ScopeSource): BranchFacet {
    if ("grant" in source) {
        return { branchId: source.context.branchId, orgScope: source.grant.orgScope };
    }
    return source;
}

function asObjectId(value: unknown): Types.ObjectId {
    return value instanceof Types.ObjectId ? value : new Types.ObjectId(String(value));
}

/** True when the caller must be confined to records of their own branch. */
export function isBranchConfined(auth: ScopeSource): boolean {
    const branchFacet = branchFacetOf(auth);
    return Boolean(branchFacet.branchId && branchFacet.orgScope === "BRANCH");
}

/**
 * Merges the caller's branch into a read or update filter. Callers with an
 * organization-wide or global grant keep the base filter untouched.
 */
export function withBranchScope<T extends Record<string, unknown>>(
    auth: ScopeSource,
    base: T = {} as T
): T {
    if (!isBranchConfined(auth)) return base;
    return { ...base, branchId: asObjectId(branchFacetOf(auth).branchId) } as T;
}

/**
 * Record-level check for flows that fetch across models first (e.g. the
 * upload route, mirroring PatientController.addDocument): reports whether a
 * record's `branchId` lies outside the caller's branch confinement.
 */
export function recordBranchOutsideScope(auth: ScopeSource, recordBranchId: unknown): boolean {
    if (!isBranchConfined(auth) || recordBranchId === null || recordBranchId === undefined) return false;
    return asObjectId(recordBranchId).toString() !== asObjectId(branchFacetOf(auth).branchId).toString();
}
