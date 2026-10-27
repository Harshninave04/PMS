# Billing & Discharge Flow — Implementation Plan (Agent Handoff Document)

Status: IN PROGRESS (Phase 1 + 2 verified; Phase 3 implemented — see Section 13)
Last updated: 2026-10-24

Purpose of this file: any new agent/sesssion picks up the plan from here WITHOUT re-analyzing the
codebase from scratch. Follow build order in Section 9. Do not delete sections; append progress.

---

## 1. Goal

Redesign billing as an inter-departmental **discharge-to-bill pipeline** instead of manual entry:

```
Doctor flags assigned patient for discharge
      |
Nurse runs the discharge process (reviews every detail the accountant will need)
      |
Nurse hits "Send to Billing" -> case lands in the Accountant's Create Bill workspace
      |
Accountant finalizes the bill (bed charges, doctor charges, pharmacy, procedures, + custom rows)
      |
Invoice + payment settlement through the EXISTING finance APIs (/api/invoice, /api/payment)
```

End state for the Accountant: one workspace where all transactions for the flagged patient
arrive pre-computed (hospital bill, bed charges, doctor charges, medicines, care/procedures)
and where the accountant can add/edit rows before settling.

---

## 2. Target Flow (authoritative sequence — user-confirmed)

1. **Doctor** flags an assigned patient as *Discharge* (currently does not exist).
2. **Nurse** is presented the discharge process for that case. The nurse screen must show
   every detail the accountant will require (admission, room/bed + category, duration of stay,
   assigned doctors, consultations/visits performed, care tasks executed, medication orders and
   dispenses, prescriptions). Nurse reviews, then hits a button (name TBD, e.g.
   "Send to Billing / Finalize for Billing") that hands the case to the accountant.
3. **Accountant** opens the Create Bill workspace (`/finance/invoice/create`, currently a
   placeholder) and sees the case with auto-drafted billable rows:
   - bed charges (room/bed category x days),
   - doctor charges (consultations/procedures),
   - pharmacy charges (dispensed items),
   - care/procedure charges,
   - plus free rows the accountant can add manually ("add few more rows if required").
4. Settlement reuses current APIs: `POST /api/invoice` (+ `POST /api/payment` for instant
   collection, or leave UNPAID/credit invoice). Status then flows into the existing
   Bills / Payments / Outstanding screens unchanged.

---

## 3. Current Pending Items (user's list, verbatim intent)

- [x] Doctor cannot flag a patient for discharge — DONE (Phase 1, see Section 11).
- [x] Nurse has no discharge process — DONE (Phase 2, see Section 12): flagged cases carry a
      primary "Discharge" action on `/nursing/patients`, opening the review panel with
      everything the accountant needs plus a nurse note thread and the Send/Recall controls.
- [x] Accountant workspace — DONE (Phase 3, see Section 13): `/finance/invoice/create` consumes
      the billing queue, auto-drafts bed/nursing + doctor rounds + med rows, supports manual
      invoices, settles via the existing invoice/payment APIs (invoice-first, UNPAID), and the
      Payments ledger + Outstanding dues pages are rebuilt and wired.

---

## 4. What Was Wiped vs What Was Kept

Wiped (temporary; recover from git history if the reference UI is ever needed):

- `src/app/(dashboard)/finance/invoice/create/page.tsx` — the full 748-line "Create Patient
  Invoice" terminal (hardcoded COMMON_SERVICES presets, client-side GST math, instant-payment
  toggle) was replaced by a placeholder rendering only "Create bill".
- `src/app/(dashboard)/finance/payments/page.tsx` — the 301-line "Payments Ledger"
  (receipt audit trail, print modal) was replaced by a placeholder rendering only "Payments".
- `src/app/(dashboard)/finance/outstanding/page.tsx` — the 447-line "Outstanding Payments &
  Aging Analysis" screen (0-30/31-60/61-90/90+ buckets, quick-collect modal, reminder toast)
  was replaced by a placeholder rendering only "Outstanding dues".

(UPDATE 2026-10-24: all three wiped screens are rebuilt in Phase 3 — Create Bill is now the
discharge-driven workspace; Payments and Outstanding are rebuilt leaner (receipt ledger +
quick collect/aging). The manuals of the old reference UI live in git history.)

Kept — everything else in the billing stack is REQUIRED and untouched:

| Layer | Files |
|---|---|
| Models | `src/models/invoice.model.ts`, `src/models/payment.model.ts` |
| DTOs | `src/dto/invoice.dto.ts`, `src/dto/payment.dto.ts` |
| Repositories | `src/repositories/invoice.repository.ts` (payment.service talks to models directly) |
| Services | `src/services/invoice.service.ts`, `src/services/payment.service.ts` (auto-updates invoice paid/balance/status), `src/services/finance.service.ts` (stats + aging buckets) |
| Controllers | `src/controllers/invoice.controller.ts`, `payment.controller.ts`, `finance.controller.ts` |
| Routes | `/api/invoice`, `/api/invoice/[id]`, `/api/payment`, `/api/payment/[id]`, `/api/finance/stats`, `/api/finance/outstanding` |
| Pages | `finance/page.tsx` (hub), `finance/invoices` (list + view/print + "Record Payment" modal), `reports/billing` |
| Menu | `src/lib/menu-seed.ts` Billing group: `/finance` + Create Bill/Bills/Payments/Outstanding — do NOT delete |
| APIs | All wrapped-in invoice/payment/finance endpoints stay live — `invoices/page.tsx` still uses `POST /api/payment` for partial collections and cancellation is `PUT /api/invoice/[id]`; the placeholders only hide their UI sections |

Inbound links to the placeholder that must keep working:
`finance/page.tsx` ("Create Invoice" workstation), `invoices/page.tsx` header button,
`src/lib/rbac/dashboard-profiles.ts` quick actions ("Create Bill" for administration + finance profiles).

---

## 5. Codebase Pointers (verified — no need to re-explore)

RBAC / permissions:

- Permission keys SOL-style: `src/lib/rbac/permissions.ts` (`billing.invoice.*`, `billing.payment.*`).
- Sub-item permission catalogue: `src/lib/rbac/permissions.config.ts` (modules: `billing` sub-item `create|invoices|payments|outstanding`, plus `reports.billing`).
- Route guard registrations: `src/lib/rbac/route-permissions.ts` (~lines 224-235 for billing). Any NEW/CHANGED endpoint must be registered there.
- Two-layer guard pattern used by every route: route-level `requirePermission(request, "billing.create:create")` in `route.ts`, plus controller-level `authorizeRequest(request, PERMISSION_KEYS.X, "Resource")`.
- Role defaults: `src/lib/rbac/default-permissions.ts` — ACCOUNTANT block (dashboard view, billing CRUD on create/invoices/payments/outstanding, reports.billing view, patients.list view, admissions.current view); RECEPTIONIST holds a billing subset (`billing create view/create`, `invoices view`, `payments view/create`).
- Legacy role access (module-keyed): `src/lib/rbac/roles.ts` ROLE_ACCESS — Accountant: patient view + full billing + reports.
- Sidebar visibility is permission-driven: `src/lib/menu-data.ts filterMenusByPermissions` shows a sub-item when the role holds its `view` OR `create`. Hiding Dashboard/Patients/IPD/Reports for the Accountant = trim the ACCOUNTANT block in `default-permissions.ts`. No page/menu deletions needed.

Related modules tapped by the new flow:

- Admissions/discharge: `src/app/api/admission/discharge`, `src/services/admission.service.ts`, `src/models/admission.model.ts` (assignedDoctors, assignedNurses, beds, doctorId...).
- Doctor/OPD visits: `src/app/api/appointments/*`, `src/services/appointment.service.ts`, `src/controllers/visit.controller.ts`.
- Nurse/care: `src/app/api/care-tasks`, `src/services/care-task.service.ts`, `src/app/api/nursing/medications` (`medication-order.service.ts`), `src/models/pharmacy-dispense.model.ts` for dispensed charges.
- Patient lookup used by billing: `GET /api/patient` (name/uhid/age/gender/contact/bloodGroup).
- Staff/accountant access to admissions: services `visit.service.ts` / `care-task.service.ts` / `medication-order.service.ts` include `role === "ACCOUNTANT"` branch-wide OR-gates (revisit when the flow changes).

---

## 6. Invoice / Payment Data Model (additive-only suggestions)

Existing Invoice: patientId, invoiceNumber, department(string), items[{name, price, quantity,
discount(flat ₹), tax(%), total}], totalAmount, discount, taxAmount, finalAmount, paidAmount,
balanceAmount, paymentMethod, dueDate, notes, status(PAID/UNPAID/PARTIALLY_PAID/CANCELLED), branchId.

Existing Payment: invoiceId, patientId, amount, method(CASH/CARD/UPI/BANK_TRANSFER/CHEQUE/INSURANCE_TPA),
transactionId, receiptNumber, cashierName, notes, date, branchId.

Missing for the new flow (add later, keep additive so old records stay valid):

- `admissionId` / `visitId` / source refs (`sourceType: OPD|IPD|PHARMACY|CARE`). Today NO module
  links to invoices — billing is 100% manual.
- `createdBy` (accountant user), discharge/billing-request metadata.
- A "billing request" or AWAITING_BILLING state on Admission to carry the nurse->accountant handoff
  (or a dedicated BillingRequest document — decide in Phase 3).

---

## 7. Known Defects To Fix While Implementing

1. **Instant-collect double count (data corruption):** the old create page saved the invoice with
   `paidAmount = finalAmount, status = PAID`, then `POST /api/payment` added the same amount again
   (`payment.service.ts:19-40`), leaving `paidAmount = 2 x finalAmount`. The new accountant
   workspace must either (a) save the invoice UNPAID and let the payment record do the ledger
   update, or (b) subtract before creating the payment.
   **FIXED in Phase 3** — option (a): the workspace always saves UNPAID and records any instant
   collection as a Payment afterwards; no earlier mutation of paidAmount happens.
2. Invoice/receipt numbers are 4-digit RANDOM codes (`INV-YYYYMM-####`) with no uniqueness —
   replace with a counter sequence (pattern already exists: `src/models/opd-token-counter.model.ts`).
   **FIXED in Phase 3** — `src/models/billing-counter.model.ts` + `src/lib/billing-numbers.ts`
   (`INV-YYYYMM-0001` / `REC-YYYYMM-0001`, atomic upsert `$inc`).
3. Invoice + payment creation is NOT atomic — wrap in a Mongo session/transaction
   (`src/lib/mongo-transaction-support.ts` exists, unused here).
   **MITIGATED in Phase 3 by design**: the invoice is created first (UNPAID), and only then is a
   payment recorded as a separate, idempotent ledger event — a crash between the two leaves an
   unpaid invoice, never a corrupted balance. Full session/transaction wiring stays open for a
   future pass.
4. "Send Reminder" on Outstanding is a client-side toast only (no notification exists).
   **STILL OPEN** — the rebuilt Outstanding page keeps the toast with an explanatory tooltip.

---

## 8. Branch / Scope Rules (do not break)

- Controllers force `branchId` from `auth.context.branchId` when orgScope is BRANCH — new queries
  must honor the same confinement (note: `finance.service.ts` stats/outstanding currently do NOT
  filter by branch).
- Totals have always been computed client-side and trusted by the controller — the accountant
  workspace may keep that contract, but recomputing server-side is safer.
- "Cancel invoice" is implemented as PUT `{status: "CANCELLED"}` (`invoices/page.tsx`), not DELETE.

---

## 9. Build Order (next agent: follow this sequence)

Phase 1 — Doctor flag for discharge [DONE 2026-10-24 — see Section 11]
  - Add a discharge-flag / pending-discharge state on Admission, gated to the assigned doctor.
  - Surface the flag action in the doctor's patient/admission UI.
  - Register any new endpoint in route-permissions.ts + controller using existing guard patterns.

Phase 2 — Nurse discharge process [DONE 2026-10-24 — see Section 12]
  - Nurse-facing screen assembling ALL accountant-required details (see Section 2 step 2 list).
  - Submit button transitions the case to AWAITING_BILLING (or creates a BillingRequest doc).
  - Register endpoint(s) + permissions.

Phase 3 — Accountant Create Bill workspace [DONE 2026-10-24 — see Section 13]
  - Consume pending billing requests; auto-draft rows: bed charges, doctor charges, pharmacy,
    care/procedures; support adding custom rows; keep GST/discount math.
  - Settle via POST /api/invoice (+ POST /api/payment), fixing defect 7.1 in the same change.
  - Trim Accountant default permissions if the "Billing only" sidebar is still wanted.
    (Not needed: the catalogue path is unchanged; permissions were registered only at route level.)

Verification after each phase:
- `npm run typecheck`
- `npm run lint`
- `npm test` (tests/rbac suite; some tests assert 3-way equalities: ALL_ROLES == dashboard
  profiles == DEMO_USERS; legacy role-map targets must remain inside ALL_ROLES — update
  tests atomically with any role/permission change).

---

## 11. Phase 1 — Doctor Discharge Flag (implemented 2026-10-24)

Design decision: boolean flag fields on Admission (NOT a new status value), so every
active-stay query (`ACTIVE_INPATIENT_STATUSES`, bed occupancy, duplicate-admission check,
transfer/cancel guards) keeps working untouched. The stay remains ADMITTED/TRANSFERRED
until the real discharge runs.

Backend:

- `src/interfaces/admission.interface.ts` + `src/models/admission.model.ts` — added
  `dischargeRequested`, `dischargeRequestedAt`, `dischargeRequestedBy` (ref User),
  `dischargeRequestNotes` + index `{ dischargeRequested: 1, status: 1 }` (Phase-2 nurse queue).
- `src/dto/admission.dto.ts` — `DischargeRequestDto { admissionId, notes? }`.
- `src/services/admission.service.ts` — `requestDischarge(id, notes, actorId)`
  (rejects non-active stays and double-flags) and `withdrawDischargeRequest(id)`
  (unsets flag fields).
- `src/controllers/admission.controller.ts` — `requestDischarge` + `withdrawDischargeRequest`
  with `dischargeFlagAccessError()`: only the stay's doctor (doctorId or assignedDoctors),
  ADMIN/super users, plus the existing BRANCH boundary check (copy of discharge rules).
- NEW `src/app/api/admission/discharge-request/route.ts` — POST flags, PUT withdraws.
  Route guard: `requirePermission(request, "clinical.rounds:update")`; controller guard:
  `authorizeRequest(PERMISSION_KEYS.CLINICAL_RECORD_UPDATE, "Admission")`.
- `src/lib/rbac/route-permissions.ts` — POST+PUT `/admission/discharge-request` registered
  with `clinical.rounds:update` (DOCTOR already holds it — no permission-catalogue change,
  no RBAC-test change). Controller blocks non-doctor roles even if granted later.
- `src/services/nursing.service.ts` — `getMyPatients` rows now carry `dischargeRequested`
  and `dischargeRequestedAt`, so the flag reaches the doctor dashboard + nurse screens.

Doctor UI: `src/app/(dashboard)/clinical/rounds/page.tsx`

- Header card: "Flag for discharge" button with optional note dialog; when flagged, an
  amber "Discharge flagged" badge + "Withdraw flag" button (dialog→PUT).
- Roster cards + mobile patient select get the amber "Flagged" badge / suffix.
- Buttons are shown only when the viewer is the stay's doctor
  (`canManageDischargeFlag` vs timeline `currentUserId`); other viewers only see
  the amber flag badge on the case.
- In-controller team check is the single authorization source; role/permission
  defaults stay as shipped.

Open for Phase 2: nurse discharge screen should filter `dischargeRequested: true` via a
nursing endpoint; `dischargeRequestedBy/Notes` feed the "why flagged" context.

---

## 12. Phase 2 — Nurse Discharge Process (implemented 2026-10-24)

Design decision: continue with boolean handoff fields on Admission (no BillingRequest
collection): `billingRequested/RequestedAt/RequestedBy`, `expectedDischargeAt`, and a
`dischargeNotes[]` nurse note thread. "Sent to billing" == `dischargeRequested &&
billingRequested`. The Section 9 "AWAITING_BILLING" label is superseded by these fields.

Backend:

- `src/interfaces/admission.interface.ts` (new `IDischargeNote`) + `src/models/admission.model.ts`
  — handoff fields + `dischargeNoteSchema { text, by ref User, at }`; Phase-1 index widened to
  `{ dischargeRequested: 1, billingRequested: 1, status: 1 }`.
- `src/dto/admission.dto.ts` — `BillingRequestDto { admissionId, expectedDischargeAt, notes? }`,
  `DischargeNoteDto { admissionId, text }`.
- `src/services/admission.service.ts` — `requestBilling` (requires an active stay with the
  doctor flag; rejects double-send; expected discharge date required; an optional note is
  pushed to the thread), `recallBilling` (unsets the handoff fields), `addDischargeNote`
  (active + flagged stay required). Doctor's `withdrawDischargeRequest` now returns 409 once
  `billingRequested` is set — nursing must recall the stay first.
- `src/controllers/admission.controller.ts` — `requestBilling` / `recallBilling` /
  `addDischargeNote` with `billingAccessError()`: only a nurse on the stay's `assignedNurses`
  (or ADMIN/super) plus the same BRANCH boundary check as Phase 1.
- NEW `src/app/api/admission/billing-request/route.ts` (POST send / PUT recall) and
  `src/app/api/admission/discharge-note/route.ts` (POST add note). Route guard:
  `requirePermission(request, "nursing.patients:update")`; controller guard:
  `authorizeRequest("nursing.patients:update", "Admission")` (raw sub-item key, same pattern
  the handover controller uses).
- `src/lib/rbac/route-permissions.ts` — all three routes registered under
  `nursing.patients:update` (NURSE already holds it — no permission-catalogue change).
- `src/services/nursing.service.ts` — `getMyPatients` rows now carry `billingRequested`,
  `billingRequestedAt`, `expectedDischargeAt`, `flaggedByName`, `dischargeRequestNotes`
  and `dischargeNotes[{ text, at, byName }]` (nested populates `dischargeRequestedBy`,
  `dischargeNotes.by`).

Nurse UI:

- `src/app/(dashboard)/nursing/page.tsx` — new "Discharge flags" dashboard card
  ("N of M flagged for discharge"), click-through to `/nursing/patients?flagged=1`.
- `src/app/(dashboard)/nursing/patients/page.tsx` — ACTIONS column: unflagged rows keep
  View handover / Transfer shift / Vitals / Meds; flagged rows show an amber "Flagged" pill
  (title: flagged-by + doctor note) or green "Sent to billing" pill, plus a primary
  "Discharge" button that always opens the panel (recalls are managed from there).
  Filter chip "Discharge flags (N)" + `?flagged=1` deep link.
- Discharge panel (dialog over the same page): doctor-request context, stay summary grid,
  allergy alert, expected-discharge datetime (required to send; disabled after send),
  ADVISORY review checklist — open doctor instructions, pending/withheld/refused doses,
  rounds recorded, latest vitals (warnings, not blocks) — the nurse note thread ("Add note"
  posts instantly; an unsent note is auto-saved before Send), "Send to billing", and
  "Recall from billing" once sent (until invoice, see Phase 3).
- The stay stays ADMITTED/TRANSFERRED: the bed frees only at the real discharge from the
  existing Admissions flow after billing (Phase 3 adds the invoice-existence link).

Open for Phase 3: accountant workspace consumes stays with
`dischargeRequested && billingRequested` (no invoice yet); invoice creation should lock
`dischargeNotes` and the doctor's withdraw check already blocks.

---

## 13. Phase 3 — Accountant Create Bill Workspace (implemented 2026-10-24)

Design decisions (user-confirmed):
- Rates: per-ward-category day rates + a flat doctor-round fee originally lived as editable
  DEFAULTS in `src/lib/billing-rates.ts` (removed 2026-10-27 — replaced by real rate fields:
  `Ward.bedRatePerDay`/`nursingRatePerDay` with optional per-bed overrides, configured in the
  Wards & Beds admin screens; doctor rounds bill from `Doctor.consultationFee` per doctor.
  Unset rates make the matching draft rows red and block save; no seed/backfill was run).
- Medications: rows are compiled from every eMAR dose recorded GIVEN (NursingMedication),
  grouped by drug+dosage; each row ships with price 0 (red, blocks save until priced).
- Settlement is INVOICE-FIRST: save UNPAID, then optionally collect payment (fixes defect 7.1 —
  no paidAmount is ever written alongside an immediate payment).
- Pay transparency stays in the existing endpoints; nothing about old records changes.

Backend:

- `src/models/billing-counter.model.ts` + `src/lib/billing-numbers.ts` — sequential
  `INV-YYYYMM-0001` / `REC-YYYYMM-0001` (defect 7.2). Wired into invoice.controller.createInvoice
  and payment.service.createPayment.
- `src/models/invoice.model.ts`, `invoice.interface.ts`, `dto/invoice.dto.ts` — additive
  `admissionId` link (Section 6 §"missing for the new flow"); validated + stored through the
  normal create path.
- NEW `src/services/billing-flow.service.ts` —
  `getBillingQueue(actor)` (stays with `dischargeRequested && billingRequested`, active,
  branch-convention scoped, each annotated with its non-cancelled linked invoice),
  `buildAdmissionDraft(admissionId, actor)` (branch-checked stay context + suggested rows:
  bed day-rate × days to cut-off [`expectedDischargeAt` or today], nursing rate × days,
  doctor-round fee × rounds counted from ClinicalRecord Progress-Note/Rounds, one row per
  GIVEN drug+dosage) and `getLinkedInvoice(admissionId)`.
- `src/controllers/admission.controller.ts` + NEW `src/app/api/admission/billing-queue/route.ts`
  — GET queue, route guard `billing.invoices:view`, controller guard
  `PERMISSION_KEYS.BILLING_INVOICE_VIEW` ("Admission").
- `src/controllers/invoice.controller.ts` + NEW `src/app/api/invoice/draft/route.ts` — GET draft
  (+ linked invoice), same guard pair ("Invoice").
- `src/lib/rbac/route-permissions.ts` — `GET /admission/billing-queue` and `GET /invoice/draft`
  registered under `billing.invoices:view`. ACCOUNTANT (and RECEPTIONIST) already hold it —
  **no permission-catalogue or role default change**.
- Post-bill locks (Phase 2 "Open for Phase 3" items) in `src/services/admission.service.ts`:
  `recallBilling` and `addDischargeNote` now 409 once a non-cancelled invoice exists for the
  stay; `dischargePatient` refuses to free the bed while `billingRequested` is set and no bill
  has been raised ("accountant must finalize the bill before discharge"). Unflagged stays keep
  discharging exactly as before.

Accountant UI:

- `src/app/(dashboard)/finance/invoice/create/page.tsx` REBUILT — billing queue card (sent-to-
  billing stays, oldest handoff first; billed rows show invoice number/status) + charge
  workspace: stay context (bed/ward-type, attending, insurance, doctor's flag note, latest
  nurse note, allergies), fully editable rows (qty/rate/disc/tax per row + extra header
  discount), GST/discount totals matching the Invoice model, due date + notes, "Save bill
  (UNPAID)", then an optional **Collect payment** dialog (POST /api/payment) — the workspace
  also keeps a **manual invoice** mode (patient search via GET /api/patient + free rows) so the
  pre-pipeline billing contract is preserved.
- `src/app/(dashboard)/finance/payments/page.tsx` REBUILT — receipt ledger (GET /api/payment)
  with search/method filter, KPIs (filtered sum, count, by-method chips), receipt detail + print.
- `src/app/(dashboard)/finance/outstanding/page.tsx` REBUILT — aging register
  (GET /api/finance/outstanding) with grand total + 4 bucket cards, quick-collect dialog
  (POST /api/payment) and contact/reminder actions (reminder stays a toast — defect 7.4 open).
- `src/app/(dashboard)/finance/page.tsx` — Create Invoice workstation badge now shows
  "N awaiting bill" (queue count) when cases are pending.

Pipeline end state: Doctor flag → Nurse review/send → **Accountant bill (this phase)** →
payment → front-desk discharge frees the bed (`dischargePatient` now refuses billingRequested
stays until an invoice exists).

Remaining / not in scope:
- Defect 7.3 full session-wiring and 7.4 notifications (see Section 7 status note).
- Medicine unit-price autofill for eMAR rows (rows are priced manually today; the DB
  charge-rate tables now live on Ward/Bed + Doctor.consultationFee — see the 2026-10-27 log).

---

## 10. Progress Log

- 2026-10-24: Phase 3 implemented + verified: accountant Create Bill workspace (see
  Section 13). TypeScript check clean; `npm test` full 12-file RBAC suite green.
  Defects 7.1 (instant-collect double count) and 7.2 (random invoice/receipt numbers)
  fixed; 7.3 deliberately mitigated invoice-first, 7.4 stays toast-only.
- 2026-10-24: Phase 2 verification LOGGED: typecheck clean; `npm test` full suite green
  227/227 across all 12 RBAC files — the new `/admission/billing-request` (POST+PUT) and
  `/admission/discharge-note` (POST) route registrations satisfy the route-coverage
  contract tests; no menu/role/catalogue changes were made, so no other suites moved.
- 2026-10-24: Phase 2 implemented end to end: nurse discharge process (handoff fields
  `billingRequested/expectedDischargeAt/dischargeNotes[]` on Admission,
  `/api/admission/billing-request` POST/PUT + `/api/admission/discharge-note` POST guarded
  by `nursing.patients:update`, nurse dashboard "Discharge flags" card, `/nursing/patients`
  action-column swap with amber/green pills, discharge review panel with advisory
  checklist + note thread + Send/Recall). Section 9 Phase 2 ticked off. Next: Phase 3
  accountant workspace.

- 2026-10-24: Phase 1 verification LOGGED: typecheck clean; `npm test` full suite green
  227/227 (was already failing before Phase 1 on two PRE-EXISTING drifts, both repaired
  during verification, no product behavior change):
  (a) `/api/clinical/rounds` + `/api/clinical/visits/[id]/addendum` had no ROUTE_PERMISSIONS
  entries while the contract test demands them — registered with the exact permissions
  their own route.ts guards enforce (patients.profile:view; clinical.rounds:create with
  clinical.consultations:create alternatives).
  (b) permissions.test "module names match sidebar" failed on /admissions: the catalogue
  deliberately appends a nav-hidden `admissions.new` sub-item (`/admissions/new`),
  while the test compared the full sub-item list to visible menu children. Test now
  compares visible sub-items only; the hidden-entry design (menu.test "Admission route
  stays permission-gated without appearing in any sidebar") is preserved.
  Lint note: `npm run lint` fails repo-wide at HEAD (pre-existing `any`, set-state-in-effect,
  unescaped-entity categories); Phase 1 code is style-consistent and adds no new rule hits.
- 2026-10-24: Phase 1 implemented end to end: doctor-side discharge flag (flag fields on
  Admission, /api/admission/discharge-request POST/PUT, Ward Rounds button + badge,
  flag exposure via my-inpatients). Section 9 Phase 1 ticked off. Next: Phase 2 nurse
  discharge screen.
- 2026-10-24: Create Bill page wiped to placeholder ("Create bill" text only).
  Plan file created. Flow agreed: Doctor flag -> Nurse process & send -> Accountant bill.
- 2026-10-24: Payments Ledger and Outstanding Dues pages also wiped to placeholders
  ("Payments" / "Outstanding dues" text only). Remaining billing UI: Finance Hub
  (`/finance`) and Bills (`/finance/invoices`) — the Bills list still collects partial
  payments via its modal, so invoice/payment backends remain exercised.

- 2026-10-27: New multi-phase "Create Bill rework" task started (Phase 0 read-only
  audit reported and approved: no schema field changes needed out of the box; proposals
  approved with conditions — Invoice partial unique index via one-off script using the
  isActive fallback, and bed segments reuse Admission.transferHistory). Phase 1 bug list
  implemented: server-side recomputation of invoice totals (prices cannot be trusted
  from the client), shared round2/fmtMoney + en-IN date helpers, payment guardrails
  (amount > 0, no overpay, block on cancelled/fully-paid invoices), duplicate-admission
  protection (pre-check + race-safe 409 on unique-index violation, isActive kept in
  sync with status, cancelled bills free the stay), client race/dirty guards in
  openCase, collect flow switched to close-then-reload (no double invoice), billed
  queue cards gained View invoice / Print deep links, Mongoose legacy-name enrichment
  for the billing queue (doctor name, sent-by via handover fallback), and the
  reports discountAmount source bug fixed. Verification: typecheck clean; 
pm test
  full 12-file RBAC suite green; production build succeeded; 
pm run lint baseline
  failures unchanged by this phase (no new rule hits introduced). Pending user action:
  take a mongodump, then run 
px tsx scripts/create-bill-unique-index.ts to create
  the partial unique index — the API pre-check covers duplicates until then.

- 2026-10-27: Phase 2 (Create Bill simplification) implemented: per-row discount and
  tax inputs/columns removed from the billing table (schema kept optional, API still
  accepts them for backward compatibility, client sends 0), GST/tax row and the due
  date input removed from the workspace; the bill discount is now entered once at
  bill level and REQUIRES a reason (stored on the new optional Invoice.discountReason
  field, enforced on client and server). Discounts above 10% of the gross are blocked
  unless the caller holds the new special-action permission illing.create:discount
  ("Discount above limit" on Create Bill in the permission matrix / guard helper
  hasRequestPermission). Rate-₹0 rows render red and block save on the client; the
  server rejects them as well ("delete the row if it is not chargeable") — this also
  stops eMAR dose rows at price 0 from being billed before Phase 3.3 wires pharmacy
  prices. Deleting an auto-generated (draft) row now demands a typed reason via a
  prompt; the reason is appended to the invoice notes. Verification: typecheck clean;
  full 
pm test 12-file suite green (210 checks); build succeeds; lint profile
  unchanged (only the file's pre-existing baseline hits; no new rule hits).

- 2026-10-27: Phase 3.1 (dynamic rates) implemented: src/lib/billing-rates.ts deleted
  (grep-confirmed single importer). Ward.bedRatePerDay/
ursingRatePerDay and optional
  per-bed overrides Bed.bedRatePerDay/
ursingRatePerDay added (optional fields, no
  seeds/backfill), editable from the Wards and Beds admin screens with sanitation on the
  API (blank keeps stored value, numbers must be >= 0). The billing draft now prices bed
  + nursing rows from bed override -> ward rate, and splits doctor-round rows per doctor
  priced from that doctor's consultationFee (joined via ClinicalRecord doctor/author
  User id; unattributed rounds emit a red row). Unset ward rate / unset doctor fee keep
  the row price at 0 - red, saves blocked, fixed in the master, never written back from
  the bill. The Wards list shows the configured rates. Verification: typecheck clean;
  full 
pm test suite green; build succeeds; lint unchanged (pre-existing hits only).

- 2026-10-27: Phase 3.2 (Service master + autocomplete) implemented. New 'Service'
  collection (name unique, category, defaultRate >= 0, active flag) driven from
  Billing > Rates (/finance/rates, screenshot-style admin table) with the standard
  RBAC sub-item 'billing.rates' (view/create/update/delete | API guards
  /api/service + /api/service/[id]). Billing sidebar gains a 'Rates' entry. The
  Create Bill description field autocompletes over active services (top 6 matches,
  picking one pre-fills name + rate into the row snapshot); free-text rows outside
  the rate master now need the new 'Custom item' clearance (billing.create:custom,
  declared as a special action next to the discount one, granted by nobody by
  default - SUPER_ADMIN implicit). Verification: typecheck clean, full npm test
  suite green (menu/route/catalogue/preset checks cover the new sub-item), build
  succeeds; lint profile unchanged apart from the one pre-existing-pattern
  disable documented inline on the two initial-load effects.
