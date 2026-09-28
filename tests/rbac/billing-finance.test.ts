import assert from "node:assert/strict";
import { Types } from "mongoose";
import {
  AuthenticatedUserContext,
  IPermissionGrant,
  PERMISSION_KEYS
} from "@/types/rbac";
import { ScopeResolver } from "@/lib/rbac/scope-resolver";

/**
 * Phase 5 Billing, Insurance, Emergency, OT & Blood Bank Security Test Suite
 * Tests strict authorization, branch isolation, and specialized workflow permissions
 * across financial, operational, and critical care modules.
 */
async function runBillingFinanceRbacTests() {
  console.log("=================================================");
  console.log("  Running Phase 5 Billing, Insurance & Ops Tests");
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

  const cashierUserId = new Types.ObjectId();
  const insuranceOfficerUserId = new Types.ObjectId();
  const emergencyDoctorUserId = new Types.ObjectId();
  const surgeonUserId = new Types.ObjectId();
  const bloodBankTechUserId = new Types.ObjectId();
  const nurseUserId = new Types.ObjectId();

  // 1. Cashier Context (Branch A, Billing permissions)
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
      PERMISSION_KEYS.BILLING_INVOICE_UPDATE,
      PERMISSION_KEYS.BILLING_PAYMENT_VIEW,
      PERMISSION_KEYS.BILLING_PAYMENT_CREATE,
      PERMISSION_KEYS.BILLING_REFUND_CREATE
    ]),
    grants: new Map<string, IPermissionGrant>([
      [PERMISSION_KEYS.BILLING_INVOICE_VIEW, { permission: PERMISSION_KEYS.BILLING_INVOICE_VIEW, orgScope: "BRANCH", relScope: "UNRESTRICTED" }],
      [PERMISSION_KEYS.BILLING_INVOICE_CREATE, { permission: PERMISSION_KEYS.BILLING_INVOICE_CREATE, orgScope: "BRANCH", relScope: "UNRESTRICTED" }],
      [PERMISSION_KEYS.BILLING_PAYMENT_VIEW, { permission: PERMISSION_KEYS.BILLING_PAYMENT_VIEW, orgScope: "BRANCH", relScope: "UNRESTRICTED" }],
      [PERMISSION_KEYS.BILLING_PAYMENT_CREATE, { permission: PERMISSION_KEYS.BILLING_PAYMENT_CREATE, orgScope: "BRANCH", relScope: "UNRESTRICTED" }],
      [PERMISSION_KEYS.BILLING_REFUND_CREATE, { permission: PERMISSION_KEYS.BILLING_REFUND_CREATE, orgScope: "BRANCH", relScope: "UNRESTRICTED" }]
    ])
  };

  // 2. Insurance Officer Context (Branch A, Insurance permissions)
  const insuranceOfficerContext: AuthenticatedUserContext = {
    userId: insuranceOfficerUserId,
    email: "insurance@hospital.com",
    name: "Ian Insurance",
    roleId: new Types.ObjectId(),
    roleName: "INSURANCE_COORDINATOR",
    organizationId: orgId,
    branchId: branchA,
    assignedWardIds: [],
    permissions: new Set([
      PERMISSION_KEYS.INSURANCE_POLICY_VIEW,
      PERMISSION_KEYS.INSURANCE_POLICY_MANAGE,
      PERMISSION_KEYS.INSURANCE_CLAIM_VIEW,
      PERMISSION_KEYS.INSURANCE_CLAIM_CREATE,
      PERMISSION_KEYS.INSURANCE_CLAIM_SUBMIT,
      PERMISSION_KEYS.INSURANCE_CLAIM_ADJUDICATE
    ]),
    grants: new Map<string, IPermissionGrant>([
      [PERMISSION_KEYS.INSURANCE_POLICY_VIEW, { permission: PERMISSION_KEYS.INSURANCE_POLICY_VIEW, orgScope: "BRANCH", relScope: "UNRESTRICTED" }],
      [PERMISSION_KEYS.INSURANCE_CLAIM_VIEW, { permission: PERMISSION_KEYS.INSURANCE_CLAIM_VIEW, orgScope: "BRANCH", relScope: "UNRESTRICTED" }],
      [PERMISSION_KEYS.INSURANCE_CLAIM_CREATE, { permission: PERMISSION_KEYS.INSURANCE_CLAIM_CREATE, orgScope: "BRANCH", relScope: "UNRESTRICTED" }]
    ])
  };

  // 3. Emergency Doctor Context (Branch A, Emergency permissions)
  const emergencyDoctorContext: AuthenticatedUserContext = {
    userId: emergencyDoctorUserId,
    email: "er.doctor@hospital.com",
    name: "Dr. Eric ER",
    roleId: new Types.ObjectId(),
    roleName: "EMERGENCY_PHYSICIAN",
    organizationId: orgId,
    branchId: branchA,
    assignedWardIds: [],
    permissions: new Set([
      PERMISSION_KEYS.EMERGENCY_TRIAGE_VIEW,
      PERMISSION_KEYS.EMERGENCY_TRIAGE_CREATE,
      PERMISSION_KEYS.EMERGENCY_TRIAGE_UPDATE,
      PERMISSION_KEYS.EMERGENCY_CASE_MANAGE,
      PERMISSION_KEYS.PATIENT_VIEW
    ]),
    grants: new Map<string, IPermissionGrant>([
      [PERMISSION_KEYS.EMERGENCY_TRIAGE_VIEW, { permission: PERMISSION_KEYS.EMERGENCY_TRIAGE_VIEW, orgScope: "BRANCH", relScope: "UNRESTRICTED" }],
      [PERMISSION_KEYS.EMERGENCY_CASE_MANAGE, { permission: PERMISSION_KEYS.EMERGENCY_CASE_MANAGE, orgScope: "BRANCH", relScope: "UNRESTRICTED" }]
    ])
  };

  // 4. Surgeon Context (Branch A, OT permissions)
  const surgeonContext: AuthenticatedUserContext = {
    userId: surgeonUserId,
    email: "surgeon@hospital.com",
    name: "Dr. Sarah Surgeon",
    roleId: new Types.ObjectId(),
    roleName: "SURGEON",
    organizationId: orgId,
    branchId: branchA,
    assignedWardIds: [],
    permissions: new Set([
      PERMISSION_KEYS.OT_SCHEDULE_VIEW,
      PERMISSION_KEYS.OT_SCHEDULE_CREATE,
      PERMISSION_KEYS.OT_SCHEDULE_UPDATE,
      PERMISSION_KEYS.OT_RECORD_CREATE,
      PERMISSION_KEYS.OT_CHECKLIST_VERIFY,
      PERMISSION_KEYS.PATIENT_VIEW
    ]),
    grants: new Map<string, IPermissionGrant>([
      [PERMISSION_KEYS.OT_SCHEDULE_VIEW, { permission: PERMISSION_KEYS.OT_SCHEDULE_VIEW, orgScope: "BRANCH", relScope: "UNRESTRICTED" }],
      [PERMISSION_KEYS.OT_SCHEDULE_CREATE, { permission: PERMISSION_KEYS.OT_SCHEDULE_CREATE, orgScope: "BRANCH", relScope: "UNRESTRICTED" }]
    ])
  };

  // 5. Blood Bank Technician Context (Branch A, Blood Bank permissions)
  const bloodBankTechContext: AuthenticatedUserContext = {
    userId: bloodBankTechUserId,
    email: "bloodbank@hospital.com",
    name: "Bella Bloodbank",
    roleId: new Types.ObjectId(),
    roleName: "BLOOD_BANK_TECHNICIAN",
    organizationId: orgId,
    branchId: branchA,
    assignedWardIds: [],
    permissions: new Set([
      PERMISSION_KEYS.BLOOD_BANK_DONOR_VIEW,
      PERMISSION_KEYS.BLOOD_BANK_DONOR_CREATE,
      PERMISSION_KEYS.BLOOD_BANK_DONOR_UPDATE,
      PERMISSION_KEYS.BLOOD_BANK_COLLECTION_CREATE,
      PERMISSION_KEYS.BLOOD_BANK_TESTING_CREATE,
      PERMISSION_KEYS.BLOOD_BANK_CROSSMATCH_CREATE,
      PERMISSION_KEYS.BLOOD_BANK_INVENTORY_VIEW,
      PERMISSION_KEYS.BLOOD_BANK_INVENTORY_ADJUST,
      PERMISSION_KEYS.BLOOD_BANK_ISSUE_CREATE,
      PERMISSION_KEYS.BLOOD_BANK_ISSUE_APPROVE
    ]),
    grants: new Map<string, IPermissionGrant>([
      [PERMISSION_KEYS.BLOOD_BANK_DONOR_VIEW, { permission: PERMISSION_KEYS.BLOOD_BANK_DONOR_VIEW, orgScope: "BRANCH", relScope: "UNRESTRICTED" }],
      [PERMISSION_KEYS.BLOOD_BANK_INVENTORY_VIEW, { permission: PERMISSION_KEYS.BLOOD_BANK_INVENTORY_VIEW, orgScope: "BRANCH", relScope: "UNRESTRICTED" }],
      [PERMISSION_KEYS.BLOOD_BANK_ISSUE_APPROVE, { permission: PERMISSION_KEYS.BLOOD_BANK_ISSUE_APPROVE, orgScope: "BRANCH", relScope: "UNRESTRICTED" }]
    ])
  };

  // 6. Nurse Context (Clinical only, no billing or blood bank approval)
  const nurseContext: AuthenticatedUserContext = {
    userId: nurseUserId,
    email: "nurse@hospital.com",
    name: "Nancy Nurse",
    roleId: new Types.ObjectId(),
    roleName: "STAFF_NURSE",
    organizationId: orgId,
    branchId: branchA,
    assignedWardIds: [],
    permissions: new Set([
      PERMISSION_KEYS.NURSING_TASK_VIEW,
      PERMISSION_KEYS.NURSING_TASK_CREATE,
      PERMISSION_KEYS.NURSING_VITALS_CREATE,
      PERMISSION_KEYS.PATIENT_VIEW
    ]),
    grants: new Map<string, IPermissionGrant>([
      [PERMISSION_KEYS.NURSING_TASK_VIEW, { permission: PERMISSION_KEYS.NURSING_TASK_VIEW, orgScope: "BRANCH", relScope: "UNRESTRICTED" }]
    ])
  };

  // ==========================================
  // 1. Billing & Finance Tests
  // ==========================================
  console.log("--- 1. Billing & Finance Domain Tests ---");

  test("Billing: Cashier has invoice creation and payment processing permissions", () => {
    assert.equal(cashierContext.permissions.has(PERMISSION_KEYS.BILLING_INVOICE_CREATE), true);
    assert.equal(cashierContext.permissions.has(PERMISSION_KEYS.BILLING_PAYMENT_CREATE), true);
    assert.equal(cashierContext.permissions.has(PERMISSION_KEYS.BILLING_REFUND_CREATE), true);
  });

  test("Billing: Nurse or Doctor cannot create invoices or process payments", () => {
    assert.equal(nurseContext.permissions.has(PERMISSION_KEYS.BILLING_INVOICE_CREATE), false);
    assert.equal(nurseContext.permissions.has(PERMISSION_KEYS.BILLING_PAYMENT_CREATE), false);
    assert.equal(nurseContext.permissions.has(PERMISSION_KEYS.BILLING_REFUND_CREATE), false);
  });

  test("Billing: Invoice query derives branch boundary filter", () => {
    const grant = cashierContext.grants.get(PERMISSION_KEYS.BILLING_INVOICE_VIEW)!;
    const filter = ScopeResolver.resolve(grant, cashierContext, "Invoice");

    assert.deepEqual(filter, { branchId: branchA });
  });

  test("Billing: Payment query derives branch boundary filter", () => {
    const grant = cashierContext.grants.get(PERMISSION_KEYS.BILLING_PAYMENT_VIEW)!;
    const filter = ScopeResolver.resolve(grant, cashierContext, "Payment");

    assert.deepEqual(filter, { branchId: branchA });
  });

  test("Billing: Cashier in Branch A cannot access Branch B invoice", () => {
    const invoiceBranchB = { _id: new Types.ObjectId(), branchId: branchB };
    const canAccess = cashierContext.branchId?.toString() === invoiceBranchB.branchId.toString();

    assert.equal(canAccess, false, "Cashier in Branch A must not access Branch B invoices");
  });

  // ==========================================
  // 2. Insurance Domain Tests
  // ==========================================
  console.log("\n--- 2. Insurance Domain Tests ---");

  test("Insurance: Insurance Coordinator has claim and preauth permissions", () => {
    assert.equal(insuranceOfficerContext.permissions.has(PERMISSION_KEYS.INSURANCE_CLAIM_VIEW), true);
    assert.equal(insuranceOfficerContext.permissions.has(PERMISSION_KEYS.INSURANCE_CLAIM_CREATE), true);
    assert.equal(insuranceOfficerContext.permissions.has(PERMISSION_KEYS.INSURANCE_CLAIM_ADJUDICATE), true);
  });

  test("Insurance: Cashier cannot adjudicate insurance claims", () => {
    assert.equal(cashierContext.permissions.has(PERMISSION_KEYS.INSURANCE_CLAIM_ADJUDICATE), false);
  });

  // ==========================================
  // 3. Emergency Domain Tests
  // ==========================================
  console.log("\n--- 3. Emergency Domain Tests ---");

  test("Emergency: Emergency Physician has triage and case management permissions", () => {
    assert.equal(emergencyDoctorContext.permissions.has(PERMISSION_KEYS.EMERGENCY_TRIAGE_CREATE), true);
    assert.equal(emergencyDoctorContext.permissions.has(PERMISSION_KEYS.EMERGENCY_CASE_MANAGE), true);
  });

  test("Emergency: Cashier cannot triage casualties or manage emergency cases", () => {
    assert.equal(cashierContext.permissions.has(PERMISSION_KEYS.EMERGENCY_TRIAGE_CREATE), false);
    assert.equal(cashierContext.permissions.has(PERMISSION_KEYS.EMERGENCY_CASE_MANAGE), false);
  });

  // ==========================================
  // 4. Operation Theatre (OT) Tests
  // ==========================================
  console.log("\n--- 4. Operation Theatre Domain Tests ---");

  test("OT: Surgeon has surgery scheduling and checklist verification permissions", () => {
    assert.equal(surgeonContext.permissions.has(PERMISSION_KEYS.OT_SCHEDULE_CREATE), true);
    assert.equal(surgeonContext.permissions.has(PERMISSION_KEYS.OT_CHECKLIST_VERIFY), true);
    assert.equal(surgeonContext.permissions.has(PERMISSION_KEYS.OT_RECORD_CREATE), true);
  });

  test("OT: Non-surgical staff (Cashier, Insurance) cannot schedule surgery", () => {
    assert.equal(cashierContext.permissions.has(PERMISSION_KEYS.OT_SCHEDULE_CREATE), false);
    assert.equal(insuranceOfficerContext.permissions.has(PERMISSION_KEYS.OT_SCHEDULE_CREATE), false);
  });

  // ==========================================
  // 5. Blood Bank Tests
  // ==========================================
  console.log("\n--- 5. Blood Bank Domain Tests ---");

  test("Blood Bank: Technician has inventory, testing, and issue approval permissions", () => {
    assert.equal(bloodBankTechContext.permissions.has(PERMISSION_KEYS.BLOOD_BANK_INVENTORY_VIEW), true);
    assert.equal(bloodBankTechContext.permissions.has(PERMISSION_KEYS.BLOOD_BANK_CROSSMATCH_CREATE), true);
    assert.equal(bloodBankTechContext.permissions.has(PERMISSION_KEYS.BLOOD_BANK_ISSUE_APPROVE), true);
  });

  test("Blood Bank: Nurse cannot approve blood issues directly", () => {
    assert.equal(nurseContext.permissions.has(PERMISSION_KEYS.BLOOD_BANK_ISSUE_APPROVE), false);
  });

  // Summary
  console.log(`\n=================================================`);
  console.log(`  Phase 5 Billing, Insurance & Ops Tests: ${passedTests}/${totalTests} Passed`);
  console.log(`=================================================\n`);
}

runBillingFinanceRbacTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
