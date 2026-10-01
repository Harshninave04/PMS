import assert from "node:assert/strict";
import { Types } from "mongoose";
import { AuthenticatedUserContext, IPermissionGrant, PERMISSION_KEYS as P } from "@/types/rbac";
import { ScopeResolver } from "@/lib/rbac/scope-resolver";
import { ADMIN_ROLE, ALL_ROLES, buildRoleAccess } from "@/lib/rbac/role-access";

const hospitalId = new Types.ObjectId();

/** Builds the request context the guard would derive for a user holding `roleName`. */
function contextFor(roleName: string, extra: Partial<AuthenticatedUserContext> = {}): AuthenticatedUserContext {
  const permissions = new Set<string>();
  const grants = new Map<string, IPermissionGrant>();
  for (const item of buildRoleAccess(roleName)) {
    for (const grant of (item.grants ?? []) as IPermissionGrant[]) {
      permissions.add(grant.permission);
      grants.set(grant.permission, grant);
    }
  }
  return {
    userId: new Types.ObjectId(),
    email: `${roleName.toLowerCase()}@hospital.com`,
    roleId: new Types.ObjectId(),
    roleName,
    organizationId: hospitalId,
    assignedWardIds: [],
    permissions,
    grants,
    ...extra,
  };
}

function can(roleName: string, permission: string): boolean {
  return contextFor(roleName).permissions.has(permission);
}

function filterFor(roleName: string, permission: string, model: string, extra: Partial<AuthenticatedUserContext> = {}) {
  const ctx = contextFor(roleName, extra);
  const grant = ctx.grants.get(permission);
  assert.ok(grant, `${roleName} has no grant for ${permission}`);
  return ScopeResolver.resolve(grant, ctx, model);
}

/**
 * Role test suite: verifies what each of the six hospital roles may do,
 * using the real role definitions and the real scope resolver.
 */
async function runRoleTests() {
  console.log("=================================================");
  console.log("  Running Role Permission Test Suite");
  console.log("=================================================\n");

  let passedTests = 0;
  let totalTests = 0;

  function test(name: string, fn: () => void) {
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

  test("There are exactly six roles", () => {
    assert.deepEqual([...ALL_ROLES].sort(), ["ACCOUNTANT", "ADMIN", "DOCTOR", "NURSE", "PHARMACIST", "RECEPTIONIST"]);
  });

  test("Admin holds every permission", () => {
    for (const perm of Object.values(P)) assert.ok(can(ADMIN_ROLE, perm), `Admin is missing ${perm}`);
  });

  test("Only the admin manages users, roles, doctors, staff and the hospital profile", () => {
    const adminOnly = [P.USER_CREATE, P.USER_UPDATE, P.USER_DISABLE, P.ROLE_UPDATE, P.DOCTOR_CREATE, P.STAFF_CREATE, P.DEPARTMENT_CREATE, P.ORGANIZATION_UPDATE, P.WARD_MANAGE];
    for (const role of ALL_ROLES.filter((r) => r !== ADMIN_ROLE)) {
      for (const perm of adminOnly) assert.ok(!can(role, perm), `${role} must not have ${perm}`);
    }
  });

  test("Every role can open its dashboard and fill form dropdowns", () => {
    for (const role of ALL_ROLES) {
      for (const perm of [P.DASHBOARD_VIEW, P.DEPARTMENT_VIEW, P.DOCTOR_VIEW, P.WARD_VIEW, P.USER_DIRECTORY_VIEW]) {
        assert.ok(can(role, perm), `${role} is missing ${perm}`);
      }
    }
  });

  test("Receptionist registers patients, books OPD, admits and collects fees", () => {
    for (const perm of [P.PATIENT_CREATE, P.APPOINTMENT_CREATE, P.APPOINTMENT_CANCEL, P.ADMISSION_CREATE, P.ADMISSION_DISCHARGE, P.BILLING_INVOICE_CREATE, P.BILLING_PAYMENT_CREATE]) {
      assert.ok(can("RECEPTIONIST", perm), `Receptionist is missing ${perm}`);
    }
    for (const perm of [P.CLINICAL_PRESCRIPTION_VIEW, P.PHARMACY_DISPENSE_CREATE, P.BILLING_INVOICE_CANCEL]) {
      assert.ok(!can("RECEPTIONIST", perm), `Receptionist must not have ${perm}`);
    }
  });

  test("Doctor consults, prescribes and records vitals but cannot bill or dispense", () => {
    for (const perm of [P.CLINICAL_RECORD_CREATE, P.CLINICAL_DIAGNOSIS_CREATE, P.CLINICAL_PRESCRIPTION_CREATE, P.NURSING_VITALS_CREATE, P.APPOINTMENT_UPDATE]) {
      assert.ok(can("DOCTOR", perm), `Doctor is missing ${perm}`);
    }
    for (const perm of [P.BILLING_INVOICE_CREATE, P.PHARMACY_DISPENSE_CREATE, P.PATIENT_CREATE]) {
      assert.ok(!can("DOCTOR", perm), `Doctor must not have ${perm}`);
    }
  });

  test("Doctor only sees their own appointments (OWN scope by doctor profile)", () => {
    const doctorProfileId = new Types.ObjectId();
    const filter = filterFor("DOCTOR", P.APPOINTMENT_VIEW, "Appointment", { doctorProfileId });
    assert.deepEqual(filter, { $and: [{ branchId: hospitalId }, { doctorId: doctorProfileId }] });
  });

  test("Doctor only sees their own prescriptions (OWN scope by user)", () => {
    const ctx = contextFor("DOCTOR");
    const filter = ScopeResolver.resolve(ctx.grants.get(P.CLINICAL_PRESCRIPTION_VIEW)!, ctx, "Prescription");
    assert.deepEqual(filter, { $and: [{ branchId: hospitalId }, { doctorId: ctx.userId }] });
  });

  test("Nurse records vitals, notes and medication rounds on the ward", () => {
    for (const perm of [P.NURSING_VITALS_CREATE, P.NURSING_TASK_VIEW, P.NURSING_TASK_EXECUTE, P.CLINICAL_RECORD_CREATE, P.ADMISSION_VIEW]) {
      assert.ok(can("NURSE", perm), `Nurse is missing ${perm}`);
    }
    for (const perm of [P.CLINICAL_PRESCRIPTION_CREATE, P.BILLING_INVOICE_VIEW, P.ADMISSION_DISCHARGE]) {
      assert.ok(!can("NURSE", perm), `Nurse must not have ${perm}`);
    }
  });

  test("Pharmacist dispenses prescriptions and manages stock only", () => {
    for (const perm of [P.PHARMACY_PRESCRIPTION_VIEW, P.PHARMACY_DISPENSE_CREATE, P.PHARMACY_STOCK_MANAGE]) {
      assert.ok(can("PHARMACIST", perm), `Pharmacist is missing ${perm}`);
    }
    for (const perm of [P.CLINICAL_PRESCRIPTION_CREATE, P.BILLING_INVOICE_CREATE, P.APPOINTMENT_CREATE]) {
      assert.ok(!can("PHARMACIST", perm), `Pharmacist must not have ${perm}`);
    }
  });

  test("Pharmacist sees prescriptions from every doctor in the hospital", () => {
    assert.deepEqual(filterFor("PHARMACIST", P.PHARMACY_PRESCRIPTION_VIEW, "Prescription"), { branchId: hospitalId });
  });

  test("Accountant bills, collects, cancels bills and reads reports", () => {
    for (const perm of [P.BILLING_INVOICE_CREATE, P.BILLING_INVOICE_CANCEL, P.BILLING_PAYMENT_CREATE, P.REPORTS_FINANCIAL_VIEW, P.REPORTS_OPERATIONAL_VIEW]) {
      assert.ok(can("ACCOUNTANT", perm), `Accountant is missing ${perm}`);
    }
    for (const perm of [P.CLINICAL_RECORD_VIEW, P.PHARMACY_DISPENSE_CREATE, P.ADMISSION_CREATE]) {
      assert.ok(!can("ACCOUNTANT", perm), `Accountant must not have ${perm}`);
    }
  });

  test("Hospital records are scoped to the user's hospital", () => {
    assert.deepEqual(filterFor("ACCOUNTANT", P.BILLING_INVOICE_VIEW, "Invoice"), { branchId: hospitalId });
    assert.deepEqual(filterFor("RECEPTIONIST", P.PATIENT_VIEW, "Patient"), { branchId: hospitalId });
  });

  test("A user without a hospital sees nothing", () => {
    const filter = filterFor("RECEPTIONIST", P.PATIENT_VIEW, "Patient", { organizationId: undefined });
    assert.deepEqual(filter, { _id: new Types.ObjectId("000000000000000000000000") });
  });

  console.log(`\n=================================================`);
  console.log(`  Role Test Results: ${passedTests}/${totalTests} Passed (100%)`);
  console.log(`=================================================\n`);
}

runRoleTests().catch((err: unknown) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
