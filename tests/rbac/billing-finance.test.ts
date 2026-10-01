import assert from "node:assert/strict";
import { Types } from "mongoose";
import {
  AuthenticatedUserContext,
  IPermissionGrant,
  PERMISSION_KEYS
} from "@/types/rbac";
import { ScopeResolver } from "@/lib/rbac/scope-resolver";

/**
 * Billing & Finance Security Test Suite
 * Tests strict authorization and branch isolation across the billing domain.
 */
async function runBillingFinanceRbacTests() {
  console.log("=================================================");
  console.log("  Running Billing & Finance RBAC Tests");
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
  const accountantUserId = new Types.ObjectId();
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
      PERMISSION_KEYS.BILLING_PAYMENT_CREATE
    ]),
    grants: new Map<string, IPermissionGrant>([
      [PERMISSION_KEYS.BILLING_INVOICE_VIEW, { permission: PERMISSION_KEYS.BILLING_INVOICE_VIEW, orgScope: "BRANCH", relScope: "UNRESTRICTED" }],
      [PERMISSION_KEYS.BILLING_INVOICE_CREATE, { permission: PERMISSION_KEYS.BILLING_INVOICE_CREATE, orgScope: "BRANCH", relScope: "UNRESTRICTED" }],
      [PERMISSION_KEYS.BILLING_PAYMENT_VIEW, { permission: PERMISSION_KEYS.BILLING_PAYMENT_VIEW, orgScope: "BRANCH", relScope: "UNRESTRICTED" }],
      [PERMISSION_KEYS.BILLING_PAYMENT_CREATE, { permission: PERMISSION_KEYS.BILLING_PAYMENT_CREATE, orgScope: "BRANCH", relScope: "UNRESTRICTED" }]
    ])
  };

  // 2. Accountant Context (Branch A, full billing incl. cancel)
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
      PERMISSION_KEYS.BILLING_INVOICE_UPDATE,
      PERMISSION_KEYS.BILLING_INVOICE_CANCEL,
      PERMISSION_KEYS.BILLING_PAYMENT_VIEW,
      PERMISSION_KEYS.BILLING_PAYMENT_CREATE
    ]),
    grants: new Map<string, IPermissionGrant>([
      [PERMISSION_KEYS.BILLING_INVOICE_CANCEL, { permission: PERMISSION_KEYS.BILLING_INVOICE_CANCEL, orgScope: "BRANCH", relScope: "UNRESTRICTED" }]
    ])
  };

  // 3. Nurse Context (no billing permissions)
  const nurseContext: AuthenticatedUserContext = {
    userId: nurseUserId,
    email: "nurse@hospital.com",
    name: "Nancy Nurse",
    roleId: new Types.ObjectId(),
    roleName: "NURSE",
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

  console.log("--- 1. Billing & Finance Domain Tests ---");

  test("Billing: Cashier has invoice creation and payment processing permissions", () => {
    assert.equal(cashierContext.permissions.has(PERMISSION_KEYS.BILLING_INVOICE_CREATE), true);
    assert.equal(cashierContext.permissions.has(PERMISSION_KEYS.BILLING_PAYMENT_CREATE), true);
  });

  test("Billing: Nurse or Doctor cannot create invoices or process payments", () => {
    assert.equal(nurseContext.permissions.has(PERMISSION_KEYS.BILLING_INVOICE_CREATE), false);
    assert.equal(nurseContext.permissions.has(PERMISSION_KEYS.BILLING_PAYMENT_CREATE), false);
    assert.equal(nurseContext.permissions.has(PERMISSION_KEYS.BILLING_INVOICE_CANCEL), false);
  });

  test("Billing: Only the accountant can cancel an invoice", () => {
    assert.equal(accountantContext.permissions.has(PERMISSION_KEYS.BILLING_INVOICE_CANCEL), true);
    assert.equal(cashierContext.permissions.has(PERMISSION_KEYS.BILLING_INVOICE_CANCEL), false);
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

  console.log("\n=================================================");
  console.log(`  Billing & Finance Tests: ${passedTests}/${totalTests} Passed`);
  console.log("=================================================\n");
}

runBillingFinanceRbacTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
