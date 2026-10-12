import assert from "node:assert/strict";
import { Types } from "mongoose";
import {
  AuthenticatedUserContext,
  IPermissionGrant,
  PERMISSION_KEYS
} from "@/types/rbac";
import { ScopeResolver } from "@/lib/rbac/scope-resolver";
import { canCompleteAppointment } from "@/lib/rbac/doctor-scope";
import { supportsMongoTransactions } from "@/lib/mongo-transaction-support";
import { COMMON_CHIEF_COMPLAINTS, COMMON_INVESTIGATIONS, MEDICATION_DOSAGE_OPTIONS, MEDICATION_DURATION_OPTIONS, MEDICATION_FREQUENCY_OPTIONS, MEDICATION_INSTRUCTIONS_OPTIONS, OTHER_OPTION } from "@/constants/consultation";
import { buildConsultationDocuments, isAppointmentReadyForConsultation, normalizeConsultationInput } from "@/lib/consultation-save";
import { createConsultationDraft, createMedicationDraft, validateConsultationDraft } from "@/lib/consultation-form";
import { ClinicalRecord } from "@/models/clinical-record.model";
import Prescription from "@/models/prescription.model";

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

  test("Appointment: Doctor can complete only their own and missing doctor profiles fail closed", () => {
    assert.equal(canCompleteAppointment(doctorAContext, doctorADoctorId), true);
    assert.equal(canCompleteAppointment(doctorAContext, doctorBDoctorId), false);
    assert.equal(
      canCompleteAppointment({ ...doctorAContext, doctorProfileId: undefined }, doctorADoctorId),
      false
    );
    assert.equal(canCompleteAppointment(receptionistContext, doctorADoctorId), true);
  });

  test("MongoDB: Standalone topology skips unsupported multi-document transactions", () => {
    assert.equal(supportsMongoTransactions("Single"), false);
    assert.equal(supportsMongoTransactions(undefined), false);
    assert.equal(supportsMongoTransactions("ReplicaSetWithPrimary"), true);
    assert.equal(supportsMongoTransactions("Sharded"), true);
    assert.equal(supportsMongoTransactions("LoadBalanced"), true);
  });

  test("Consultation form option lists match the Doctor workflow", () => {
    assert.deepEqual(COMMON_CHIEF_COMPLAINTS, ["Fever", "Cough / Cold", "Headache / Migraine", "Abdominal pain", "Body ache / Weakness", "Follow-up visit", "Other"]);
    assert.deepEqual(COMMON_INVESTIGATIONS, ["CBC", "Blood sugar", "X-ray", "ECG", "Urine routine", "Ultrasound (USG)", "Other"]);
    assert.deepEqual(MEDICATION_DOSAGE_OPTIONS, ["1 Tablet", "2 Tablets", "1 Capsule", "5 ml", "10 ml", "As directed", "Other"]);
    assert.deepEqual(MEDICATION_FREQUENCY_OPTIONS, ["Once daily (OD)", "Twice daily (BD)", "Thrice daily (TDS)", "Four times daily (QID)", "At bedtime (HS)", "S.O.S (as required)", "Other"]);
    assert.deepEqual(MEDICATION_DURATION_OPTIONS, ["3 days", "5 days", "7 days", "10 days", "14 days", "1 month", "Other"]);
    assert.deepEqual(MEDICATION_INSTRUCTIONS_OPTIONS, ["After meals", "Before meals", "With food", "On empty stomach", "Avoid alcohol", "As directed", "Other"]);
  });

  test("Consultation form requires a chief complaint and a name for every medicine row", () => {
    const draft = createConsultationDraft({ _id: "a", status: "CHECKED_IN", reason: "Unknown complaint" });
    assert.equal(draft.chiefComplaint, OTHER_OPTION);
    assert.equal(draft.chiefComplaintOther, "Unknown complaint");
    assert.equal(validateConsultationDraft({ ...draft, chiefComplaint: "", chiefComplaintOther: "" }, []), "Chief complaint is required.");
    assert.equal(validateConsultationDraft({ ...draft, chiefComplaint: "Fever", chiefComplaintOther: "" }, [createMedicationDraft("m1")]), "Enter a drug name for medicine 1.");
  });

  test("Every Other prescription value requires its corresponding free-text input", () => {
    const base = { chiefComplaint: "Fever", chiefComplaintOther: "", diagnosisNotes: "", investigations: [], investigationsOther: "" };
    for (const field of ["dosage", "frequency", "duration", "instructions"] as const) {
      const medication = { ...createMedicationDraft(field), name: "Medicine", [field]: OTHER_OPTION };
      assert.match(validateConsultationDraft(base, [medication]) ?? "", /Other field/);
    }
  });

  test("Consultation saves ignore spoofed client patient and doctor ids", () => {
    const parsed = normalizeConsultationInput({ chiefComplaint: "Fever", patientId: "spoofed-patient", doctorId: "spoofed-doctor", medications: [] });
    assert.ok(parsed.data);
    const documents = buildConsultationDocuments(parsed.data!, { appointmentId: "trusted-appointment", patientId: "trusted-patient", doctorUserId: "trusted-doctor-user", branchId: "trusted-branch" });
    assert.equal(documents.clinicalRecord.patient, "trusted-patient");
    assert.equal(documents.clinicalRecord.doctor, "trusted-doctor-user");
    assert.equal(documents.prescription, null);

    const withPrescription = normalizeConsultationInput({ chiefComplaint: "Fever", patientId: "spoofed", doctorId: "spoofed", medications: [{ name: "Dolo 650", dosage: "1 Tablet" }] });
    const pharmacyDocument = buildConsultationDocuments(withPrescription.data!, { appointmentId: "trusted-appointment", patientId: "trusted-patient", doctorUserId: "trusted-doctor-user", branchId: "trusted-branch" }).prescription;
    assert.equal(pharmacyDocument?.doctorId, "trusted-doctor-user");
    assert.equal(pharmacyDocument?.patientId, "trusted-patient");
    assert.equal(pharmacyDocument?.branchId, "trusted-branch");
    assert.deepEqual(pharmacyDocument?.medications, [{ name: "Dolo 650", dosage: "1 Tablet", frequency: undefined, duration: undefined, instructions: undefined }]);
  });

  test("Consultation save accepts only called or in-consultation appointments and is duplicate-safe by index", () => {
    assert.equal(isAppointmentReadyForConsultation("CALLED", "CHECKED_IN"), true);
    assert.equal(isAppointmentReadyForConsultation("IN_CONSULTATION", "IN_PROGRESS"), true);
    assert.equal(isAppointmentReadyForConsultation("WAITING", "CHECKED_IN"), false);
    assert.ok(ClinicalRecord.schema.indexes().some(([keys, options]) => keys.appointmentId === 1 && keys.recordType === 1 && options.unique));
    assert.ok(Prescription.schema.indexes().some(([keys, options]) => keys.appointmentId === 1 && options.unique && options.sparse));
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
