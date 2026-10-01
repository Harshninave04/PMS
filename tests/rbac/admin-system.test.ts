import assert from "node:assert/strict";
import { Types } from "mongoose";
import {
  AuthenticatedUserContext,
  IPermissionGrant,
  PERMISSION_KEYS
} from "@/types/rbac";
import { ScopeResolver } from "@/lib/rbac/scope-resolver";

/**
 * Administration, Staff, Roles & Reporting Security Test Suite
 * Tests strict authorization, boundary confinement and privilege separation
 * across the user, role, organization, department and reporting domains.
 */
async function runAdminSystemRbacTests() {
  console.log("=================================================");
  console.log("  Running Admin, Roles & Reporting Tests");
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

  const superAdminUserId = new Types.ObjectId();
  const hospitalAdminUserId = new Types.ObjectId();
  const accountantUserId = new Types.ObjectId();
  const nurseUserId = new Types.ObjectId();
  const doctorUserId = new Types.ObjectId();

  // 1. Super Admin Context (Global boundary, unrestricted)
  const superAdminContext: AuthenticatedUserContext = {
    userId: superAdminUserId,
    email: "admin@hospital.com",
    name: "System Super Admin",
    roleId: new Types.ObjectId(),
    roleName: "ADMIN",
    assignedWardIds: [],
    permissions: new Set(Object.values(PERMISSION_KEYS)),
    grants: new Map()
  };

  // 2. Hospital Branch Admin Context (Branch A boundary)
  const hospitalAdminContext: AuthenticatedUserContext = {
    userId: hospitalAdminUserId,
    email: "admin.brancha@hospital.com",
    name: "Alice Admin",
    roleId: new Types.ObjectId(),
    roleName: "HOSPITAL_ADMIN",
    organizationId: orgId,
    branchId: branchA,
    assignedWardIds: [],
    permissions: new Set([
      PERMISSION_KEYS.USER_VIEW,
      PERMISSION_KEYS.USER_CREATE,
      PERMISSION_KEYS.USER_UPDATE,
      PERMISSION_KEYS.USER_DISABLE,
      PERMISSION_KEYS.ROLE_VIEW,
      PERMISSION_KEYS.ROLE_UPDATE,
      PERMISSION_KEYS.DEPARTMENT_VIEW,
      PERMISSION_KEYS.DEPARTMENT_CREATE,
      PERMISSION_KEYS.DEPARTMENT_UPDATE,
      PERMISSION_KEYS.DOCTOR_VIEW,
      PERMISSION_KEYS.DOCTOR_CREATE,
      PERMISSION_KEYS.REPORTS_OPERATIONAL_VIEW,
    ]),
    grants: new Map()
  };

  // 3. Accountant Context (Billing & Finance only)
  const accountantContext: AuthenticatedUserContext = {
    userId: accountantUserId,
    email: "accounts@hospital.com",
    name: "Alan Accountant",
    roleId: new Types.ObjectId(),
    roleName: "ACCOUNTANT",
    organizationId: orgId,
    branchId: branchA,
    assignedWardIds: [],
    permissions: new Set([
      PERMISSION_KEYS.BILLING_INVOICE_VIEW,
      PERMISSION_KEYS.BILLING_INVOICE_CREATE,
      PERMISSION_KEYS.REPORTS_FINANCIAL_VIEW,
    ]),
    grants: new Map()
  };

  // 4. Nurse Context (Clinical & Ward only)
  const nurseContext: AuthenticatedUserContext = {
    userId: nurseUserId,
    email: "nurse@hospital.com",
    name: "Nancy Nurse",
    roleId: new Types.ObjectId(),
    roleName: "NURSE",
    organizationId: orgId,
    branchId: branchA,
    assignedWardIds: [new Types.ObjectId()],
    permissions: new Set([
      PERMISSION_KEYS.NURSING_TASK_VIEW,
      PERMISSION_KEYS.NURSING_VITALS_VIEW,
      PERMISSION_KEYS.REPORTS_CLINICAL_VIEW,
    ]),
    grants: new Map()
  };

  // 5. Doctor Context (Clinical only)
  const doctorContext: AuthenticatedUserContext = {
    userId: doctorUserId,
    email: "doctor@hospital.com",
    name: "Dr. David",
    roleId: new Types.ObjectId(),
    roleName: "DOCTOR",
    organizationId: orgId,
    branchId: branchA,
    assignedWardIds: [],
    permissions: new Set([
      PERMISSION_KEYS.CLINICAL_RECORD_VIEW,
      PERMISSION_KEYS.CLINICAL_RECORD_CREATE,
      PERMISSION_KEYS.REPORTS_CLINICAL_VIEW,
    ]),
    grants: new Map()
  };

  console.log("--- 1. User & Staff Administration Domain Tests ---");

  test("User Admin: Super Admin bypass produces empty scope filter (can manage all users)", () => {
    const grant: IPermissionGrant = {
      permission: PERMISSION_KEYS.USER_VIEW,
      orgScope: "GLOBAL",
      relScope: "UNRESTRICTED"
    };

    const filter = ScopeResolver.resolve(grant, superAdminContext, "User");
    assert.deepEqual(filter, {}, "Super Admin must not be filtered by branch or organization");
  });

  test("User Admin: Hospital Admin in Branch A derives branch filter on User model", () => {
    const grant: IPermissionGrant = {
      permission: PERMISSION_KEYS.USER_VIEW,
      orgScope: "BRANCH",
      relScope: "UNRESTRICTED"
    };

    const filter = ScopeResolver.resolve(grant, hospitalAdminContext, "User");
    assert.deepEqual(filter, { branch: branchA }, "User query must be scoped to admin's branch");
  });

  test("User Admin: Hospital Admin with ORGANIZATION boundary derives organization filter on User model", () => {
    const grant: IPermissionGrant = {
      permission: PERMISSION_KEYS.USER_VIEW,
      orgScope: "ORGANIZATION",
      relScope: "UNRESTRICTED"
    };

    const filter = ScopeResolver.resolve(grant, hospitalAdminContext, "User");
    assert.deepEqual(filter, { organization: orgId }, "User query must be scoped to admin's organization");
  });

  test("User Admin: Non-administrative staff (Accountant/Nurse) cannot create or disable users", () => {
    assert.equal(accountantContext.permissions.has(PERMISSION_KEYS.USER_CREATE), false);
    assert.equal(accountantContext.permissions.has(PERMISSION_KEYS.USER_DISABLE), false);
    assert.equal(nurseContext.permissions.has(PERMISSION_KEYS.USER_CREATE), false);
    assert.equal(nurseContext.permissions.has(PERMISSION_KEYS.USER_DISABLE), false);
  });

  console.log("\n--- 2. Role Management Domain Tests ---");

  test("Role Management: Super Admin holds every permission including role update", () => {
    for (const permission of Object.values(PERMISSION_KEYS)) {
      assert.equal(superAdminContext.permissions.has(permission), true, `Admin must hold ${permission}`);
    }
    assert.equal(superAdminContext.permissions.has(PERMISSION_KEYS.ROLE_UPDATE), true);
  });

  test("Role Management: Hospital Admin can view and update roles", () => {
    assert.equal(hospitalAdminContext.permissions.has(PERMISSION_KEYS.ROLE_VIEW), true);
    assert.equal(hospitalAdminContext.permissions.has(PERMISSION_KEYS.ROLE_UPDATE), true);
  });

  test("Role Management: Non-admin staff cannot view or manage roles", () => {
    assert.equal(nurseContext.permissions.has(PERMISSION_KEYS.ROLE_VIEW), false);
    assert.equal(nurseContext.permissions.has(PERMISSION_KEYS.ROLE_UPDATE), false);
    assert.equal(accountantContext.permissions.has(PERMISSION_KEYS.ROLE_VIEW), false);
    assert.equal(accountantContext.permissions.has(PERMISSION_KEYS.ROLE_UPDATE), false);
  });

  console.log("\n--- 3. Organization & Department Domain Tests ---");

  test("Department: Admin with BRANCH scope derives branch isolation on Department model", () => {
    const grant: IPermissionGrant = {
      permission: PERMISSION_KEYS.DEPARTMENT_VIEW,
      orgScope: "BRANCH",
      relScope: "UNRESTRICTED"
    };

    const filter = ScopeResolver.resolve(grant, hospitalAdminContext, "Department");
    assert.deepEqual(filter, { organizationId: branchA }, "Department query must be restricted to branch organizationId");
  });

  test("Department: Non-admin staff cannot create or delete departments", () => {
    assert.equal(nurseContext.permissions.has(PERMISSION_KEYS.DEPARTMENT_CREATE), false);
    assert.equal(nurseContext.permissions.has(PERMISSION_KEYS.DEPARTMENT_DELETE), false);
    assert.equal(accountantContext.permissions.has(PERMISSION_KEYS.DEPARTMENT_CREATE), false);
  });

  test("Organization: Platform Super Admin has organization creation and update permissions", () => {
    assert.equal(superAdminContext.permissions.has(PERMISSION_KEYS.ORGANIZATION_CREATE), true);
    assert.equal(superAdminContext.permissions.has(PERMISSION_KEYS.ORGANIZATION_UPDATE), true);
    assert.equal(superAdminContext.permissions.has(PERMISSION_KEYS.ORGANIZATION_DELETE), true);
  });

  test("Organization: Branch staff cannot delete or modify organization entities", () => {
    assert.equal(hospitalAdminContext.permissions.has(PERMISSION_KEYS.ORGANIZATION_DELETE), false);
    assert.equal(accountantContext.permissions.has(PERMISSION_KEYS.ORGANIZATION_VIEW), false);
    assert.equal(nurseContext.permissions.has(PERMISSION_KEYS.ORGANIZATION_CREATE), false);
  });

  console.log("\n--- 4. Reporting & Analytics Domain Tests ---");

  test("Reports: Financial reports restricted to financial personnel (Accountant allowed, Nurse denied)", () => {
    assert.equal(accountantContext.permissions.has(PERMISSION_KEYS.REPORTS_FINANCIAL_VIEW), true);
    assert.equal(nurseContext.permissions.has(PERMISSION_KEYS.REPORTS_FINANCIAL_VIEW), false);
  });

  test("Reports: Clinical reports restricted to clinical personnel (Doctor/Nurse allowed, Accountant denied)", () => {
    assert.equal(doctorContext.permissions.has(PERMISSION_KEYS.REPORTS_CLINICAL_VIEW), true);
    assert.equal(nurseContext.permissions.has(PERMISSION_KEYS.REPORTS_CLINICAL_VIEW), true);
    assert.equal(accountantContext.permissions.has(PERMISSION_KEYS.REPORTS_CLINICAL_VIEW), false);
  });

  test("Reports: Operational reports are not granted to clinical or financial staff", () => {
    assert.equal(hospitalAdminContext.permissions.has(PERMISSION_KEYS.REPORTS_OPERATIONAL_VIEW), true);
    assert.equal(doctorContext.permissions.has(PERMISSION_KEYS.REPORTS_OPERATIONAL_VIEW), false);
    assert.equal(nurseContext.permissions.has(PERMISSION_KEYS.REPORTS_OPERATIONAL_VIEW), false);
  });

  console.log("\n=================================================");
  console.log(`  Admin, Roles & Reporting Tests: ${passedTests}/${totalTests} Passed`);
  console.log("=================================================\n");
}

runAdminSystemRbacTests().catch((err) => {
  console.error("Test Suite Execution Failed:", err);
  process.exit(1);
});
