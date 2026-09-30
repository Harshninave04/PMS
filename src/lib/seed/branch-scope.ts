import { Types } from "mongoose";
import User from "@/models/user.model";
import Doctor from "@/models/doctor.model";
import Staff from "@/models/staff.model";

/**
 * Branch assignment for seeded / demo accounts.
 *
 * Every non-SYSTEM_ role receives BRANCH organizational scope from
 * `enrichAccessWithGrants` in src/seed.ts. ScopeResolver answers a BRANCH
 * grant with the deny-all sentinel whenever the acting user has no `branch`,
 * so an unassigned user sees an empty list everywhere instead of a 403.
 * Seeding `User.organization` + `User.branch` is therefore mandatory, not
 * cosmetic.
 *
 * Campus keys map to the seeded Organization documents:
 *   MAIN       -> MEDISTRA-MAIN    (main hospital, defaultOrg)
 *   SALT_LAKE  -> MEDISTRA-SL-01   (satellite polyclinic, saltLakeBranch)
 *   NEW_TOWN   -> MEDISTRA-NT-02   (diagnostic & dialysis center)
 *
 * The clinical + front-desk cohort is co-located on MAIN so that
 * cross-role workflows (receptionist books against a doctor) resolve within a
 * single branch. The ancillary cohort is placed on the satellite campuses,
 * which both mirrors a realistic deployment and makes cross-branch isolation
 * observable: a MAIN-scoped receptionist must not see SALT_LAKE doctors.
 */
export const DEMO_CAMPUS_BY_ROLE: Readonly<Record<string, "MAIN" | "SALT_LAKE" | "NEW_TOWN">> = {
    // Platform level: GLOBAL scope, branch is irrelevant but kept consistent.
    SYSTEM_SUPER_ADMIN: "MAIN",
    SYSTEM_IT_ADMIN: "MAIN",
    SYSTEM_AUDITOR: "MAIN",

    // Organization / hospital level.
    ORGANIZATION_ADMIN: "MAIN",
    ORGANIZATION_AUDITOR: "MAIN",
    HOSPITAL_ADMIN: "MAIN",
    HOSPITAL_AUDITOR: "MAIN",
    BRANCH_MANAGER: "MAIN",

    // Clinical + front desk: co-located on the main campus.
    DOCTOR: "MAIN",
    CONSULTANT: "MAIN",
    NURSE: "MAIN",
    NURSE_MANAGER: "MAIN",
    RECEPTIONIST: "MAIN",
    FRONT_DESK_MANAGER: "MAIN",
    EMERGENCY_DOCTOR: "MAIN",
    EMERGENCY_NURSE: "MAIN",
    OT_NURSE: "MAIN",
    OT_MANAGER: "MAIN",

    // Diagnostics.
    LAB_TECHNICIAN: "MAIN",
    LAB_SUPERVISOR: "MAIN",
    RADIOLOGY_TECHNICIAN: "MAIN",
    RADIOLOGIST: "MAIN",

    // Satellite campuses.
    PHARMACIST: "SALT_LAKE",
    PHARMACY_MANAGER: "SALT_LAKE",
    CASHIER: "SALT_LAKE",
    BILLING_OFFICER: "SALT_LAKE",
    BILLING_MANAGER: "SALT_LAKE",
    FINANCE_MANAGER: "MAIN",
    STOREKEEPER: "NEW_TOWN",
    INVENTORY_MANAGER: "NEW_TOWN",
    PROCUREMENT_OFFICER: "NEW_TOWN",
    PROCUREMENT_MANAGER: "MAIN",
    HR_OFFICER: "MAIN",
    HR_MANAGER: "MAIN",
    BLOOD_BANK_TECHNICIAN: "MAIN",
    BLOOD_BANK_MANAGER: "MAIN",
    INSURANCE_OFFICER: "MAIN",
};

/**
 * Resolves the Organization `organizationId` string for a campus key.
 * Unknown / unmapped roles default to the main campus.
 */
export function resolveCampusOrganizationId(roleName: string): string {
    return CAMPUS_ORGANIZATION_ID[resolveDemoCampus(roleName)];
}

export function resolveDemoCampus(roleName: string): "MAIN" | "SALT_LAKE" | "NEW_TOWN" {
    return DEMO_CAMPUS_BY_ROLE[roleName] ?? "MAIN";
}

const CAMPUS_ORGANIZATION_ID: Record<"MAIN" | "SALT_LAKE" | "NEW_TOWN", string> = {
    MAIN: "MEDISTRA-MAIN",
    SALT_LAKE: "MEDISTRA-SL-01",
    NEW_TOWN: "MEDISTRA-NT-02",
};

export interface CampusDocuments {
    main: Types.ObjectId;
    saltLake: Types.ObjectId;
    newTown: Types.ObjectId;
}

export function campusIdFor(campus: "MAIN" | "SALT_LAKE" | "NEW_TOWN", campuses: CampusDocuments): Types.ObjectId {
    if (campus === "SALT_LAKE") return campuses.saltLake;
    if (campus === "NEW_TOWN") return campuses.newTown;
    return campuses.main;
}

/**
 * Derives the tenant organization for a user assigned to `branch`.
 * A branch document that declares a `headQuarter` belongs to that
 * organization; the main campus is its own organization.
 */
export function resolveOrganizationForBranch(
    branchId: Types.ObjectId,
    campuses: CampusDocuments
): Types.ObjectId {
    if (branchId.equals(campuses.main)) return campuses.main;
    if (branchId.equals(campuses.saltLake)) return campuses.main;
    if (branchId.equals(campuses.newTown)) return campuses.main;
    return branchId;
}

/**
 * Backfills `branchId` / `organizationId` on Doctor and Staff documents from
 * their linked User.
 *
 * Required because those two collections previously carried no branch
 * reference at all, which made BRANCH-scoped roster queries impossible to
 * express. Idempotent: rows that already carry a matching value are skipped.
 */
export async function backfillProfileBranchScope(): Promise<{ doctors: number; staff: number }> {
    const userIds = await User.find({ branch: { $exists: true, $ne: null } })
        .select("_id branch organization")
        .lean();

    const byUser = new Map<string, { branchId: Types.ObjectId; organizationId?: Types.ObjectId }>();
    for (const user of userIds) {
        const branchId = new Types.ObjectId((user.branch as Types.ObjectId).toString());
        const organizationId = user.organization
            ? new Types.ObjectId((user.organization as Types.ObjectId).toString())
            : undefined;
        byUser.set(user._id.toString(), { branchId, organizationId });
    }

    const applyScope = async (Model: typeof Doctor | typeof Staff) => {
        const docs = await Model.find({ $or: [{ branchId: { $exists: false } }, { branchId: null }] })
            .select("_id userId branchId organizationId")
            .lean();

        const operations = docs
            .map((doc) => {
                const scope = byUser.get((doc.userId as Types.ObjectId).toString());
                if (!scope) return null;
                return {
                    updateOne: {
                        filter: { _id: doc._id },
                        update: {
                            $set: {
                                branchId: scope.branchId,
                                ...(scope.organizationId ? { organizationId: scope.organizationId } : {})
                            }
                        }
                    }
                };
            })
            .filter((op): op is NonNullable<typeof op> => op !== null);

        if (operations.length > 0) {
            await Model.bulkWrite(operations, { ordered: false });
        }
        return operations.length;
    };

    const [doctors, staff] = [await applyScope(Doctor), await applyScope(Staff)];
    return { doctors, staff };
}
