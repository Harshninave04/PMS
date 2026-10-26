---
name: pms-development
description: Safely develop and review the Medistra Patient Management System, especially nurse-assigned inpatient care, clinical records, discharge, and PDF reports.
---

# PMS development

Use this skill for changes, investigations, reviews, or tests in this repository that affect patient, clinical, admission, nursing, discharge, or role-based access workflows. Do not use it for unrelated generic Next.js work.

## Project map

- The application is Next.js 16 App Router, React 19, TypeScript, Tailwind v4, NextAuth credentials/JWT, and MongoDB through Mongoose.
- UI routes live under `src/app/(dashboard)`; API route handlers are in `src/app/api`; route handlers should delegate to controllers.
- Follow the existing `route -> controller -> service -> repository/model` structure. The `@/*` alias maps to `src/*`.
- Authentication is configured in `src/lib/auth.ts`. Authorize protected requests server-side with `authorizeRequest` or the appropriate `requirePermission` helper from `src/lib/rbac/guard.ts`; client-side menu/page guards are not sufficient.
- Core domain models are `Patient`, `Admission`, `ClinicalRecord`, `Vitals`, `NursingMedication`, and `CareTask`. Do not place patient data in logs, test output, URLs beyond opaque IDs, or browser storage.

## Nursing assignment and patient access

- An inpatient nurse roster must originate from `NursingService.getMyPatients` and retain the active-admission filter plus `assignedNurses: currentUserId` for a nurse. Never fetch a full admission list then filter it only in the browser.
- For every record read, create, update, export, or discharge action reached by a nurse, resolve the admission server-side and verify that it is active, in the caller's branch when applicable, belongs to the requested patient, and lists the caller in `assignedNurses`.
- Preserve doctor scope through `src/lib/rbac/doctor-scope.ts`, and use grant scope/branch constraints rather than trusting role labels or request body IDs.
- Reject cross-patient and cross-admission references. Attribute nurse-created records from the authenticated user, not a client-supplied author field.

## Shared clinical information

- Receptionist-owned demographic/registration fields remain on `Patient`; doctor orders, consultations, diagnoses, and rounds use the existing clinical models and routes. Nursing views may read the shared clinical data only after assignment authorization.
- Store day-wise nursing observations as persistent clinical/nursing records linked to both `patient` and `admissionId`. Use the admission date and hospital timezone helper (`src/lib/hospital-time.ts`) to derive a stable Day 1, Day 2, etc.; do not rely on a client counter.
- Preserve existing entries as clinical history. Prefer append-only records and addenda over deletion or mutation; if editing is required, authorize the original record and retain audit metadata.

## Discharge and report rules

- Discharge validation must confirm the admission is active, authorization and branch/team scope are satisfied, required discharge fields are present, and the requested patient matches the admission.
- Before completing a discharge, generate or make available a consolidated day-wise nursing report from server-authorized persisted records. It must include patient/admission identifiers, derived hospital day, timestamps, author, and note content, and it must not contain unrelated patients.
- Treat report download/export as a read operation with the same assignment and branch checks as the patient detail view. Keep the existing admission and clinical records after discharge; change admission status rather than deleting history.

## Implementation and verification

- Read the relevant bundled Next.js documentation in `node_modules/next/dist/docs/` before creating or changing Next.js code, following the repository `AGENTS.md` requirement.
- Validate request shape and MongoDB ObjectIds at API boundaries. Use explicit allow-lists for fields that may be updated. Return clear 400/403/404 responses without leaking another patient's data.
- Keep schema migrations backwards-compatible and add indexes for new high-volume access paths such as `{ admissionId, dateRecorded }` when warranted. Never run the destructive seed command against real data.
- For code changes run the focused test first, then `npm run typecheck`; run `npm test` and `npm run build` when the changed surface warrants it. Add RBAC tests proving Nurse A cannot list, read, export, write to, or discharge Nurse B's patient.
- Use the `playwright` skill for end-to-end workflow coverage; use `pdf` for report creation/validation; use the security skills for threat modelling and authorization review. Do not alter deployment infrastructure without explicit approval.
