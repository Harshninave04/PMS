// Roles & Permissions

Medistra runs on a single, deny-by-default permission model. Every menu link,
every API endpoint, and every control in the interface reads the same catalogue,
so a permission means the same thing everywhere it appears.

The format is `module.submodule:action`.

```text
patients.list:view          read the patient list
patients.list:create        add a patient
patients.documents:upload   upload a document for a patient
clinical.prescriptions:prescribe
billing.payments:refund
```

The catalogue is **derived from the sidebar**, not maintained by hand. A
sub-item that does not exist in the navigation does not exist as a permission,
which is why the two can never disagree.

## Where the model lives

| Concern | File |
| --- | --- |
| Permission catalogue (modules, sub-items, actions, routes) | `src/lib/rbac/permissions.config.ts` |
| The sidebar the catalogue is derived from | `src/lib/menu-seed.ts` |
| Server-side enforcement | `src/lib/rbac/guard.ts` |
| Endpoint → permission table (documentation and lookup) | `src/lib/rbac/route-permissions.ts` |
| Per-role defaults and normalization | `src/lib/rbac/default-permissions.ts` |
| Legacy → sub-item translation | `src/lib/rbac/migrate-access.ts` |
| Effective permission resolution | `src/lib/rbac/role-permissions.ts` |
| Client context and UI helpers | `src/components/permissions/` |

## The catalogue

11 modules, 212 permissions in total.

| Module | Sub-items |
| --- | --- |
| `dashboard` | `main` |
| `patients` | `list`, `profile`, `documents`, `register` |
| `opd` | `appointments`, `queue`, `checkin` |
| `clinical` | `encounters`, `vitals`, `notes`, `prescriptions`, `results` |
| `admissions` | `inpatient`, `discharge`, `transfers` |
| `wards` | `list`, `beds`, `rooms`, `availability` |
| `nursing` | `patients`, `medications`, `notes`, `vitals` |
| `pharmacy` | `medicines`, `dispensing`, `stock`, `categories`, `expiry`, `prescriptions` |
| `billing` | `invoices`, `payments`, `outstanding`, `reports` |
| `staff` | `doctors`, `departments`, `list`, `schedule` |
| `admin` | `users`, `roles`, `hospital`, `beds`, `rooms`, `wards`, `finance` |

A handful of routes do not sit where the URL suggests, so the catalogue maps
them explicitly:

| URL | Permission prefix |
| --- | --- |
| `/appointments`, `/appointments/*` | `opd` |
| `/finance`, `/finance/*` | `billing` |
| `/organization/details` | `admin.hospital` |
| `/staff/list` | `staff.doctors` |
| `/reports` | `reports.*` |

### Actions

Every sub-item supports `view` and `create`. Most also support `update` and
`delete`. Some are domain-specific, and these exist because the workflow needs
them:

| Permission | What it authorizes |
| --- | --- |
| `patients.documents:upload` | attaching a file to a patient |
| `clinical.prescriptions:prescribe` | issuing a prescription |
| `admissions.discharge:discharge` | discharging an inpatient |
| `pharmacy.dispensing:dispense` | dispensing a medicine |
| `billing.payments:refund` | refunding a payment |

## Roles

Six roles are in scope:

`ADMIN`, `DOCTOR`, `NURSE`, `RECEPTIONIST`, `PHARMACIST`, `ACCOUNTANT`

**`ADMIN` is the Super Admin.** It holds all 212 permissions, is the only role
that passes a permission check unconditionally, and cannot be edited or deleted
through the interface. Renaming it, deleting it, or narrowing it would remove the
only way to recover from a bad permission change.

Default grants:

| Role | Permissions |
| --- | --- |
| `ADMIN` | 212 (everything) |
| `DOCTOR` | 29 |
| `NURSE` | 25 |
| `RECEPTIONIST` | 27 |
| `PHARMACIST` | 28 |
| `ACCOUNTANT` | 20 |

Granting a role is done from **Admin → Roles**, per sub-item, with *Select all*
per module. Two rules apply to every save:

1. **A write implies its read.** Granting `patients.list:update` also grants
   `patients.list:view`. A permission set is never stored in a state where a
   role can edit something it cannot see.
2. **Prerequisites come along.** Granting `admissions.discharge:discharge`
   also grants `admissions.inpatient:view`, because the action is meaningless
   without it.

Both are applied by `normalizePermissions()`, which is idempotent — normalizing
an already-normalized set changes nothing.

Admins cannot grant a permission they do not themselves hold. Since only
`ADMIN` holds everything, this means only `ADMIN` can widen a role.

## Enforcement

### Server

Every API handler calls `requirePermission(request, key)` and returns the
resulting response if it is a denial:

```ts
export async function GET(request: NextRequest) {
  const denied = await requirePermission(request, "patients.list:view");
  if (denied) return denied;
  // ...
}
```

Passing `null` instead of a key still requires a valid, active, signed-in
session — it only skips the permission check. This is reserved for reference
lookups that populate dropdowns (doctors, departments, wards, beds, staff
directories) and for the reads the interface needs to render itself (the
sidebar, the signed-in user's own permissions). They are listed in
`LOOKUP_ENDPOINTS`. Every one of them is still tenant-scoped by its controller.

**This is the security boundary.** Anything the interface hides is a
convenience; anything the API refuses is enforced.

### Client

The dashboard layout resolves the viewer's permissions on the server and passes
them into `PermissionProvider`. From there:

- `<Can permission="patients.list:create">…</Can>` hides a control.
- `<PermissionGate>` redirects to `/forbidden` for a whole page.

Both read the same keys as the server. When a role changes, the next page load
re-resolves from the database, so the interface follows immediately.

The sidebar is filtered server-side in `/api/menu`. A link that is not permitted
is never sent to the browser, which means it is not merely hidden — it is absent.

## Legacy compatibility

Permissions were historically stored as module-level grants, for example
`PATIENT_MANAGEMENT` with a `permissions` list. Those grants still work.

On boot, `canonical-sync` translates each role's legacy access into sub-item
permissions and writes them to the role document. Translation is additive and
the original `access` array is preserved, so a rollback cannot lose it.
Effective permissions are the **union** of the stored sub-item permissions and
the translated legacy grants, so nothing becomes less accessible during a
migration.

Legacy roles with no counterpart in the six are left alone. They are never
remapped, never seeded, never given permissions, and never deleted — an account
holding one keeps working exactly as it did.

## Out-of-scope roles

Roles outside the six above — including ones left over from earlier versions —
are listed in `OUT_OF_SCOPE_ROLES` and are deliberately left untouched. The
migration is additive, so an unknown role is left exactly as found rather than
being guessed at or cleaned up.

If you need one of these roles retired, do it deliberately, after confirming no
account still holds it. It is not something the system will do for you.

## Verifying a change

```bash
npx tsc --noEmit    # types
npm test            # all RBAC suites
npm run build       # production build
```

`tests/rbac/permissions.test.ts` includes contract tests that walk
`src/app/api` and the route table, and fail if either drifts: a handler with no
permission check, an endpoint with no route rule, an open guard that is not a
declared lookup, or a rule naming a permission this build does not define. If
you add an endpoint, they will ask you to declare it.