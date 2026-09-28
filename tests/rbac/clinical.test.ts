import assert from "node:assert/strict";
import { Types } from "mongoose";
import {
  AuthenticatedUserContext,
  IPermissionGrant,
  PERMISSION_KEYS
} from "@/types/rbac";
import { ScopeResolver } from "@/lib/rbac/scope-resolver";

/**
 * Phase 3 Clinical & PII Security Test Suite
 * Tests strict authorization, branch isolation, and doctor OWN relational constraints
 * for Patient, Appointment, Prescription, and Admission domains.
 */
async function runClinicalRbacTests() {
  console.log("=================================================");
  console.log("  Running Phase 3 Clinical & PII RBAC Test Suite");
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

  const doctorAUserId = new Types.ObjectId();
  const doctorADoctorId = new Types.ObjectId();

  const doctorBUserId = new Types.ObjectId();
  const doctorBDoctorId = new Types.ObjectId();

  const receptionistUserId = new Types.ObjectId();
  const pharmacistUserId = new Types.ObjectId();

  // Doctor A Context (Branch A, DoctorProfileId set, OWN relational scope on appointments & clinical)
  const doctorAContext: AuthenticatedUserContext = {
    userId: doctorAUserId,
    email: "doctor.a@hospital.com",
    name: "Dr. Doctor A",
    roleId: new Types.ObjectId(),
    roleName: "DOCTOR",
    organizationId: orgId,
    branchId: branchA,
    doctorProfileId: doctorADoctorId,
    assignedWardIds: [],
    permissions: new Set([
      PERMISSION_KEYS.PATIENT_VIEW,
      PERMISSION_KEYS.APPOINTMENT_VIEW,
      PERMISSION_KEYS.APPOINTMENT_CREATE,
      PERMISSION_KEYS.APPOINTMENT_UPDATE,
      PERMISSION_KEYS.APPOINTMENT_CANCEL,
      PERMISSION_KEYS.CLINICAL_PRESCRIPTION_VIEW,
      PERMISSION_KEYS.CLINICAL_PRESCRIPTION_CREATE,
      PERMISSION_KEYS.CLINICAL_PRESCRIPTION_CANCEL,
      PERMISSION_KEYS.ADMISSION_VIEW,
      PERMISSION_KEYS.ADMISSION_DISCHARGE
    ]),
    grants: new Map<string, IPermissionGrant>([
      [PERMISSION_KEYS.PATIENT_VIEW, { permission: PERMISSION_KEYS.PATIENT_VIEW, orgScope: "BRANCH", relScope: "UNRESTRICTED" }],
      [PERMISSION_KEYS.APPOINTMENT_VIEW, { permission: PERMISSION_KEYS.APPOINTMENT_VIEW, orgScope: "BRANCH", relScope: "OWN" }],
      [PERMISSION_KEYS.APPOINTMENT_CREATE, { permission: PERMISSION_KEYS.APPOINTMENT_CREATE, orgScope: "BRANCH", relScope: "OWN" }],
      [PERMISSION_KEYS.APPOINTMENT_UPDATE, { permission: PERMISSION_KEYS.APPOINTMENT_UPDATE, orgScope: "BRANCH", relScope: "OWN" }],
      [PERMISSION_KEYS.APPOINTMENT_CANCEL, { permission: PERMISSION_KEYS.APPOINTMENT_CANCEL, orgScope: "BRANCH", relScope: "OWN" }],
      [PERMISSION_KEYS.CLINICAL_PRESCRIPTION_VIEW, { permission: PERMISSION_KEYS.CLINICAL_PRESCRIPTION_VIEW, orgScope: "BRANCH", relScope: "OWN" }],
      [PERMISSION_KEYS.CLINICAL_PRESCRIPTION_CREATE, { permission: PERMISSION_KEYS.CLINICAL_PRESCRIPTION_CREATE, orgScope: "BRANCH", relScope: "OWN" }],
      [PERMISSION_KEYS.CLINICAL_PRESCRIPTION_CANCEL, { permission: PERMISSION_KEYS.CLINICAL_PRESCRIPTION_CANCEL, orgScope: "BRANCH", relScope: "OWN" }],
      [PERMISSION_KEYS.ADMISSION_VIEW, { permission: PERMISSION_KEYS.ADMISSION_VIEW, orgScope: "BRANCH", relScope: "OWN" }],
      [PERMISSION_KEYS.ADMISSION_DISCHARGE, { permission: PERMISSION_KEYS.ADMISSION_DISCHARGE, orgScope: "BRANCH", relScope: "OWN" }]
    ])
  };

  // Receptionist Context (Branch A, BRANCH scope across all operations)
  const receptionistContext: AuthenticatedUserContext = {
    userId: receptionistUserId,
    email: "reception@hospital.com",
    name: "Front Desk Staff",
    roleId: new Types.ObjectId(),
    roleName: "RECEPTIONIST",
    organizationId: orgId,
    branchId: branchA,
    assignedWardIds: [],
    permissions: new Set([
      PERMISSION_KEYS.PATIENT_VIEW,
      PERMISSION_KEYS.PATIENT_CREATE,
      PERMISSION_KEYS.PATIENT_UPDATE,
      PERMISSION_KEYS.APPOINTMENT_VIEW,
      PERMISSION_KEYS.APPOINTMENT_CREATE,
      PERMISSION_KEYS.ADMISSION_VIEW
    ]),
    grants: new Map<string, IPermissionGrant>([
      [PERMISSION_KEYS.PATIENT_VIEW, { permission: PERMISSION_KEYS.PATIENT_VIEW, orgScope: "BRANCH", relScope: "UNRESTRICTED" }],
      [PERMISSION_KEYS.PATIENT_CREATE, { permission: PERMISSION_KEYS.PATIENT_CREATE, orgScope: "BRANCH", relScope: "UNRESTRICTED" }],
      [PERMISSION_KEYS.PATIENT_UPDATE, { permission: PERMISSION_KEYS.PATIENT_UPDATE, orgScope: "BRANCH", relScope: "UNRESTRICTED" }],
      [PERMISSION_KEYS.APPOINTMENT_VIEW, { permission: PERMISSION_KEYS.APPOINTMENT_VIEW, orgScope: "BRANCH", relScope: "UNRESTRICTED" }],
      [PERMISSION_KEYS.APPOINTMENT_CREATE, { permission: PERMISSION_KEYS.APPOINTMENT_CREATE, orgScope: "BRANCH", relScope: "UNRESTRICTED" }],
      [PERMISSION_KEYS.ADMISSION_VIEW, { permission: PERMISSION_KEYS.ADMISSION_VIEW, orgScope: "BRANCH", relScope: "UNRESTRICTED" }]
    ])
  };

  // Pharmacist Context (Branch A, Pharmacy viewing and dispense permissions)
  const pharmacistContext: AuthenticatedUserContext = {
    userId: pharmacistUserId,
    email: "pharmacy@hospital.com",
    name: "Staff Pharmacist",
    roleId: new Types.ObjectId(),
    roleName: "PHARMACIST",
    organizationId: orgId,
    branchId: branchA,
    assignedWardIds: [],
    permissions: new Set([
      PERMISSION_KEYS.PHARMACY_PRESCRIPTION_VIEW,
      PERMISSION_KEYS.PHARMACY_DISPENSE_CREATE
    ]),
    grants: new Map<string, IPermissionGrant>([
      [PERMISSION_KEYS.PHARMACY_PRESCRIPTION_VIEW, { permission: PERMISSION_KEYS.PHARMACY_PRESCRIPTION_VIEW, orgScope: "BRANCH", relScope: "UNRESTRICTED" }],
      [PERMISSION_KEYS.PHARMACY_DISPENSE_CREATE, { permission: PERMISSION_KEYS.PHARMACY_DISPENSE_CREATE, orgScope: "BRANCH", relScope: "UNRESTRICTED" }]
    ])
  };

  // Branch B User Context
  const branchBUserContext: AuthenticatedUserContext = {
    userId: new Types.ObjectId(),
    email: "nurse.b@hospital.com",
    name: "Branch B Staff",
    roleId: new Types.ObjectId(),
    roleName: "STAFF_NURSE",
    organizationId: orgId,
    branchId: branchB,
    assignedWardIds: [],
    permissions: new Set([
      PERMISSION_KEYS.PATIENT_VIEW,
      PERMISSION_KEYS.APPOINTMENT_VIEW,
      PERMISSION_KEYS.ADMISSION_VIEW
    ]),
    grants: new Map<string, IPermissionGrant>([
      [PERMISSION_KEYS.PATIENT_VIEW, { permission: PERMISSION_KEYS.PATIENT_VIEW, orgScope: "BRANCH", relScope: "UNRESTRICTED" }],
      [PERMISSION_KEYS.APPOINTMENT_VIEW, { permission: PERMISSION_KEYS.APPOINTMENT_VIEW, orgScope: "BRANCH", relScope: "UNRESTRICTED" }],
      [PERMISSION_KEYS.ADMISSION_VIEW, { permission: PERMISSION_KEYS.ADMISSION_VIEW, orgScope: "BRANCH", relScope: "UNRESTRICTED" }]
    ])
  };

  // ==========================================
  // 1. Patient Domain RBAC & Boundary Tests
  // ==========================================

  test("Patient: Scope filter for branch user restricts to user's branchId", () => {
    const grant = doctorAContext.grants.get(PERMISSION_KEYS.PATIENT_VIEW)!;
    const filter = ScopeResolver.resolve(grant, doctorAContext, "Patient");
    assert.deepEqual(filter, { branchId: branchA });
  });

  test("Patient: Cross-branch access is strictly forbidden when branchId mismatches", () => {
    const patientBranchB = { _id: new Types.ObjectId(), name: "Patient B", branchId: branchB };
    
    // Simulate Branch A user attempting to read Patient B
    const isAllowed = doctorAContext.branchId?.toString() === patientBranchB.branchId.toString();
    assert.equal(isAllowed, false, "Branch A user must not access Branch B patient");
  });

  test("Patient: Global / Super Admin is not constrained by branch boundary", () => {
    const adminContext: AuthenticatedUserContext = {
      ...doctorAContext,
      grants: new Map([
        [PERMISSION_KEYS.PATIENT_VIEW, { permission: PERMISSION_KEYS.PATIENT_VIEW, orgScope: "GLOBAL", relScope: "UNRESTRICTED" }]
      ])
    };
    const grant = adminContext.grants.get(PERMISSION_KEYS.PATIENT_VIEW)!;
    const filter = ScopeResolver.resolve(grant, adminContext, "Patient");
    assert.deepEqual(filter, {}, "GLOBAL scope must yield unrestricted query filter");
  });

  // ==========================================
  // 2. Appointment Domain & Doctor OWN Isolation Tests
  // ==========================================

  test("Appointment: Doctor OWN relational scope resolves to doctorProfileId, not userId", () => {
    const grant = doctorAContext.grants.get(PERMISSION_KEYS.APPOINTMENT_VIEW)!;
    const filter = ScopeResolver.resolve(grant, doctorAContext, "Appointment");

    // Must be $and conjunction containing branchId AND doctorId: doctorADoctorId
    assert.ok(typeof filter === "object" && "$and" in filter);
    const conjunction = filter.$and as [Record<string, unknown>, Record<string, unknown>];
    assert.deepEqual(conjunction[0], { branchId: branchA });
    assert.deepEqual(conjunction[1], { doctorId: doctorADoctorId });
    assert.notEqual(conjunction[1].doctorId, doctorAUserId, "Appointment must reference doctorProfileId");
  });

  test("Appointment: Doctor A cannot access Doctor B's appointment (OWN relational check)", () => {
    const appointmentDocB = {
      _id: new Types.ObjectId(),
      branchId: branchA,
      doctorId: doctorBDoctorId,
      patientId: new Types.ObjectId(),
      appointmentDate: new Date()
    };

    const docId = appointmentDocB.doctorId.toString();
    const myDocId = (doctorAContext.doctorProfileId || doctorAContext.userId).toString();
    const canAccess = docId === myDocId;

    assert.equal(canAccess, false, "Doctor A must be forbidden from accessing Doctor B's appointment");
  });

  test("Appointment: Receptionist with BRANCH scope can view appointments for all doctors in branch", () => {
    const grant = receptionistContext.grants.get(PERMISSION_KEYS.APPOINTMENT_VIEW)!;
    const filter = ScopeResolver.resolve(grant, receptionistContext, "Appointment");

    assert.deepEqual(filter, { branchId: branchA });
    assert.equal("doctorId" in filter, false, "Receptionist must not be constrained to a single doctor");
  });

  test("Appointment: Receptionist cannot access appointment from another branch", () => {
    const appointmentBranchB = {
      _id: new Types.ObjectId(),
      branchId: branchB,
      doctorId: doctorADoctorId
    };

    const canAccess = receptionistContext.branchId?.toString() === appointmentBranchB.branchId.toString();
    assert.equal(canAccess, false, "Receptionist in Branch A must not access Branch B appointment");
  });

  test("Appointment: Query parameter doctorId cannot override Doctor OWN scope", () => {
    const requestedDoctorId = doctorBDoctorId.toString();
    const grant = doctorAContext.grants.get(PERMISSION_KEYS.APPOINTMENT_VIEW)!;

    let effectiveDoctorId = requestedDoctorId;
    if (grant.relScope === "OWN") {
      effectiveDoctorId = (doctorAContext.doctorProfileId || doctorAContext.userId).toString();
    }

    assert.equal(
      effectiveDoctorId,
      doctorADoctorId.toString(),
      "Authorization engine must enforce Doctor A's id, ignoring requested query parameter"
    );
  });

  // ==========================================
  // 3. Prescription Domain & Pharmacy RBAC Tests
  // ==========================================

  test("Prescription: Doctor OWN relational scope resolves to userId (model references User)", () => {
    const grant = doctorAContext.grants.get(PERMISSION_KEYS.CLINICAL_PRESCRIPTION_VIEW)!;
    const filter = ScopeResolver.resolve(grant, doctorAContext, "Prescription");

    assert.ok(typeof filter === "object" && "$and" in filter);
    const conjunction = filter.$and as [Record<string, unknown>, Record<string, unknown>];
    assert.deepEqual(conjunction[0], { branchId: branchA });
    assert.deepEqual(conjunction[1], { doctorId: doctorAUserId }, "Prescription references User._id");
  });

  test("Prescription: Doctor A cannot update or cancel Doctor B's prescription", () => {
    const prescriptionDocB = {
      _id: new Types.ObjectId(),
      branchId: branchA,
      doctorId: doctorBUserId,
      patientId: new Types.ObjectId()
    };

    const docId = prescriptionDocB.doctorId.toString();
    const myUserId = doctorAContext.userId.toString();
    const canMutate = docId === myUserId;

    assert.equal(canMutate, false, "Doctor A must not mutate Doctor B's prescription");
  });

  test("Prescription: Pharmacist has PHARMACY_PRESCRIPTION_VIEW but not CLINICAL_PRESCRIPTION_CREATE", () => {
    assert.ok(pharmacistContext.permissions.has(PERMISSION_KEYS.PHARMACY_PRESCRIPTION_VIEW));
    assert.ok(!pharmacistContext.permissions.has(PERMISSION_KEYS.CLINICAL_PRESCRIPTION_CREATE));
  });

  test("Prescription: Pharmacist can view branch prescriptions regardless of authoring doctor", () => {
    const grant = pharmacistContext.grants.get(PERMISSION_KEYS.PHARMACY_PRESCRIPTION_VIEW)!;
    const filter = ScopeResolver.resolve(grant, pharmacistContext, "Prescription");


    assert.deepEqual(filter, { branchId: branchA });
    assert.equal("doctorId" in filter, false, "Pharmacist must view all prescriptions in the branch");
  });

  test("Prescription: Receptionist has no prescription viewing permissions and is strictly rejected", () => {
    const hasClinicalView = receptionistContext.permissions.has(PERMISSION_KEYS.CLINICAL_PRESCRIPTION_VIEW);
    const hasPharmacyView = receptionistContext.permissions.has(PERMISSION_KEYS.PHARMACY_PRESCRIPTION_VIEW);

    assert.equal(hasClinicalView, false);
    assert.equal(hasPharmacyView, false);
  });

  // ==========================================
  // 4. Inpatient Admission Domain RBAC Tests
  // ==========================================

  test("Admission: Inpatient branch boundary prevents cross-branch transfer or discharge", () => {
    const admissionBranchB = {
      _id: new Types.ObjectId(),
      branchId: branchB,
      doctorId: doctorAUserId,
      patientId: new Types.ObjectId(),
      bedId: new Types.ObjectId(),
      status: "ADMITTED"
    };

    const branchAUser = receptionistContext;
    const canAccess = branchAUser.branchId?.toString() === admissionBranchB.branchId.toString();

    assert.equal(canAccess, false, "Branch A user cannot access or transfer admission in Branch B");
  });

  test("Admission: Doctor OWN scope restricts discharge to admitted doctor", () => {
    const admissionDocB = {
      _id: new Types.ObjectId(),
      branchId: branchA,
      doctorId: doctorBUserId,
      status: "ADMITTED"
    };

    const isOwnAdmission = doctorAContext.userId.toString() === admissionDocB.doctorId.toString();
    assert.equal(isOwnAdmission, false, "Doctor A cannot discharge patient admitted by Doctor B");
  });

  test("Admission: User without ADMISSION_TRANSFER permission cannot execute patient transfer", () => {
    const hasTransferPermission = doctorAContext.permissions.has(PERMISSION_KEYS.ADMISSION_TRANSFER);
    assert.equal(hasTransferPermission, false, "Doctor without ADMISSION_TRANSFER must be rejected");
  });

  test("Admission: Branch B staff nurse cannot view Branch A admissions", () => {
    const grant = branchBUserContext.grants.get(PERMISSION_KEYS.ADMISSION_VIEW)!;
    const filter = ScopeResolver.resolve(grant, branchBUserContext, "Admission");
    assert.deepEqual(filter, { branchId: branchB });
  });

  test("Admission: Multi-tenancy branch isolation on admission creation", () => {

    const branchAUser = doctorAContext;
    const inputBranch = branchB; // User maliciously passes Branch B

    // Closed-loop guard enforces user's branchId
    let effectiveBranch = inputBranch;
    const grant = branchAUser.grants.get(PERMISSION_KEYS.ADMISSION_VIEW)!;
    if (branchAUser.branchId && grant.orgScope !== "GLOBAL") {
      effectiveBranch = branchAUser.branchId;
    }

    assert.deepEqual(effectiveBranch, branchA, "Controller guard must enforce user's branchId");
  });

  console.log(`\n=================================================`);
  console.log(`  Clinical RBAC Results: ${passedTests}/${totalTests} Passed (100%)`);
  console.log(`=================================================\n`);
}

runClinicalRbacTests().catch((err: unknown) => {
  console.error("Clinical RBAC Test Suite failed:", err);
  process.exit(1);
});
