import assert from "node:assert/strict";
import { expandDoseTimes, MAX_DOSES_PER_ORDER, isDoseDue, dueInLabel, FREQUENCY_SUGGESTIONS } from "@/lib/medication-schedule";
import { flagVitalForReview } from "@/lib/vital-flags";
import { validateOrderTimes } from "@/models/medication-order.model";
import { canTransitionCareTask } from "@/models/care-task.model";
import { defaultPermissionsFor } from "@/lib/rbac/default-permissions";
import { permissionsForRoute } from "@/lib/rbac/permissions.config";

/**
 * Ward rounds test suite: timed medication orders, dose expansion,
 * instruction transitions and the rounds permission wiring.
 */
async function runRoundsTests() {
  console.log("=================================================");
  console.log("  Running Ward Rounds Test Suite");
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

  test("BD order for 3 days expands to 6 clock-time doses", () => {
    const doses = expandDoseTimes(new Date("2026-01-05T00:00:00"), 3, ["08:00", "20:00"], "BD");
    assert.equal(doses.length, 6);
    assert.equal(doses[0].getHours(), 8);
    assert.equal(doses[1].getHours(), 20);
    assert.equal(doses[2].getDate(), 6);
  });

  test("STAT creates exactly one immediate dose", () => {
    const now = new Date("2026-01-05T10:30:00");
    const doses = expandDoseTimes(now, 5, [], "STAT", now);
    assert.equal(doses.length, 1);
    assert.equal(doses[0].getTime(), now.getTime());
  });

  test("PRN creates no scheduled doses", () => {
    assert.deepEqual(expandDoseTimes(new Date(), 7, [], "PRN"), []);
  });

  test("Expansion is capped so an order cannot flood the eMAR", () => {
    const doses = expandDoseTimes(new Date(), 30, ["00:00", "06:00", "12:00", "18:00", "23:00"], "QID");
    assert.ok(doses.length <= MAX_DOSES_PER_ORDER, `Uncapped expansion: ${doses.length}`);
  });

  test("Order times require HH:MM clock times for scheduled frequencies", () => {
    assert.equal(validateOrderTimes("BD", []), "At least one clock time is required for scheduled frequencies");
    assert.ok((validateOrderTimes("BD", ["8am"]) ?? "").includes("Invalid time"));
    assert.equal(validateOrderTimes("BD", ["08:00", "20:00"]), null);
    assert.equal(validateOrderTimes("STAT", []), null);
    assert.equal(validateOrderTimes("PRN", []), null);
  });

  test("Every frequency ships a nurse-readable default time suggestion", () => {
    for (const frequency of ["STAT", "OD", "BD", "TDS", "QID", "Q6H", "Q8H", "Q12H", "HS", "PRN"]) {
      assert.ok(Array.isArray(FREQUENCY_SUGGESTIONS[frequency]), `No suggestion for ${frequency}`);
    }
    assert.deepEqual(FREQUENCY_SUGGESTIONS.BD, ["08:00", "20:00"]);
  });

  test("A dose cannot be given before its scheduled time, only at or after", () => {
    assert.equal(isDoseDue("2026-01-05T15:00:00", "2026-01-05T14:59:00"), false);
    assert.equal(isDoseDue("2026-01-05T15:00:00", "2026-01-05T15:00:00"), true);
    assert.equal(isDoseDue("2026-01-05T15:00:00", "2026-01-05T16:20:00"), true);
    assert.equal(dueInLabel("2026-01-05T15:00:00", "2026-01-05T16:00:00"), "due now");
    assert.equal(dueInLabel("2026-01-05T16:00:00", "2026-01-05T15:00:00"), "due in 1h 0m");
  });
  test("Critical vitals flag for doctor review, normal ones do not", () => {
    assert.equal(flagVitalForReview({ oxygenSaturation: 89 }), "CRITICAL");
    assert.equal(flagVitalForReview({ heartRate: 130 }), "CRITICAL");
    assert.equal(flagVitalForReview({ temperature: 39.5 }), "CRITICAL");
    assert.equal(flagVitalForReview({ oxygenSaturation: 93 }), "WATCH");
    assert.equal(flagVitalForReview({ heartRate: 76, oxygenSaturation: 98, temperature: 36.8 }), "NORMAL");
    assert.equal(flagVitalForReview({}), "NORMAL");
  });
  test("Instructions move NEW -> ACKNOWLEDGED -> IN_PROGRESS -> COMPLETED, never backwards", () => {
    assert.ok(canTransitionCareTask("NEW", "ACKNOWLEDGED"));
    assert.ok(canTransitionCareTask("ACKNOWLEDGED", "IN_PROGRESS"));
    assert.ok(canTransitionCareTask("IN_PROGRESS", "COMPLETED"));
    assert.equal(canTransitionCareTask("NEW", "COMPLETED"), false);
    assert.equal(canTransitionCareTask("COMPLETED", "NEW"), false);
    assert.ok(canTransitionCareTask("NEW", "CANCELLED"));
  });

  test("Doctor defaults open Ward Rounds for write, nurse for read", () => {
    const doctor = defaultPermissionsFor("DOCTOR");
    assert.ok(doctor.includes("clinical.rounds:view"), "Doctor cannot open Ward Rounds");
    assert.ok(doctor.includes("clinical.rounds:create"), "Doctor cannot record visits");
    assert.ok(doctor.includes("clinical.rounds:update"), "Doctor cannot discontinue orders");
    const nurse = defaultPermissionsFor("NURSE");
    assert.ok(nurse.includes("clinical.rounds:view"), "Nurse cannot read round history");
    assert.ok(!nurse.includes("clinical.rounds:create"), "Nurse must not prescribe orders");
  });

  test("Ward Rounds page and order APIs resolve through the catalogue", () => {
    assert.ok(permissionsForRoute("/clinical/rounds").includes("clinical.rounds:view"));
    assert.ok(permissionsForRoute("/clinical/rounds").includes("clinical.rounds:create"));
  });

  console.log(`\n=================================================`);
  console.log(`  Ward Rounds Results: ${passedTests}/${totalTests} Passed (100%)`);
  console.log(`=================================================\n`);
}

runRoundsTests().catch((err: unknown) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
