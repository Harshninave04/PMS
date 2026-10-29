import assert from "node:assert/strict";
import { calculateHospitalDay, hospitalDayKey } from "@/lib/hospital-time";

const timeZone = "Asia/Kolkata";

assert.deepEqual(
  calculateHospitalDay(
    new Date("2026-10-10T12:00:00.000Z"),
    new Date("2026-10-13T12:00:00.000Z"),
    timeZone,
  ),
  { day: 4, admissionDate: "2026-10-10", hospitalDate: "2026-10-13" },
);

assert.equal(
  calculateHospitalDay(
    new Date("2026-10-10T12:00:00.000Z"),
    new Date("2026-10-10T18:29:59.999Z"),
    timeZone,
  ).day,
  1,
);

assert.equal(hospitalDayKey(new Date("2026-10-10T18:29:59.999Z"), timeZone), "2026-10-10");
assert.equal(hospitalDayKey(new Date("2026-10-10T18:30:00.000Z"), timeZone), "2026-10-11");

assert.equal(
  calculateHospitalDay(
    new Date("2026-10-10T12:00:00.000Z"),
    new Date("2026-10-17T12:00:00.000Z"),
    timeZone,
  ).day,
  8,
);

assert.throws(
  () => calculateHospitalDay(new Date("invalid"), new Date("2026-10-13T12:00:00.000Z"), timeZone),
  RangeError,
);
assert.throws(
  () => calculateHospitalDay(new Date("2026-10-13T12:00:00.000Z"), new Date("2026-10-12T12:00:00.000Z"), timeZone),
  /before the admission date/,
);

console.log("Nursing hospital-day tests passed");
