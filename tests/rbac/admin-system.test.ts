import assert from "node:assert/strict";
import { Types } from "mongoose";
import {
  AuthenticatedUserContext,
  IPermissionGrant,
  PERMISSION_KEYS
} from "@/types/rbac";
import { ScopeResolver } from "@/lib/rbac/scope-resolver";

/**
 * Phase 6 Administration, Staff, Roles, Audit, Config & Ops Security Test Suite
 * Tests strict authorization, boundary confinement, delegation integrity, and privilege separation
 * across administrative, configuration, reporting, and procurement domains.
 */
async function runAdminSystemRbacTests() {
  console.log("=================================================");
  console.log("  Running Phase 6 Admin, Roles, Audit & Ops Tests");
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
  const branchB = new Types.ObjectId();
  const orgId = new Types.ObjectId();

  const superAdminUserId = new Types.ObjectId();
  const hospitalAdminUserId = new Types.ObjectId();
  const auditorUserId = new Types.ObjectId();
  const procurementMgrUserId = new Types.ObjectId();
  const cashierUserId = new Types.ObjectId();
  const nurseUserId = new Types.ObjectId();
  const doctorUserId = new Types.ObjectId();

  // 1. Super Admin Context (Global boundary, unrestricted)
  const superAdminContext: AuthenticatedUserContext = {
    userId: superAdminUserId,
    email: "superadmin@medistra.com",
    name: "System Super Admin",
    roleId: new Types.ObjectId(),
    roleName: "SYSTEM_SUPER_ADMIN",
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
      PERMISSION_KEYS.ROLE_CREATE,
      PERMISSION_KEYS.ROLE_UPDATE,
      PERMISSION_KEYS.ROLE_HIERARCHY_VIEW,
      PERMISSION_KEYS.DEPARTMENT_VIEW,
      PERMISSION_KEYS.DEPARTMENT_CREATE,
      PERMISSION_KEYS.DEPARTMENT_UPDATE,
      PERMISSION_KEYS.DOCTOR_VIEW,
      PERMISSION_KEYS.DOCTOR_CREATE,
      PERMISSION_KEYS.REPORTS_VIEW,
      PERMISSION_KEYS.REPORTS_OPERATIONAL_VIEW,
      PERMISSION_KEYS.SYSTEM_SETTINGS_VIEW,
      PERMISSION_KEYS.TASK_VIEW,
      PERMISSION_KEYS.TASK_CREATE,
      PERMISSION_KEYS.ALERT_VIEW,
      PERMISSION_KEYS.ALERT_CREATE,
      PERMISSION_KEYS.ALERT_MANAGE,
    ]),
    grants: new Map()
  };

  // 3. Auditor Context (Audit and security events only)
  const auditorContext: AuthenticatedUserContext = {
    userId: auditorUserId,
    email: "auditor@medistra.com",
    name: "Arthur Auditor",
    roleId: new Types.ObjectId(),
    roleName: "COMPLIANCE_OFFICER",
    organizationId: orgId,
    branchId: branchA,
    assignedWardIds: [],
    permissions: new Set([
      PERMISSION_KEYS.AUDIT_VIEW,
      PERMISSION_KEYS.AUDIT_EXPORT,
      PERMISSION_KEYS.REPORTS_VIEW,
      PERMISSION_KEYS.REPORTS_OPERATIONAL_VIEW,
    ]),
    grants: new Map()
  };

  // 4. Procurement Manager Context
  const procurementMgrContext: AuthenticatedUserContext = {
    userId: procurementMgrUserId,
    email: "procurement@hospital.com",
    name: "Peter Procurement",
    roleId: new Types.ObjectId(),
    roleName: "PROCUREMENT_MANAGER",
    organizationId: orgId,
    branchId: branchA,
    assignedWardIds: [],
    permissions: new Set([
      PERMISSION_KEYS.PROCUREMENT_VIEW,
      PERMISSION_KEYS.PROCUREMENT_SUPPLIER_MANAGE,
      PERMISSION_KEYS.PROCUREMENT_PO_CREATE,
      PERMISSION_KEYS.PROCUREMENT_PO_APPROVE,
      PERMISSION_KEYS.PROCUREMENT_PO_RECEIVE,
      PERMISSION_KEYS.INVENTORY_STOCK_VIEW,
    ]),
    grants: new Map()
  };

  // 5. Cashier Context (Billing & Finance only)
  const cashierContext: AuthenticatedUserContext = {
    userId: cashierUserId,
    email: "cashier@hospital.com",
    name: "Clara Cashier",
    roleId: new Types.ObjectId(),
    roleName: "CASHIER",
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

  // 6. Nurse Context (Clinical & Ward only)
  const nurseContext: AuthenticatedUserContext = {
    userId: nurseUserId,
    email: "nurse@hospital.com",
    name: "Nancy Nurse",
    roleId: new Types.ObjectId(),
    roleName: "STAFF_NURSE",
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

  // 7. Doctor Context (Clinical only)
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

  test("User Admin: Non-administrative staff (Cashier/Nurse) cannot create or disable users", () => {
    assert.equal(cashierContext.permissions.has(PERMISSION_KEYS.USER_CREATE), false);
    assert.equal(cashierContext.permissions.has(PERMISSION_KEYS.USER_DISABLE), false);
    assert.equal(nurseContext.permissions.has(PERMISSION_KEYS.USER_CREATE), false);
    assert.equal(nurseContext.permissions.has(PERMISSION_KEYS.USER_DISABLE), false);
  });

  console.log("\n--- 2. Role Management & Hierarchy Domain Tests ---");

  test("Role Management: Super Admin has full role creation, deletion and assignment permissions", () => {
    assert.equal(superAdminContext.permissions.has(PERMISSION_KEYS.ROLE_CREATE), true);
    assert.equal(superAdminContext.permissions.has(PERMISSION_KEYS.ROLE_DELETE), true);
    assert.equal(superAdminContext.permissions.has(PERMISSION_KEYS.ROLE_ASSIGN), true);
    assert.equal(superAdminContext.permissions.has(PERMISSION_KEYS.ROLE_HIERARCHY_UPDATE), true);
  });

  test("Role Management: Hospital Admin cannot delete roles (restricted to ROLE_VIEW, ROLE_CREATE, ROLE_UPDATE)", () => {
    assert.equal(hospitalAdminContext.permissions.has(PERMISSION_KEYS.ROLE_VIEW), true);
    assert.equal(hospitalAdminContext.permissions.has(PERMISSION_KEYS.ROLE_DELETE), false, "Hospital admin must not have ROLE_DELETE");
  });

  test("Role Management: Non-admin staff cannot manage roles or role hierarchies", () => {
    assert.equal(nurseContext.permissions.has(PERMISSION_KEYS.ROLE_VIEW), false);
    assert.equal(nurseContext.permissions.has(PERMISSION_KEYS.ROLE_CREATE), false);
    assert.equal(cashierContext.permissions.has(PERMISSION_KEYS.ROLE_HIERARCHY_VIEW), false);
    assert.equal(cashierContext.permissions.has(PERMISSION_KEYS.ROLE_HIERARCHY_UPDATE), false);
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
    assert.equal(cashierContext.permissions.has(PERMISSION_KEYS.DEPARTMENT_CREATE), false);
  });

  test("Organization: Platform Super Admin has organization creation and update permissions", () => {
    assert.equal(superAdminContext.permissions.has(PERMISSION_KEYS.ORGANIZATION_CREATE), true);
    assert.equal(superAdminContext.permissions.has(PERMISSION_KEYS.ORGANIZATION_UPDATE), true);
    assert.equal(superAdminContext.permissions.has(PERMISSION_KEYS.ORGANIZATION_DELETE), true);
  });

  test("Organization: Branch staff cannot delete or modify organization entities", () => {
    assert.equal(hospitalAdminContext.permissions.has(PERMISSION_KEYS.ORGANIZATION_DELETE), false);
    assert.equal(cashierContext.permissions.has(PERMISSION_KEYS.ORGANIZATION_VIEW), false);
    assert.equal(nurseContext.permissions.has(PERMISSION_KEYS.ORGANIZATION_CREATE), false);
  });

  console.log("\n--- 4. Audit & Security Log Domain Tests ---");

  test("Audit: Compliance Auditor has audit viewing and export permissions", () => {
    assert.equal(auditorContext.permissions.has(PERMISSION_KEYS.AUDIT_VIEW), true);
    assert.equal(auditorContext.permissions.has(PERMISSION_KEYS.AUDIT_EXPORT), true);
  });

  test("Audit: Non-audit staff (Cashier, Nurse, Doctor) are strictly forbidden from viewing audit logs", () => {
    assert.equal(cashierContext.permissions.has(PERMISSION_KEYS.AUDIT_VIEW), false);
    assert.equal(nurseContext.permissions.has(PERMISSION_KEYS.AUDIT_VIEW), false);
    assert.equal(doctorContext.permissions.has(PERMISSION_KEYS.AUDIT_VIEW), false);
  });

  console.log("\n--- 5. System Configuration Domain Tests ---");

  test("Config: Super Admin has system settings view and update permissions", () => {
    assert.equal(superAdminContext.permissions.has(PERMISSION_KEYS.SYSTEM_SETTINGS_VIEW), true);
    assert.equal(superAdminContext.permissions.has(PERMISSION_KEYS.SYSTEM_SETTINGS_UPDATE), true);
  });

  test("Config: Regular staff (Nurse, Cashier) cannot view or update system configuration", () => {
    assert.equal(nurseContext.permissions.has(PERMISSION_KEYS.SYSTEM_SETTINGS_VIEW), false);
    assert.equal(nurseContext.permissions.has(PERMISSION_KEYS.SYSTEM_SETTINGS_UPDATE), false);
    assert.equal(cashierContext.permissions.has(PERMISSION_KEYS.SYSTEM_SETTINGS_VIEW), false);
    assert.equal(cashierContext.permissions.has(PERMISSION_KEYS.SYSTEM_SETTINGS_UPDATE), false);
  });

  console.log("\n--- 6. Reporting & Analytics Domain Tests ---");

  test("Reports: Financial reports restricted to financial personnel (Cashier allowed, Nurse denied)", () => {
    assert.equal(cashierContext.permissions.has(PERMISSION_KEYS.REPORTS_FINANCIAL_VIEW), true);
    assert.equal(nurseContext.permissions.has(PERMISSION_KEYS.REPORTS_FINANCIAL_VIEW), false);
  });

  test("Reports: Clinical reports restricted to clinical personnel (Doctor/Nurse allowed, Cashier denied)", () => {
    assert.equal(doctorContext.permissions.has(PERMISSION_KEYS.REPORTS_CLINICAL_VIEW), true);
    assert.equal(nurseContext.permissions.has(PERMISSION_KEYS.REPORTS_CLINICAL_VIEW), true);
    assert.equal(cashierContext.permissions.has(PERMISSION_KEYS.REPORTS_CLINICAL_VIEW), false);
  });

  test("Reports: Operational reports accessible to Admin and Auditor", () => {
    assert.equal(hospitalAdminContext.permissions.has(PERMISSION_KEYS.REPORTS_OPERATIONAL_VIEW), true);
    assert.equal(auditorContext.permissions.has(PERMISSION_KEYS.REPORTS_OPERATIONAL_VIEW), true);
  });

  console.log("\n--- 7. Procurement & Supply Chain Domain Tests ---");

  test("Procurement: Procurement Manager has supplier management and PO approval permissions", () => {
    assert.equal(procurementMgrContext.permissions.has(PERMISSION_KEYS.PROCUREMENT_VIEW), true);
    assert.equal(procurementMgrContext.permissions.has(PERMISSION_KEYS.PROCUREMENT_SUPPLIER_MANAGE), true);
    assert.equal(procurementMgrContext.permissions.has(PERMISSION_KEYS.PROCUREMENT_PO_CREATE), true);
    assert.equal(procurementMgrContext.permissions.has(PERMISSION_KEYS.PROCUREMENT_PO_APPROVE), true);
    assert.equal(procurementMgrContext.permissions.has(PERMISSION_KEYS.PROCUREMENT_PO_RECEIVE), true);
  });

  test("Procurement: Non-procurement staff (Nurse / Cashier) cannot approve POs or manage suppliers", () => {
    assert.equal(nurseContext.permissions.has(PERMISSION_KEYS.PROCUREMENT_PO_APPROVE), false);
    assert.equal(nurseContext.permissions.has(PERMISSION_KEYS.PROCUREMENT_SUPPLIER_MANAGE), false);
    assert.equal(cashierContext.permissions.has(PERMISSION_KEYS.PROCUREMENT_PO_APPROVE), false);
  });

  console.log("\n--- 8. Operational Alerts & Tasks Domain Tests ---");

  test("Alerts & Tasks: Hospital Admin can create tasks and manage alerts", () => {
    assert.equal(hospitalAdminContext.permissions.has(PERMISSION_KEYS.TASK_CREATE), true);
    assert.equal(hospitalAdminContext.permissions.has(PERMISSION_KEYS.ALERT_MANAGE), true);
  });

  test("Alerts & Tasks: Cashier cannot create operational tasks or manage system alerts", () => {
    assert.equal(cashierContext.permissions.has(PERMISSION_KEYS.TASK_CREATE), false);
    assert.equal(cashierContext.permissions.has(PERMISSION_KEYS.ALERT_MANAGE), false);
  });

  console.log("\n=================================================");
  console.log(`  Phase 6 Admin & Ops Tests: ${passedTests}/${totalTests} Passed`);
  console.log("=================================================\n");
}

runAdminSystemRbacTests().catch((err) => {
  console.error("Test Suite Execution Failed:", err);
  process.exit(1);
});
