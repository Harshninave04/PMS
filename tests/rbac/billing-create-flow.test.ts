import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Types } from "mongoose";
import { validateAndRecomputeTotals } from "@/controllers/invoice.controller";
import {
  billingNursingDay,
  buildClinicalOrderRows,
  firstPositiveRate,
  groupDoctorRounds,
} from "@/services/billing-flow.service";
import { buildManualRateAuditRows } from "@/lib/invoice-rate-audit";
import { nurseNotesForbiddenStatus } from "@/lib/nurse-notes-access";
import type { CreateInvoiceDto } from "@/dto/invoice.dto";

function invoice(items: unknown[], extra: Record<string, unknown> = {}) {
  return {
    patientId: new Types.ObjectId().toString(),
    items,
    totalAmount: 999999,
    discount: 0,
    taxAmount: 999,
    finalAmount: 999999,
    ...extra,
  } as unknown as CreateInvoiceDto;
}

assert.equal(firstPositiveRate(125, 90), 125, "bed override takes priority over ward rate");
assert.equal(firstPositiveRate(0, -1, 90), 90, "invalid overrides are ignored and the ward rate is used");
assert.equal(firstPositiveRate(null, undefined, 0), undefined, "no rate is invented when all masters are missing");

const missingServiceRate = buildClinicalOrderRows(
  [{ orderType: "Lab", title: "CBC" }],
  new Map(),
);
assert.equal(missingServiceRate.length, 1);
assert.equal(missingServiceRate[0].price, null);
assert.equal(missingServiceRate[0].needsManualRate, true);
assert.match(missingServiceRate[0].rateHint || "", /Services/);

const doctorA = new Types.ObjectId();
const doctorB = new Types.ObjectId();
const groupedRounds = groupDoctorRounds([
  { doctor: doctorA, visitedAt: new Date("2026-10-10T10:00:00Z") },
  { doctor: doctorA, visitedAt: new Date("2026-10-11T10:00:00Z") },
  { doctor: doctorB, visitedAt: new Date("2026-10-11T11:00:00Z") },
]);
assert.equal(groupedRounds.size, 2, "one group is produced per doctor ID");
assert.equal(groupedRounds.get(doctorA.toString())?.count, 2);

assert.equal(
  billingNursingDay(new Date("2026-10-10T18:30:00.000Z"), new Date("2026-10-11T18:29:59.999Z"), "Asia/Kolkata"),
  1,
  "a recorded timestamp before the next local midnight remains on hospital Day 1",
);
assert.equal(
  billingNursingDay(new Date("2026-10-10T18:30:00.000Z"), new Date("2026-10-11T18:30:00.000Z"), "Asia/Kolkata"),
  2,
);

const totalsInput = invoice([
  { name: "CBC", price: 100, quantity: 2, discount: 0, tax: 10, total: 1 },
], { discount: 20, discountReason: "approved adjustment" });
const totalsResult = validateAndRecomputeTotals(totalsInput);
assert.deepEqual(totalsResult, { ok: true });
assert.equal(totalsInput.totalAmount, 200);
assert.equal(totalsInput.taxAmount, 20);
assert.equal(totalsInput.finalAmount, 200);
assert.equal(totalsInput.items[0].total, 220);

for (const price of [0, null, -1]) {
  const result = validateAndRecomputeTotals(invoice([
    { name: "Charge", price, quantity: 1, discount: 0, tax: 0, total: 1 },
  ]));
  assert.equal(result.ok, false, `price ${String(price)} is rejected`);
}
assert.equal(validateAndRecomputeTotals(invoice([
  { name: "Charge", price: 1, quantity: 0, discount: 0, tax: 0, total: 0 },
])).ok, false, "zero quantity is rejected");
assert.equal(validateAndRecomputeTotals(invoice([
  { name: "Charge", price: 1, quantity: 1, discount: 0, tax: 0, total: 1, nursingSupplyId: "supply-a" },
  { name: "Charge", price: 1, quantity: 1, discount: 0, tax: 0, total: 1, nursingSupplyId: "supply-a" },
])).ok, false, "a repeated nursingSupplyId is rejected");
assert.equal(validateAndRecomputeTotals(invoice([
  { name: "Charge", price: 10, quantity: 1, discount: 0, tax: 0, total: 10 },
], { discount: 10 })).ok, false, "a zero final amount is rejected");
assert.equal(validateAndRecomputeTotals(invoice([
  { name: "Charge", price: 10, quantity: 1, discount: 0, tax: 0, total: 10 },
], { discount: 1 })).ok, false, "a discount without a reason is rejected");

const manualAuditAt = new Date("2026-10-31T12:00:00.000Z");
const manualAudit = buildManualRateAuditRows("user-1", "invoice-1", [
  { name: "Manual bed", price: 75, manualRate: true },
  { name: "Master service", price: 25, manualRate: false },
], manualAuditAt);
assert.deepEqual(manualAudit, [{
  userId: "user-1",
  invoiceId: "invoice-1",
  lineIndex: 0,
  lineName: "Manual bed",
  rate: 75,
  createdAt: manualAuditAt,
}]);

assert.equal(nurseNotesForbiddenStatus("ACCOUNTANT"), 403);
assert.equal(nurseNotesForbiddenStatus("accountant"), 403);
assert.equal(nurseNotesForbiddenStatus("NURSE"), null);
const draftSource = readFileSync("src/services/billing-flow.service.ts", "utf8");
assert.doesNotMatch(draftSource, /\bnurseNotes\s*:/, "billing draft does not expose nurseNotes");
assert.doesNotMatch(draftSource, /\bnurseNoteCount\s*:/, "billing queue does not expose nurseNoteCount");

console.log("Billing create-flow tests passed");
