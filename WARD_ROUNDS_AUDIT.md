# Ward Rounds Audit

1. EXTRA

- `src/app/(dashboard)/clinical/rounds/page.tsx:5` - `ChevronRight` and `Clock3` imports are unused. Safe to remove: yes.
- `src/app/(dashboard)/clinical/rounds/page.tsx:191` - `FREQUENCY_SUMMARIES` is unused. Safe to remove: yes.
- `src/app/(dashboard)/clinical/rounds/page.tsx:315` - `doseOpen` state is unused. Safe to remove: yes.
- `src/app/(dashboard)/clinical/rounds/page.tsx:458` - `updateOrder` is unused. Safe to remove: yes.
- `src/controllers/care-task.controller.ts:282-354` - Code after an unconditional return is unreachable. Safe to remove: no; it contains intended timeline and time zone fields that need review.

2. NOT WORKING OR RISKY

- Typecheck: `npm.cmd run typecheck` passed. No type errors reported.
- `src/components/clinical/round-card.tsx:111,129-130` - Notes up to 100 characters can be clipped on narrow screens without a Show more control. Severity: Medium. Simple fix: base expansion on actual overflow or show the control for clipped text.
- `src/app/(dashboard)/clinical/rounds/page.tsx:661` - Print hides controls but leaves the one-line note clamp active, so long clinical notes can print truncated. Severity: Medium. Simple fix: disable line clamping in print styles.
- `src/app/(dashboard)/clinical/rounds/page.tsx:413`; `src/services/nursing.service.ts:68-82` - The multiple-admission warning counts only admissions returned to this caller; team-scoped rosters can omit other active admissions for the same patient. Severity: Medium. Simple fix: obtain an authorized patient-wide active-admission count for the warning.
- `src/controllers/clinical-round.controller.ts:104-110`; `src/services/visit.service.ts:109-114` - Branch access checks the patient's branch, then loads rounds from every admission for that patient without an admission-branch filter. Cross-branch admissions could be included. Severity: High. Simple fix: filter admissions by the actor's authorized branch before returning rounds.
- `src/app/(dashboard)/clinical/rounds/page.tsx:692` - Every active instruction is labeled Pending, including acknowledged or in-progress tasks. Severity: Medium. Simple fix: map the stored task status to the displayed status.
- `src/app/(dashboard)/clinical/rounds/page.tsx:692`; `src/models/care-task.model.ts:7-22` - Instruction frequency is displayed as not set, and the model has no frequency field. Severity: Low. Simple fix: Needs manual check whether recurring instructions are supported; if required, add frequency through the model and API.
- `src/app/(dashboard)/clinical/rounds/page.tsx:692`; `src/controllers/care-task.controller.ts:160`; `src/lib/rbac/roles.ts:62-74` - Stop is shown for each instruction, but the default Doctor role lacks the execute permission required by the endpoint. Severity: Medium. Simple fix: hide or disable Stop when the caller lacks permission.
- `src/services/care-task.service.ts:103-119`; `src/models/care-task.model.ts:19-22`; `src/app/(dashboard)/clinical/rounds/page.tsx:694` - Stopping an instruction records neither who stopped it nor when; history must display that these details are unavailable. Severity: Medium. Simple fix: Needs manual check of audit requirements; if required, persist cancellation actor and time.
- `src/controllers/care-task.controller.ts:281-282,350-351`; `src/app/(dashboard)/clinical/rounds/page.tsx:144,185` - The early return omits the configured time zone; the page falls back to Asia/Kolkata. Dates can be wrong where the configured zone differs. Severity: Medium. Simple fix: return the configured time zone from the reachable response.
- `src/app/(dashboard)/clinical/rounds/page.tsx:287` - Medicine lookup errors are silently caught; free-text entry remains available but staff receive no lookup feedback. Severity: Low. Simple fix: show a small non-blocking lookup error.