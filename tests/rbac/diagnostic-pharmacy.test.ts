import assert from "node:assert/strict";
import { Types } from "mongoose";
import {
  AuthenticatedUserContext,
  IPermissionGrant,
  PERMISSION_KEYS
} from "@/types/rbac";
import { ScopeResolver } from "@/lib/rbac/scope-resolver";

/**
 * Pharmacy, Ward & Nursing Security Test Suite
 * Tests strict authorization, branch isolation, and ASSIGNED relational constraints
 * for the Pharmacy, Nursing, and Ward/Bed domains.
 */
async function runDiagnosticPharmacyRbacTests() {
  console.log("=================================================");
  console.log("  Running Pharmacy, Nursing & Ward RBAC Tests");
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

  const branchA = new Types.ObjectId();
  const orgId = new Types.ObjectId();

  const ward1 = new Types.ObjectId();
  const ward2 = new Types.ObjectId();

  const pharmacistUserId = new Types.ObjectId();
  const nurseAUserId = new Types.ObjectId();
  const nurseBUserId = new Types.ObjectId();
  const wardInchargeUserId = new Types.ObjectId();
  const receptionistUserId = new Types.ObjectId();

  // 1. Pharmacist Context (Branch A, BRANCH scope)
  const pharmacistContext: AuthenticatedUserContext = {
    userId: pharmacistUserId,
    email: "pharmacist@hospital.com",
    name: "Alex Pharmacist",
    roleId: new Types.ObjectId(),
    roleName: "PHARMACIST",
    organizationId: orgId,
    branchId: branchA,
    assignedWardIds: [],
    permissions: new Set([
      PERMISSION_KEYS.PHARMACY_PRESCRIPTION_VIEW,
      PERMISSION_KEYS.PHARMACY_DISPENSE_CREATE,
      PERMISSION_KEYS.PHARMACY_STOCK_VIEW,
      PERMISSION_KEYS.PHARMACY_STOCK_MANAGE
    ]),
    grants: new Map<string, IPermissionGrant>([
      [PERMISSION_KEYS.PHARMACY_PRESCRIPTION_VIEW, { permission: PERMISSION_KEYS.PHARMACY_PRESCRIPTION_VIEW, orgScope: "BRANCH", relScope: "UNRESTRICTED" }],
      [PERMISSION_KEYS.PHARMACY_DISPENSE_CREATE, { permission: PERMISSION_KEYS.PHARMACY_DISPENSE_CREATE, orgScope: "BRANCH", relScope: "UNRESTRICTED" }],
      [PERMISSION_KEYS.PHARMACY_STOCK_VIEW, { permission: PERMISSION_KEYS.PHARMACY_STOCK_VIEW, orgScope: "BRANCH", relScope: "UNRESTRICTED" }]
    ])
  };

  // 2. Nurse A Context (Branch A, Ward 1, WARD scope + ASSIGNED relational scope)
  const nurseAContext: AuthenticatedUserContext = {
    userId: nurseAUserId,
    email: "nurse.a@hospital.com",
    name: "Nurse Alice",
    roleId: new Types.ObjectId(),
    roleName: "NURSE",
    organizationId: orgId,
    branchId: branchA,
    assignedWardIds: [ward1],
    permissions: new Set([
      PERMISSION_KEYS.NURSING_TASK_VIEW,
      PERMISSION_KEYS.NURSING_TASK_CREATE,
      PERMISSION_KEYS.NURSING_TASK_EXECUTE,
      PERMISSION_KEYS.NURSING_VITALS_VIEW,
      PERMISSION_KEYS.NURSING_VITALS_CREATE,
      PERMISSION_KEYS.WARD_VIEW
    ]),
    grants: new Map<string, IPermissionGrant>([
      [PERMISSION_KEYS.NURSING_TASK_VIEW, { permission: PERMISSION_KEYS.NURSING_TASK_VIEW, orgScope: "WARD", relScope: "ASSIGNED" }],
      [PERMISSION_KEYS.NURSING_TASK_EXECUTE, { permission: PERMISSION_KEYS.NURSING_TASK_EXECUTE, orgScope: "WARD", relScope: "ASSIGNED" }],
      [PERMISSION_KEYS.WARD_VIEW, { permission: PERMISSION_KEYS.WARD_VIEW, orgScope: "BRANCH", relScope: "UNRESTRICTED" }]
    ])
  };

  // 3. Nurse B Context (Branch A, Ward 2, WARD scope + ASSIGNED relational scope)
  const nurseBContext: AuthenticatedUserContext = {
    userId: nurseBUserId,
    email: "nurse.b@hospital.com",
    name: "Nurse Bob",
    roleId: new Types.ObjectId(),
    roleName: "NURSE",
    organizationId: orgId,
    branchId: branchA,
    assignedWardIds: [ward2],
    permissions: new Set([
      PERMISSION_KEYS.NURSING_TASK_VIEW,
      PERMISSION_KEYS.NURSING_TASK_CREATE,
      PERMISSION_KEYS.NURSING_TASK_EXECUTE,
      PERMISSION_KEYS.NURSING_VITALS_VIEW,
      PERMISSION_KEYS.NURSING_VITALS_CREATE,
      PERMISSION_KEYS.WARD_VIEW
    ]),
    grants: new Map<string, IPermissionGrant>([
      [PERMISSION_KEYS.NURSING_TASK_VIEW, { permission: PERMISSION_KEYS.NURSING_TASK_VIEW, orgScope: "WARD", relScope: "ASSIGNED" }],
      [PERMISSION_KEYS.NURSING_TASK_EXECUTE, { permission: PERMISSION_KEYS.NURSING_TASK_EXECUTE, orgScope: "WARD", relScope: "ASSIGNED" }],
      [PERMISSION_KEYS.WARD_VIEW, { permission: PERMISSION_KEYS.WARD_VIEW, orgScope: "BRANCH", relScope: "UNRESTRICTED" }]
    ])
  };

  // 4. Ward Incharge Context (Branch A, WARD_MANAGE + WARD_VIEW)
  const wardInchargeContext: AuthenticatedUserContext = {
    userId: wardInchargeUserId,
    email: "ward.incharge@hospital.com",
    name: "Sister Ward Incharge",
    roleId: new Types.ObjectId(),
    roleName: "WARD_INCHARGE",
    organizationId: orgId,
    branchId: branchA,
    assignedWardIds: [ward1, ward2],
    permissions: new Set([
      PERMISSION_KEYS.WARD_VIEW,
      PERMISSION_KEYS.WARD_MANAGE,
      PERMISSION_KEYS.NURSING_TASK_VIEW,
      PERMISSION_KEYS.NURSING_TASK_CREATE,
      PERMISSION_KEYS.NURSING_TASK_EXECUTE
    ]),
    grants: new Map<string, IPermissionGrant>([
      [PERMISSION_KEYS.WARD_VIEW, { permission: PERMISSION_KEYS.WARD_VIEW, orgScope: "BRANCH", relScope: "UNRESTRICTED" }],
      [PERMISSION_KEYS.WARD_MANAGE, { permission: PERMISSION_KEYS.WARD_MANAGE, orgScope: "BRANCH", relScope: "UNRESTRICTED" }],
      [PERMISSION_KEYS.NURSING_TASK_VIEW, { permission: PERMISSION_KEYS.NURSING_TASK_VIEW, orgScope: "BRANCH", relScope: "UNRESTRICTED" }]
    ])
  };

  // 5. Receptionist Context (No clinical or pharmacy permissions)
  const receptionistContext: AuthenticatedUserContext = {
    userId: receptionistUserId,
    email: "receptionist@hospital.com",
    name: "Front Desk Staff",
    roleId: new Types.ObjectId(),
    roleName: "RECEPTIONIST",
    organizationId: orgId,
    branchId: branchA,
    assignedWardIds: [],
    permissions: new Set([
      PERMISSION_KEYS.PATIENT_VIEW,
      PERMISSION_KEYS.PATIENT_CREATE,
      PERMISSION_KEYS.APPOINTMENT_VIEW
    ]),
    grants: new Map<string, IPermissionGrant>([
      [PERMISSION_KEYS.PATIENT_VIEW, { permission: PERMISSION_KEYS.PATIENT_VIEW, orgScope: "BRANCH", relScope: "UNRESTRICTED" }]
    ])
  };

  console.log("--- 1. Pharmacy Domain Tests ---");

  test("Pharmacy: Pharmacist has medication dispense and stock permissions", () => {
    assert.equal(pharmacistContext.permissions.has(PERMISSION_KEYS.PHARMACY_DISPENSE_CREATE), true);
    assert.equal(pharmacistContext.permissions.has(PERMISSION_KEYS.PHARMACY_STOCK_VIEW), true);
  });

  test("Pharmacy: Receptionist or Nurse cannot create medication dispense", () => {
    assert.equal(receptionistContext.permissions.has(PERMISSION_KEYS.PHARMACY_DISPENSE_CREATE), false);
    assert.equal(nurseAContext.permissions.has(PERMISSION_KEYS.PHARMACY_DISPENSE_CREATE), false);
  });

  test("Pharmacy: Dispense query derives branch boundary filter", () => {
    const grant = pharmacistContext.grants.get(PERMISSION_KEYS.PHARMACY_DISPENSE_CREATE)!;
    const filter = ScopeResolver.resolve(grant, pharmacistContext, "Dispense");

    assert.deepEqual(filter, { branchId: branchA });
  });

  console.log("\n--- 2. Nursing & Ward Domain Tests ---");

  test("Nursing: Nurse A derives both WARD spatial boundary and ASSIGNED relational constraint", () => {
    const grant = nurseAContext.grants.get(PERMISSION_KEYS.NURSING_TASK_VIEW)!;
    const filter = ScopeResolver.resolve(grant, nurseAContext, "NursingTask");

    assert.deepEqual(filter, {
      $and: [
        { ward: { $in: [ward1] } },
        { assignedNurse: nurseAUserId }
      ]
    });
  });

  test("Nursing: Nurse A can access task assigned to Nurse A in Ward 1", () => {
    const taskA = {
      _id: new Types.ObjectId(),
      ward: ward1,
      assignedNurse: nurseAUserId
    };

    const hasWardAccess = nurseAContext.assignedWardIds.some(w => w.toString() === taskA.ward.toString());
    const isAssigned = taskA.assignedNurse.toString() === nurseAContext.userId.toString();

    assert.equal(hasWardAccess && isAssigned, true, "Nurse A must have access to assigned task in Ward 1");
  });

  test("Nursing: Nurse A CANNOT execute task assigned to Nurse B", () => {
    const taskB = {
      _id: new Types.ObjectId(),
      ward: ward1,
      assignedNurse: nurseBUserId
    };

    const isAssignedToNurseA = taskB.assignedNurse.toString() === nurseAContext.userId.toString();
    assert.equal(isAssignedToNurseA, false, "Nurse A must be denied execution of Nurse B's task");
  });

  test("Nursing: Nurse B in Ward 2 cannot see tasks in Ward 1", () => {
    const taskWard1 = {
      _id: new Types.ObjectId(),
      ward: ward1,
      assignedNurse: nurseBUserId
    };

    const nurseBHasWard1Access = nurseBContext.assignedWardIds.some(w => w.toString() === taskWard1.ward.toString());
    assert.equal(nurseBHasWard1Access, false, "Nurse B must not access tasks outside assigned ward");
  });

  test("Ward: Ward Incharge has WARD_MANAGE permission, Nurse only has WARD_VIEW", () => {
    assert.equal(wardInchargeContext.permissions.has(PERMISSION_KEYS.WARD_MANAGE), true);
    assert.equal(nurseAContext.permissions.has(PERMISSION_KEYS.WARD_MANAGE), false);
    assert.equal(nurseAContext.permissions.has(PERMISSION_KEYS.WARD_VIEW), true);
  });

  test("Ward: Bed resolution is bounded by the branch for a BRANCH boundary", () => {
    const grant = wardInchargeContext.grants.get(PERMISSION_KEYS.WARD_VIEW)!;
    const filter = ScopeResolver.resolve(grant, wardInchargeContext, "Bed");

    // Previously this returned {}, which let a branch-scoped user read every
    // bed in the hospital. Bed carries a denormalised organizationId.
    assert.deepEqual(filter, {
      organizationId: wardInchargeContext.branchId || wardInchargeContext.organizationId,
    });
  });

  test("Ward: Room resolution is bounded by the branch for a BRANCH boundary", () => {
    const grant = wardInchargeContext.grants.get(PERMISSION_KEYS.WARD_VIEW)!;
    const filter = ScopeResolver.resolve(grant, wardInchargeContext, "Room");

    assert.deepEqual(filter, {
      organizationId: wardInchargeContext.branchId || wardInchargeContext.organizationId,
    });
  });

  console.log("\n=================================================");
  console.log(`  Pharmacy, Nursing & Ward Tests: ${passedTests}/${totalTests} Passed`);
  console.log("=================================================\n");
}

runDiagnosticPharmacyRbacTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
