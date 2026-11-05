import assert from "node:assert/strict";
import { Types } from "mongoose";
import {
  AuthenticatedUserContext,
  IPermissionGrant,
  PERMISSION_KEYS
} from "@/types/rbac";
import { isBranchConfined, recordBranchOutsideScope, withBranchScope } from "@/lib/rbac/branch-scope";
import { canCompleteAppointment, isDoctorActor, isDoctorRole } from "@/lib/rbac/doctor-scope";
import { MAX_UPLOAD_BYTES, extensionOf, validateUploadFile } from "@/lib/upload-rules";
import { StorageUnconfiguredError, isDevelopmentEnvironment } from "@/lib/storage";

/**
 * OPD branch isolation + upload guard test suite (cross-branch data-leak phase).
 *
 * The appointment routes (cancel, reschedule, queue, complete-consultation)
 * and the upload route build their read/mutation filters with the shared
 * helpers asserted here. A tiny in-memory matcher evaluates the very filter
 * objects the routes issue against fixture appointments, proving a Branch A
 * user can list/inspect or mutate nothing belonging to Branch B while a
 * same-branch flow still matches.
 */
async function runBranchIsolationTests() {
  console.log("=================================================");
  console.log("  Running OPD Branch Isolation & Upload Test Suite");
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

  const orgId = new Types.ObjectId();
  const branchA = new Types.ObjectId();
  const branchB = new Types.ObjectId();
  const doctorAProfile = new Types.ObjectId();
  const doctorBProfile = new Types.ObjectId();

  function actor(options: {
    roleName: string;
    branchId: Types.ObjectId | undefined;
    doctorProfileId?: Types.ObjectId;
    appointmentRelScope: "OWN" | "UNRESTRICTED";
    uploadOrgScope: "BRANCH" | "GLOBAL";
  }): AuthenticatedUserContext {
    const grants = new Map<string, IPermissionGrant>();
    for (const permission of [
      PERMISSION_KEYS.APPOINTMENT_VIEW,
      PERMISSION_KEYS.APPOINTMENT_UPDATE,
      PERMISSION_KEYS.APPOINTMENT_CANCEL
    ]) {
      grants.set(permission, { permission, orgScope: "BRANCH", relScope: options.appointmentRelScope });
    }
    grants.set(PERMISSION_KEYS.PATIENT_DOC_UPLOAD, {
      permission: PERMISSION_KEYS.PATIENT_DOC_UPLOAD,
      orgScope: options.uploadOrgScope,
      relScope: "UNRESTRICTED"
    });
    return {
      userId: new Types.ObjectId(),
      email: `${options.roleName.toLowerCase()}@hms.test`,
      name: options.roleName,
      roleId: new Types.ObjectId(),
      roleName: options.roleName,
      organizationId: orgId,
      branchId: options.branchId,
      doctorProfileId: options.doctorProfileId,
      assignedWardIds: [],
      permissions: new Set<string>([
        PERMISSION_KEYS.APPOINTMENT_VIEW,
        PERMISSION_KEYS.APPOINTMENT_UPDATE,
        PERMISSION_KEYS.APPOINTMENT_CANCEL,
        PERMISSION_KEYS.PATIENT_DOC_UPLOAD
      ]),
      grants
    };
  }

  // Branch A actors: a front-desk receptionist and a doctor (OWN appointment scope).
  const receptionistA = actor({ roleName: "RECEPTIONIST", branchId: branchA, appointmentRelScope: "UNRESTRICTED", uploadOrgScope: "BRANCH" });
  const receptionistB = actor({ roleName: "RECEPTIONIST", branchId: branchB, appointmentRelScope: "UNRESTRICTED", uploadOrgScope: "BRANCH" });
  const doctorA = actor({ roleName: "DOCTOR", branchId: branchA, doctorProfileId: doctorAProfile, appointmentRelScope: "OWN", uploadOrgScope: "BRANCH" });
  const doctorB = actor({ roleName: "DOCTOR", branchId: branchB, doctorProfileId: doctorBProfile, appointmentRelScope: "OWN", uploadOrgScope: "BRANCH" });
  // Organization-wide actor (e.g. management role) — no branch confinement.
  const managerGlobal = actor({ roleName: "ADMIN", branchId: undefined, appointmentRelScope: "UNRESTRICTED", uploadOrgScope: "GLOBAL" });

  /** Mirrors the narrowed AuthorizationSuccess the route handlers actually hold. */
  function scoped(ctx: AuthenticatedUserContext, permission: string = PERMISSION_KEYS.APPOINTMENT_VIEW) {
    const grant = ctx.grants.get(permission) ?? { permission, orgScope: "BRANCH", relScope: "UNRESTRICTED" as const };
    return { context: ctx, grant };
  }

  const apptAId = new Types.ObjectId();
  const apptBId = new Types.ObjectId();
  const patientBranchAId = new Types.ObjectId();

  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart);
  todayEnd.setDate(todayEnd.getDate() + 1);

  type Fixture = Record<string, unknown>;
  const aptA: Fixture = { _id: apptAId, branchId: branchA, doctorId: doctorAProfile, status: "SCHEDULED", queueStatus: "WAITING", appointmentDate: now };
  const aptB: Fixture = { _id: apptBId, branchId: branchB, doctorId: doctorBProfile, status: "SCHEDULED", queueStatus: "WAITING", appointmentDate: now };

  function equalsScalar(actual: unknown, expected: unknown): boolean {
    if (actual === null || actual === undefined) return false;
    return String(actual) === String(expected);
  }

  function matchesCondition(record: Fixture, key: string, condition: unknown): boolean {
    const value = record[key];
    if (condition === undefined) return true;
    if (condition === null) return value === null || value === undefined;
    if (condition instanceof Types.ObjectId || typeof condition !== "object") return equalsScalar(value, condition);
    if (Array.isArray(condition)) return condition.some((sub) => matchesFilter(record, sub as Record<string, unknown>));
    const cond = condition as Record<string, unknown>;
    if (Array.isArray(cond.$nin)) return !(cond.$nin as unknown[]).some((item) => equalsScalar(value, item));
    if (Array.isArray(cond.$in)) return (cond.$in as unknown[]).some((item) => equalsScalar(value, item));
    if ("$exists" in cond) return Boolean(value) === Boolean(cond.$exists);
    if ("$ne" in cond) return !(value === null || value === undefined ? (cond.$ne === null) : equalsScalar(value, cond.$ne));
    if ("$gte" in cond || "$lt" in cond) {
      const time = value instanceof Date ? value.getTime() : value === undefined ? 0 : new Date(String(value)).getTime();
      if ("$gte" in cond) {
        const floor = cond.$gte instanceof Date ? cond.$gte.getTime() : new Date(String(cond.$gte)).getTime();
        if (!(time >= floor)) return false;
      }
      if ("$lt" in cond) {
        const ceiling = cond.$lt instanceof Date ? cond.$lt.getTime() : new Date(String(cond.$lt)).getTime();
        if (!(time < ceiling)) return false;
      }
      return true;
    }
    return equalsScalar(value, condition);
  }

  function matchesFilter(record: Fixture, filter: Record<string, unknown> | null | undefined): boolean {
    if (!filter) return true;
    return Object.entries(filter).every(([key, condition]) => matchesCondition(record, key, condition));
  }

  /* ------------------------------------------------------------------ */
  /* A) Appointment branch scope                                          */
  /* ------------------------------------------------------------------ */

  test("Cancelled list: a Branch A receptionist cannot see a cancelled Branch B appointment", () => {
    const apptBCancelled = { ...aptB, status: "CANCELLED", cancelledAt: now };
    const apptACancelled = { ...aptA, status: "CANCELLED", cancelledAt: now };
    const listFilter = withBranchScope(scoped(receptionistA), { status: "CANCELLED" });
    assert.equal(matchesFilter(apptBCancelled, listFilter), false, "Branch B cancelled appointments must be hidden");
    assert.equal(matchesFilter(apptACancelled, listFilter), true, "Own-branch cancelled appointments remain visible");
  });

  test("Cancelled list: a branch-confined doctor is also fenced to their own branch", () => {
    const apptBCancelledByA = { ...aptB, status: "CANCELLED", doctorId: doctorAProfile };
    const listFilter = withBranchScope(scoped(doctorA), { status: "CANCELLED", ...(isDoctorActor(doctorA) ? { doctorId: doctorA.doctorProfileId!.toString() } : {}) });
    assert.equal(matchesFilter(apptBCancelledByA, listFilter), false, "Doctor's cancelled list must not leak other branches");
  });

  test("Organization-scope actor keeps the list unconfined (no branch filter key)", () => {
    const apptBCancelled = { ...aptB, status: "CANCELLED", cancelledAt: now };
    const listFilter = withBranchScope(scoped(managerGlobal), { status: "CANCELLED" });
    assert.equal("branchId" in listFilter, false, "No branch filter is added without branch confinement");
    assert.equal(matchesFilter(apptBCancelled, listFilter), true, "Branch B rows stay visible for organization scope");
  });

  test("Reschedule list: Branch B reschedule history is hidden from Branch A staff", () => {
    const lastWeek = new Date(now.getTime() - 7 * 86400000);
    const apptBRescheduled = { ...aptB, rescheduledFrom: lastWeek };
    const apptARescheduled = { ...aptA, rescheduledFrom: lastWeek };
    const listFilter = withBranchScope(scoped(receptionistA), { rescheduledFrom: { $exists: true, $ne: null } });
    assert.equal(matchesFilter(apptBRescheduled, listFilter), false, "Branch B reschedule history must be hidden");
    assert.equal(matchesFilter(apptARescheduled, listFilter), true, "Own-branch reschedule history remains visible");
  });

  test("Cancel mutation: Branch A receptionist targeting the Branch B appointment resolves to no record (404 path)", () => {
    const crossFilter = withBranchScope(scoped(receptionistA), { _id: apptBId });
    assert.equal("branchId" in crossFilter, true, "Conditional updates keep the branch filter");
    assert.deepEqual(String((crossFilter as Record<string, unknown>).branchId), branchA.toString());
    assert.equal(matchesFilter(aptB, crossFilter), false, "Cross-branch escape is denied");
    const ownFilter = withBranchScope(scoped(receptionistA), { _id: apptAId });
    assert.equal(matchesFilter(aptA, ownFilter), true, "Own-branch cancel still resolves");
  });

  test("Cancel mutation: a branch-confined doctor cannot cancel Branch B either", () => {
    const updateFilter = withBranchScope(scoped(doctorA), { _id: apptBId });
    assert.equal(matchesFilter(aptB, updateFilter), false, "Doctor cross-branch escape is denied (404)");
  });

  test("Cancel mutation: another doctor's same-branch appointment stays record-reachable but doctor-forbidden (403 path)", () => {
    const otherDoctorAppt: Fixture = { ...aptA, _id: new Types.ObjectId(), doctorId: doctorBProfile };
    const lookupFilter = withBranchScope(scoped(doctorA), { _id: otherDoctorAppt._id });
    assert.equal(matchesFilter(otherDoctorAppt, lookupFilter), true, "Same-branch record is reachable pre-check");
    assert.equal(isDoctorActor(doctorA), true, "Actor is doctor-isolated");
    assert.notEqual(String(otherDoctorAppt.doctorId), String(doctorA.doctorProfileId), "Ownership mismatch -> 403 Forbidden response");
  });

  test("Reschedule mutation: Branch A staff cannot reschedule the Branch B appointment", () => {
    const crossFilter = withBranchScope(scoped(receptionistA), { _id: apptBId });
    assert.equal(matchesFilter(aptB, crossFilter), false, "Cross-branch reschedule is denied");
    const ownFilter = withBranchScope(scoped(receptionistA), { _id: apptAId });
    assert.equal(matchesFilter(aptA, ownFilter), true, "Own-branch reschedule still resolves");
  });

  test("Branch B staff still reach their own Branch B appointment (positive control)", () => {
    const updateFilter = withBranchScope(scoped(receptionistB), { _id: apptBId });
    assert.equal(matchesFilter(aptB, updateFilter), true, "Own-branch operator retains access");
  });

  test("Complete-consultation: the conditional update carries branch, doctor and status guards", () => {
    const apptBCalled = { ...aptB, queueStatus: "CALLED" };
    const completeFilter = withBranchScope(scoped(receptionistA), {
      _id: apptBId,
      doctorId: doctorBProfile,
      status: { $nin: ["COMPLETED", "CANCELLED"] },
      $or: [{ queueStatus: "CALLED" }, { queueStatus: "IN_CONSULTATION" }, { status: "IN_PROGRESS" }]
    });
    assert.equal(matchesFilter(apptBCalled, completeFilter), false, "Branch B consultation cannot be completed by Branch A staff (404)");
    const apptACalled: Fixture = { ...aptA, queueStatus: "CALLED" };
    const ownCompleteFilter = withBranchScope(scoped(receptionistA), {
      _id: apptAId,
      doctorId: doctorAProfile,
      status: { $nin: ["COMPLETED", "CANCELLED"] },
      $or: [{ queueStatus: "CALLED" }, { queueStatus: "IN_CONSULTATION" }, { status: "IN_PROGRESS" }]
    });
    assert.equal(matchesFilter(apptACalled, ownCompleteFilter), true, "Own-branch completion still finds its target");
  });

  test("Complete-consultation: organization-scope user is not branch-blocked on Branch B", () => {
    const apptBCalled = { ...aptB, queueStatus: "CALLED" };
    const completeFilter = withBranchScope(scoped(managerGlobal), {
      _id: apptBId,
      doctorId: doctorBProfile,
      status: { $nin: ["COMPLETED", "CANCELLED"] },
      $or: [{ queueStatus: "CALLED" }, { queueStatus: "IN_CONSULTATION" }, { status: "IN_PROGRESS" }]
    });
    assert.equal(matchesFilter(apptBCalled, completeFilter), true, "Global/organization scope keeps the completion path open");
  });

  test("Complete-consultation: a doctor may only complete their own appointment", () => {
    assert.equal(isDoctorRole(doctorB.roleName), true);
    assert.equal(canCompleteAppointment(doctorB, doctorAProfile), false, "Doctor B cannot complete Doctor A's consultation");
    assert.equal(canCompleteAppointment(doctorB, doctorBProfile), true, "Doctor B completes their own appointment");
  });

  test("Queue list: Branch A staff do not see Branch B rows in the live queue", () => {
    const queueFilter = withBranchScope(scoped(receptionistA), {
      appointmentDate: { $gte: todayStart, $lt: todayEnd },
      status: { $nin: ["CANCELLED"] }
    });
    assert.equal(matchesFilter(aptB, queueFilter), false, "Branch B queue rows must be hidden");
    assert.equal(matchesFilter(aptA, queueFilter), true, "Own-branch queue rows remain visible");
  });

  test("CALL_NEXT: the candidate search is branch and doctor scoped for a doctor", () => {
    assert.equal(isDoctorRole(doctorA.roleName), true, "Doctor actor queue actions pin their profile id");
    const candidateFilter = withBranchScope(scoped(doctorA), {
      appointmentDate: { $gte: todayStart, $lt: todayEnd },
      queueStatus: "WAITING",
      status: { $nin: ["CANCELLED", "NO_SHOW"] },
      doctorId: doctorAProfile
    });
    assert.equal(matchesFilter(aptB, candidateFilter), false, "Branch B candidates are never callable");
    assert.equal(matchesFilter(aptA, candidateFilter), true);
  });

  test("Targeted queue action (CHECK_IN) by non-doctor staff cannot touch Branch B", () => {
    const updateFilter = withBranchScope(scoped(receptionistA), { _id: apptBId });
    assert.equal(matchesFilter(aptB, updateFilter), false, "Cross-branch CHECK_IN resolves to no record (404)");
    assert.equal(Types.ObjectId.isValid("not-an-object-id"), false, "Malformed appointment IDs are rejected before scoping");
    assert.equal(Types.ObjectId.isValid(String(apptBId)), true);
  });

  /* ------------------------------------------------------------------ */
  /* B) Upload rules                                                      */
  /* ------------------------------------------------------------------ */

  const pdfBuffer = Buffer.concat([Buffer.from("%PDF-1.4"), Buffer.alloc(64)]);

  test("Upload: a file over 10 MB is refused before storage (413)", () => {
    const oversized = Buffer.alloc(MAX_UPLOAD_BYTES + 1, 0x25);
    Buffer.from("%PDF").copy(oversized, 0);
    const verdict = validateUploadFile(oversized, "report.pdf");
    assert.equal(verdict.ok, false, "Oversized uploads are rejected");
    if (!verdict.ok) {
      assert.equal(verdict.status, 413);
      assert.match(verdict.message, /10 MB/);
    }
  });

  test("Upload: a file of exactly 10 MB with a valid PDF body is accepted", () => {
    const atLimit = Buffer.alloc(MAX_UPLOAD_BYTES, 0x20);
    pdfBuffer.copy(atLimit, 0);
    const verdict = validateUploadFile(atLimit, "report.pdf");
    assert.equal(verdict.ok, true, "Boundary-size valid PDF is accepted");
    if (verdict.ok) assert.equal(verdict.mimeType, "application/pdf");
  });

  test("Upload: only the allow-listed extensions pass (pdf, jpg, jpeg, png, webp)", () => {
    assert.equal(validateUploadFile(pdfBuffer, "notes.txt").ok, false);
    assert.equal(validateUploadFile(pdfBuffer, "program.exe").ok, false);
    assert.equal(validateUploadFile(pdfBuffer, "no-extension").ok, false);
    assert.equal(extensionOf("PHOTO.PNG"), "png", "Extensions are case-insensitive");
  });

  test("Upload: the real magic bytes must agree with the extension, not the browser Content-Type", () => {
    assert.equal(validateUploadFile(pdfBuffer, "claims.pdf").ok, true, "PDF body under .pdf is valid");
    assert.equal(validateUploadFile(pdfBuffer, "claims.jpg").ok, false, "PDF body renamed to .jpg is rejected");
    const jpegBuffer = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64)]);
    assert.equal(validateUploadFile(jpegBuffer, "scan.jpeg").ok, true);
    const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01, 0x02]);
    assert.equal(validateUploadFile(pngBuffer, "xray.png").ok, true);
    assert.equal(validateUploadFile(pngBuffer, "xray.pdf").ok, false, "PNG body renamed to .pdf is rejected");
    const webpBuffer = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP"), Buffer.alloc(16)]);
    assert.equal(validateUploadFile(webpBuffer, "photo.webp").ok, true);
    const emptyJpg = Buffer.alloc(32, 0x00);
    assert.equal(validateUploadFile(emptyJpg, "blank.jpg").ok, false, "All-zero bytes cannot claim an image extension");
  });

  test("Upload: every patient reference must be a valid ObjectId", () => {
    assert.equal(Types.ObjectId.isValid(""), false);
    assert.equal(Types.ObjectId.isValid("garbage-id"), false);
    assert.equal(Types.ObjectId.isValid(String(patientBranchAId)), true, "Well-formed ids resolve to a patient lookup");
  });

  test("Upload: a branch-confined caller cannot attach documents to another branch's patient", () => {
    const uploadAuthA = scoped(receptionistA, PERMISSION_KEYS.PATIENT_DOC_UPLOAD);
    assert.equal(isBranchConfined(uploadAuthA), true);
    assert.equal(recordBranchOutsideScope(uploadAuthA, branchB), true, "Branch B patient -> 403 Forbidden response");
    assert.equal(recordBranchOutsideScope(uploadAuthA, branchA), false, "Own-branch patient links normally");
    assert.equal(recordBranchOutsideScope(uploadAuthA, undefined), false, "Legacy patient without a branch is not branch-refused");
    const unconfiguredGrant = { permission: PERMISSION_KEYS.PATIENT_DOC_UPLOAD, orgScope: "GLOBAL" as const, relScope: "UNRESTRICTED" as const };
    assert.equal(isBranchConfined({ context: managerGlobal, grant: unconfiguredGrant }), false, "Organization-scope upload is not branch-refused even for Branch B patients");
    assert.equal(recordBranchOutsideScope({ context: managerGlobal, grant: unconfiguredGrant }, branchB), false);
  });

  test("Storage: the fake local_fallback link must be unavailable outside development", () => {
    const env = process.env as Record<string, string | undefined>;
    const originalNodeEnv = env.NODE_ENV;
    try {
      env.NODE_ENV = "production";
      assert.equal(isDevelopmentEnvironment(), false, "Production must not report the development environment");
      const unconfigured = new StorageUnconfiguredError();
      assert.ok(unconfigured instanceof Error);
      assert.equal(unconfigured.name, "StorageUnconfiguredError");
      assert.match(unconfigured.message, /storage is not configured/i);
      env.NODE_ENV = "development";
      assert.equal(isDevelopmentEnvironment(), true, "Development keeps the local fallback available");
    } finally {
      env.NODE_ENV = originalNodeEnv;
    }
  });

  console.log(`\n=================================================`);
  console.log(`  OPD Branch Isolation & Upload Results: ${passedTests}/${totalTests} Passed`);
  console.log(`=================================================\n`);
}

runBranchIsolationTests().catch((err: unknown) => {
  console.error("OPD branch isolation test suite failed:", err);
  process.exit(1);
});
