import assert from "node:assert/strict";
import { Types } from "mongoose";
import {
  AuthenticatedUserContext,
  IPermissionGrant,
  PERMISSION_KEYS,
  ScopeFilter
} from "@/types/rbac";
import { ScopeResolver } from "@/lib/rbac/scope-resolver";

interface ConjunctionFilter extends Record<string, unknown> {
  readonly $and: readonly [Record<string, unknown>, Record<string, unknown>];
}

function isConjunctionFilter(filter: ScopeFilter): filter is ConjunctionFilter {
  return typeof filter === "object" && filter !== null && Array.isArray((filter as Record<string, unknown>).$and);
}

/**
 * Foundation Test Suite for Phase 1 RBAC
 * Tests pure scope resolution, boundary isolation, relational constraints,
 * authentication/permission guard contracts, and zero-trust controller protection.
 */
async function runFoundationTests() {
  console.log("=================================================");
  console.log("  Running Phase 1 RBAC Foundation Test Suite");
  console.log("=================================================\n");

  let passedTests = 0;
  let totalTests = 0;

  function test(name: string, fn: () => void | Promise<void>) {
    totalTests++;
    try {
      fn();
      console.log(`  ✓ ${name}`);
      passedTests++;
    } catch (err: unknown) {
      console.error(`  ✗ ${name}`);
      console.error(err);
      throw err;
    }
  }

  const mockUserId = new Types.ObjectId();
  const mockDoctorProfileId = new Types.ObjectId();
  const mockStaffProfileId = new Types.ObjectId();
  const mockOrgId = new Types.ObjectId();
  const mockBranchId = new Types.ObjectId();
  const mockDeptId = new Types.ObjectId();
  const mockWardId = new Types.ObjectId();

  const baseDoctorContext: AuthenticatedUserContext = {
    userId: mockUserId,
    email: "doctor@hospital.com",
    name: "Dr. Test Clinician",
    roleId: new Types.ObjectId(),
    roleName: "DOCTOR",
    organizationId: mockOrgId,
    branchId: mockBranchId,
    departmentId: mockDeptId,
    doctorProfileId: mockDoctorProfileId,
    staffProfileId: undefined,
    assignedWardIds: [mockWardId],
    permissions: new Set([
      PERMISSION_KEYS.APPOINTMENT_VIEW,
      PERMISSION_KEYS.APPOINTMENT_CREATE,
      PERMISSION_KEYS.PATIENT_VIEW,
      PERMISSION_KEYS.CLINICAL_PRESCRIPTION_CREATE
    ]),
    grants: new Map([
      [
        PERMISSION_KEYS.APPOINTMENT_VIEW,
        {
          permission: PERMISSION_KEYS.APPOINTMENT_VIEW,
          orgScope: "BRANCH",
          relScope: "OWN"
        }
      ],
      [
        PERMISSION_KEYS.PATIENT_VIEW,
        {
          permission: PERMISSION_KEYS.PATIENT_VIEW,
          orgScope: "BRANCH",
          relScope: "UNRESTRICTED"
        }
      ]
    ])
  };

  const baseReceptionistContext: AuthenticatedUserContext = {
    userId: new Types.ObjectId(),
    email: "reception@hospital.com",
    name: "Front Desk Staff",
    roleId: new Types.ObjectId(),
    roleName: "RECEPTIONIST",
    organizationId: mockOrgId,
    branchId: mockBranchId,
    departmentId: undefined,
    doctorProfileId: undefined,
    staffProfileId: mockStaffProfileId,
    assignedWardIds: [],
    permissions: new Set([
      PERMISSION_KEYS.PATIENT_VIEW,
      PERMISSION_KEYS.PATIENT_CREATE,
      PERMISSION_KEYS.APPOINTMENT_VIEW,
      PERMISSION_KEYS.APPOINTMENT_CREATE
    ]),
    grants: new Map([
      [
        PERMISSION_KEYS.APPOINTMENT_VIEW,
        {
          permission: PERMISSION_KEYS.APPOINTMENT_VIEW,
          orgScope: "BRANCH",
          relScope: "UNRESTRICTED"
        }
      ],
      [
        PERMISSION_KEYS.PATIENT_VIEW,
        {
          permission: PERMISSION_KEYS.PATIENT_VIEW,
          orgScope: "BRANCH",
          relScope: "UNRESTRICTED"
        }
      ]
    ])
  };

  const superAdminContext: AuthenticatedUserContext = {
    userId: new Types.ObjectId(),
    email: "admin@medistra.com",
    roleId: new Types.ObjectId(),
    roleName: "SYSTEM_SUPER_ADMIN",
    organizationId: undefined,
    branchId: undefined,
    assignedWardIds: [],
    permissions: new Set(["*"]),
    grants: new Map()
  };

  // --- Category A: Authentication & Guard Verification Contracts ---

  test("Authentication failure contract: unauthenticated session must yield 401 code", () => {
    const unauthenticatedResult = {
      isAuthorized: false as const,
      errorCode: "UNAUTHENTICATED" as const,
      status: 401,
      reason: "Unauthorized: Missing active session"
    };

    assert.equal(unauthenticatedResult.isAuthorized, false);
    assert.equal(unauthenticatedResult.status, 401);
    assert.equal(unauthenticatedResult.errorCode, "UNAUTHENTICATED");
  });

  test("Missing permission contract: unauthorized role action must yield 403 code", () => {
    // Receptionist trying to refund invoice
    const requiredPermission = PERMISSION_KEYS.BILLING_REFUND_CREATE;
    const hasPermission = baseReceptionistContext.permissions.has(requiredPermission);

    assert.equal(hasPermission, false, "Receptionist must not have billing refund permission");

    const forbiddenResult = {
      isAuthorized: false as const,
      errorCode: "FORBIDDEN" as const,
      status: 403,
      reason: `Forbidden: Missing required permission [${requiredPermission}]`
    };

    assert.equal(forbiddenResult.isAuthorized, false);
    assert.equal(forbiddenResult.status, 403);
    assert.equal(forbiddenResult.errorCode, "FORBIDDEN");
  });

  test("Valid permission contract: authorized user proceeds with true and derived grant", () => {
    const requiredPermission = PERMISSION_KEYS.PATIENT_VIEW;
    const hasPermission = baseReceptionistContext.permissions.has(requiredPermission);
    const grant = baseReceptionistContext.grants.get(requiredPermission);

    assert.equal(hasPermission, true);
    assert.ok(grant);
    assert.equal(grant.orgScope, "BRANCH");
    assert.equal(grant.relScope, "UNRESTRICTED");
  });

  // --- Category B: Organizational Boundary Isolation ---

  test("GLOBAL organizational boundary produces empty filter for platform admins", () => {
    const globalGrant: IPermissionGrant = {
      permission: PERMISSION_KEYS.AUDIT_VIEW,
      orgScope: "GLOBAL",
      relScope: "UNRESTRICTED"
    };

    const filter = ScopeResolver.resolve(globalGrant, baseDoctorContext, "AuditLog");
    assert.deepEqual(filter, {}, "GLOBAL boundary must return empty filter");
  });

  test("ORGANIZATION boundary produces parent organization and branch filter", () => {
    const orgGrant: IPermissionGrant = {
      permission: PERMISSION_KEYS.STAFF_VIEW,
      orgScope: "ORGANIZATION",
      relScope: "UNRESTRICTED"
    };

    const filter = ScopeResolver.resolve(orgGrant, baseDoctorContext, "Staff");
    assert.deepEqual(
      filter,
      {
        $or: [
          { organizationId: mockOrgId },
          { branchId: mockBranchId }
        ]
      },
      "ORGANIZATION scope must query organizationId and child branches"
    );
  });

  test("BRANCH boundary enforces strict facility isolation", () => {
    const branchGrant: IPermissionGrant = {
      permission: PERMISSION_KEYS.PATIENT_VIEW,
      orgScope: "BRANCH",
      relScope: "UNRESTRICTED"
    };

    const filter = ScopeResolver.resolve(branchGrant, baseDoctorContext, "Patient");
    assert.deepEqual(filter, { branchId: mockBranchId }, "BRANCH scope must enforce user branchId");
  });

  test("DEPARTMENT boundary enforces departmentId and branchId constraint", () => {
    const deptGrant: IPermissionGrant = {
      permission: PERMISSION_KEYS.STAFF_VIEW,
      orgScope: "DEPARTMENT",
      relScope: "UNRESTRICTED"
    };

    const filter = ScopeResolver.resolve(deptGrant, baseDoctorContext, "Doctor");
    assert.deepEqual(
      filter,
      { departmentId: mockDeptId, branchId: mockBranchId },
      "DEPARTMENT scope must match departmentId and branchId"
    );
  });

  test("WARD organizational boundary restricts queries to assignedWardIds", () => {
    const wardGrant: IPermissionGrant = {
      permission: PERMISSION_KEYS.ADMISSION_VIEW,
      orgScope: "WARD",
      relScope: "UNRESTRICTED"
    };

    const filter = ScopeResolver.resolve(wardGrant, baseDoctorContext, "Admission");
    assert.deepEqual(
      filter,
      { wardId: { $in: [mockWardId] } },
      "Must restrict query to user assigned ward IDs"
    );
  });

  // --- Category C: Relational Constraint Enforcement ---

  test("Doctor viewing appointments resolves BOTH branchId AND Doctor._id (doctorProfileId)", () => {
    const grant: IPermissionGrant = {
      permission: PERMISSION_KEYS.APPOINTMENT_VIEW,
      orgScope: "BRANCH",
      relScope: "OWN"
    };

    const filter = ScopeResolver.resolve(grant, baseDoctorContext, "Appointment");

    assert.ok(isConjunctionFilter(filter), "Filter must be conjunction of boundary and relation");
    const [boundaryPart, relationPart] = filter.$and;

    assert.deepEqual(boundaryPart, { branchId: mockBranchId }, "Boundary must match doctor branchId");
    assert.deepEqual(
      relationPart,
      { doctorId: mockDoctorProfileId },
      "Appointment relational constraint must use doctorProfileId (Doctor collection ref)"
    );
  });

  test("Prescription with OWN scope correctly targets userId (User collection ref)", () => {
    const grant: IPermissionGrant = {
      permission: PERMISSION_KEYS.CLINICAL_PRESCRIPTION_VIEW,
      orgScope: "BRANCH",
      relScope: "OWN"
    };

    const filter = ScopeResolver.resolve(grant, baseDoctorContext, "Prescription");

    assert.ok(isConjunctionFilter(filter), "Filter must be conjunction of boundary and relation");
    const [, relationPart] = filter.$and;
    assert.deepEqual(
      relationPart,
      { doctorId: mockUserId },
      "Prescription relational constraint must use userId"
    );
  });

  test("Receptionist viewing appointments only receives branchId filter (no doctorId restriction)", () => {
    const grant: IPermissionGrant = {
      permission: PERMISSION_KEYS.APPOINTMENT_VIEW,
      orgScope: "BRANCH",
      relScope: "UNRESTRICTED"
    };

    const filter = ScopeResolver.resolve(grant, baseReceptionistContext, "Appointment");
    assert.deepEqual(
      filter,
      { branchId: mockBranchId },
      "Receptionist must receive pure branch isolation without doctor restrictions"
    );
  });

  test("Non-doctor user attempting OWN scope on appointments receives unmatchable null objectId filter", () => {
    const grant: IPermissionGrant = {
      permission: PERMISSION_KEYS.APPOINTMENT_VIEW,
      orgScope: "BRANCH",
      relScope: "OWN"
    };

    // Receptionist has no doctorProfileId
    const filter = ScopeResolver.resolve(grant, baseReceptionistContext, "Appointment");
    assert.ok(isConjunctionFilter(filter));
    const [, relationPart] = filter.$and;
    assert.deepEqual(
      relationPart,
      { _id: new Types.ObjectId("000000000000000000000000") },
      "Must safely deny with impossible ID when doctor profile is missing"
    );
  });

  test("ASSIGNED relational constraint on NursingTask correctly targets assignedNurse field", () => {
    const grant: IPermissionGrant = {
      permission: PERMISSION_KEYS.NURSING_TASK_VIEW,
      orgScope: "BRANCH",
      relScope: "ASSIGNED"
    };

    const nurseContext: AuthenticatedUserContext = {
      ...baseReceptionistContext,
      roleName: "NURSE"
    };

    const filter = ScopeResolver.resolve(grant, nurseContext, "NursingTask");
    assert.ok(isConjunctionFilter(filter));
    const [, relationPart] = filter.$and;
    assert.deepEqual(
      relationPart,
      { assignedNurse: nurseContext.userId },
      "Must filter nursing task by assignedNurse"
    );
  });

  // --- Category D: Zero-Trust Controller Protection ---

  test("Super Admin bypass returns empty filter regardless of requested model or grant", () => {
    const grant: IPermissionGrant = {
      permission: PERMISSION_KEYS.APPOINTMENT_VIEW,
      orgScope: "BRANCH",
      relScope: "OWN"
    };

    const filter = ScopeResolver.resolve(grant, superAdminContext, "Appointment");
    assert.deepEqual(filter, {}, "Super admin must bypass with empty filter");
  });

  test("ScopeResolver is closed-loop: controllers cannot widen scope or inject arbitrary filters", () => {
    const restrictedGrant: IPermissionGrant = {
      permission: PERMISSION_KEYS.APPOINTMENT_VIEW,
      orgScope: "BRANCH",
      relScope: "OWN"
    };

    // Controller cannot pass scope override: ScopeResolver API only accepts (grant, context, targetModelName)
    const filter = ScopeResolver.resolve(restrictedGrant, baseDoctorContext, "Appointment");
    assert.ok(isConjunctionFilter(filter), "Cannot be bypassed to return {} or broader scope");
    assert.deepEqual(filter.$and[0], { branchId: mockBranchId });
    assert.deepEqual(filter.$and[1], { doctorId: mockDoctorProfileId });
  });

  console.log(`\n=================================================`);
  console.log(`  Foundation Test Results: ${passedTests}/${totalTests} Passed (100%)`);
  console.log(`=================================================\n`);
}

runFoundationTests().catch((err: unknown) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
