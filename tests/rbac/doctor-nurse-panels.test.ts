import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP_ROOT = path.join(process.cwd(), "src", "app", "(dashboard)");

function readPage(relativePath: string): string {
  return fs.readFileSync(path.join(APP_ROOT, relativePath, "page.tsx"), "utf8");
}

function run() {
  let passed = 0;
  let total = 0;
  const test = (name: string, check: () => void) => {
    total++;
    check();
    passed++;
    console.log(`  ✓ ${name}`);
  };

  const doctor = readPage(path.join("clinical", "dashboard"));
  const nurse = readPage(path.join("nursing", "dashboard"));

  test("doctor dashboard loads today's queue through the protected API client", () => {
    assert.ok(doctor.includes('apiFetch<ApiEnvelope<QueueAppointment[]>>("/api/appointments/queue")'));
    assert.ok(doctor.includes("Pending / Waiting"));
    assert.ok(doctor.includes("Completed"));
  });

  test("doctor dashboard links queue patients to existing Patient 360 and consultation screens", () => {
    assert.ok(doctor.includes("/patients/profile?id=${patientId}"));
    assert.ok(doctor.includes("/clinical/consultations?patientId=${patientId}"));
    assert.ok(doctor.includes("allergy alerts"));
  });

  for (const [label, route] of [
    ["medical history", "/clinical/history"],
    ["prescriptions", "/clinical/prescriptions"],
    ["laboratory orders", "/lab/orders"],
    ["radiology orders", "/radiology/orders"],
    ["follow-up", "/clinical/follow-up"]
  ]) {
    test(`doctor dashboard exposes existing ${label} workflow`, () => {
      assert.ok(doctor.includes(route));
    });
  }

  test("nurse dashboard loads inpatient, task, medication and summary records through the protected API client", () => {
    for (const endpoint of [
      "/api/nursing/stats",
      "/api/nursing/my-patients",
      "/api/nursing/tasks",
      "/api/nursing/medications"
    ]) assert.ok(nurse.includes(endpoint));
    assert.ok(nurse.includes("apiFetch<NursingResponse"));
  });

  for (const [label, route] of [
    ["vitals", "/nursing/vitals"],
    ["care plans", "/nursing/plans"],
    ["nursing tasks", "/nursing/tasks"],
    ["medication records", "/nursing/medications"],
    ["nursing notes", "/nursing/notes"],
    ["intake and output", "/nursing/intake-output"],
    ["shift handover", "/nursing/handover"]
  ]) {
    test(`nurse dashboard links to existing ${label} workflow`, () => {
      assert.ok(nurse.includes(route));
    });
  }

  test("nurse dashboard shows inpatient allergy alerts and a Patient 360 link", () => {
    assert.ok(nurse.includes("Allergy Alerts"));
    assert.ok(nurse.includes("p.allergies"));
    assert.ok(nurse.includes("/patients/profile?id=${p.patientId}"));
  });

  test("both dashboards render explicit 401/403 and load-failure notices", () => {
    assert.ok(doctor.includes("<ApiErrorNotice"));
    assert.ok(nurse.includes("<ApiErrorNotice"));
  });

  console.log(`\n  Doctor/Nurse Panel Workflow Contracts: ${passed}/${total} Passed\n`);
}

try {
  run();
} catch (error) {
  console.error(error);
  process.exit(1);
}
