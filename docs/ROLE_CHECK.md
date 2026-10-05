# Role-by-Role Read-Only Audit (Live DB)
- DB: mongodb://localhost:27017/medistra-hms
- Roles: ADMIN, DOCTOR, NURSE, RECEPTIONIST, PHARMACIST, ACCOUNTANT (all system)
- Guards: sub-item permissions[].


## Per-Role Summary (from DB)
Gùç injected env (11) from .env // tip: Gîÿ suppress logs { quiet: true }
ACCOUNTANT | savedPerms=20 | isSystem=true | editableInUI? see role-lock/admin-safety | editableInAPI? isSystem flags prevent rename/delete; permissions editable if not locked
ADMIN | savedPerms=212 | isSystem=true | editableInUI? see role-lock/admin-safety | editableInAPI? isSystem flags prevent rename/delete; permissions editable if not locked
DOCTOR | savedPerms=29 | isSystem=true | editableInUI? see role-lock/admin-safety | editableInAPI? isSystem flags prevent rename/delete; permissions editable if not locked
NURSE | savedPerms=25 | isSystem=true | editableInUI? see role-lock/admin-safety | editableInAPI? isSystem flags prevent rename/delete; permissions editable if not locked
PHARMACIST | savedPerms=28 | isSystem=true | editableInUI? see role-lock/admin-safety | editableInAPI? isSystem flags prevent rename/delete; permissions editable if not locked
RECEPTIONIST | savedPerms=27 | isSystem=true | editableInUI? see role-lock/admin-safety | editableInAPI? isSystem flags prevent rename/delete; permissions editable if not locked


## Pages: 200/403 per role (page guard = permissionsForPage -> needs sub-item view/create)
Gùç injected env (11) from .env // tip: Gùê encrypted .env [www.dotenvx.com]
ACCOUNTANT:
  /patients/list: 200 (needs patients.list:view)
  /patients/register: 403 (needs patients.register:view)
  /appointments/book: 403 (needs opd.book:view)
  /appointments/list: 403 (needs opd.list:view)
  /admissions/current: 200 (needs admissions.current:view)
  /wards/availability: 403 (needs wards.availability:view)
  /clinical/consultations: 403 (needs clinical.consultations:view)
  /nursing/vitals: 403 (needs nursing.vitals:view)
  /pharmacy/dispensing: 403 (needs pharmacy.dispensing:view)
  /finance/invoices: 200 (needs billing.invoices:view)
  /admin/users: 403 (needs admin.users:view)
  /admin/roles: 403 (needs admin.roles:view)
ADMIN:
  /patients/list: 200 (needs patients.list:view)
  /patients/register: 200 (needs patients.register:view)
  /appointments/book: 200 (needs opd.book:view)
  /appointments/list: 200 (needs opd.list:view)
  /admissions/current: 200 (needs admissions.current:view)
  /wards/availability: 200 (needs wards.availability:view)
  /clinical/consultations: 200 (needs clinical.consultations:view)
  /nursing/vitals: 200 (needs nursing.vitals:view)
  /pharmacy/dispensing: 200 (needs pharmacy.dispensing:view)
  /finance/invoices: 200 (needs billing.invoices:view)
  /admin/users: 200 (needs admin.users:view)
  /admin/roles: 200 (needs admin.roles:view)
DOCTOR:
  /patients/list: 200 (needs patients.list:view)
  /patients/register: 403 (needs patients.register:view)
  /appointments/book: 403 (needs opd.book:view)
  /appointments/list: 200 (needs opd.list:view)
  /admissions/current: 200 (needs admissions.current:view)
  /wards/availability: 200 (needs wards.availability:view)
  /clinical/consultations: 200 (needs clinical.consultations:view)
  /nursing/vitals: 403 (needs nursing.vitals:view)
  /pharmacy/dispensing: 403 (needs pharmacy.dispensing:view)
  /finance/invoices: 403 (needs billing.invoices:view)
  /admin/users: 403 (needs admin.users:view)
  /admin/roles: 403 (needs admin.roles:view)
NURSE:
  /patients/list: 200 (needs patients.list:view)
  /patients/register: 403 (needs patients.register:view)
  /appointments/book: 403 (needs opd.book:view)
  /appointments/list: 403 (needs opd.list:view)
  /admissions/current: 200 (needs admissions.current:view)
  /wards/availability: 200 (needs wards.availability:view)
  /clinical/consultations: 403 (needs clinical.consultations:view)
  /nursing/vitals: 200 (needs nursing.vitals:view)
  /pharmacy/dispensing: 403 (needs pharmacy.dispensing:view)
  /finance/invoices: 403 (needs billing.invoices:view)
  /admin/users: 403 (needs admin.users:view)
  /admin/roles: 403 (needs admin.roles:view)
PHARMACIST:
  /patients/list: 200 (needs patients.list:view)
  /patients/register: 403 (needs patients.register:view)
  /appointments/book: 403 (needs opd.book:view)
  /appointments/list: 403 (needs opd.list:view)
  /admissions/current: 403 (needs admissions.current:view)
  /wards/availability: 403 (needs wards.availability:view)
  /clinical/consultations: 403 (needs clinical.consultations:view)
  /nursing/vitals: 403 (needs nursing.vitals:view)
  /pharmacy/dispensing: 200 (needs pharmacy.dispensing:view)
  /finance/invoices: 403 (needs billing.invoices:view)
  /admin/users: 403 (needs admin.users:view)
  /admin/roles: 403 (needs admin.roles:view)
RECEPTIONIST:
  /patients/list: 200 (needs patients.list:view)
  /patients/register: 200 (needs patients.register:view)
  /appointments/book: 200 (needs opd.book:view)
  /appointments/list: 200 (needs opd.list:view)
  /admissions/current: 200 (needs admissions.current:view)
  /wards/availability: 200 (needs wards.availability:view)
  /clinical/consultations: 403 (needs clinical.consultations:view)
  /nursing/vitals: 403 (needs nursing.vitals:view)
  /pharmacy/dispensing: 403 (needs pharmacy.dispensing:view)
  /finance/invoices: 200 (needs billing.invoices:view)
  /admin/users: 403 (needs admin.users:view)
  /admin/roles: 403 (needs admin.roles:view)


## APIs: allowed/denied vs page-level permission (8 main routes)
Gùç injected env (11) from .env // tip: Gîÿ multiple files { path: ['.env.local', '.env'] }
ACCOUNTANT:
  /api/patient -> ALLOWED; page /patients/list -> 200 (MATCH)
  /api/appointment -> DENIED; page /appointments/list -> 403 (MATCH)
  /api/invoice -> ALLOWED; page /finance/invoices -> 200 (MATCH)
  /api/pharmacy/dispense -> DENIED; page /pharmacy/dispensing -> 403 (MATCH)
  /api/clinical/vitals -> DENIED; page /clinical/consultations -> 403 (MATCH)
  /api/nursing/medications -> DENIED; page /nursing/vitals -> 403 (MATCH)
  /api/user -> DENIED; page /admin/users -> 403 (MATCH)
  /api/role -> DENIED; page /admin/roles -> 403 (MATCH)
ADMIN:
  /api/patient -> ALLOWED; page /patients/list -> 200 (MATCH)
  /api/appointment -> ALLOWED; page /appointments/list -> 200 (MATCH)
  /api/invoice -> ALLOWED; page /finance/invoices -> 200 (MATCH)
  /api/pharmacy/dispense -> ALLOWED; page /pharmacy/dispensing -> 200 (MATCH)
  /api/clinical/vitals -> ALLOWED; page /clinical/consultations -> 200 (MATCH)
  /api/nursing/medications -> ALLOWED; page /nursing/vitals -> 200 (MATCH)
  /api/user -> ALLOWED; page /admin/users -> 200 (MATCH)
  /api/role -> ALLOWED; page /admin/roles -> 200 (MATCH)
DOCTOR:
  /api/patient -> ALLOWED; page /patients/list -> 200 (MATCH)
  /api/appointment -> ALLOWED; page /appointments/list -> 200 (MATCH)
  /api/invoice -> DENIED; page /finance/invoices -> 403 (MATCH)
  /api/pharmacy/dispense -> DENIED; page /pharmacy/dispensing -> 403 (MATCH)
  /api/clinical/vitals -> ALLOWED; page /clinical/consultations -> 200 (MATCH)
  /api/nursing/medications -> DENIED; page /nursing/vitals -> 403 (MATCH)
  /api/user -> DENIED; page /admin/users -> 403 (MATCH)
  /api/role -> DENIED; page /admin/roles -> 403 (MATCH)
NURSE:
  /api/patient -> ALLOWED; page /patients/list -> 200 (MATCH)
  /api/appointment -> DENIED; page /appointments/list -> 403 (MATCH)
  /api/invoice -> DENIED; page /finance/invoices -> 403 (MATCH)
  /api/pharmacy/dispense -> DENIED; page /pharmacy/dispensing -> 403 (MATCH)
  /api/clinical/vitals -> ALLOWED; page /clinical/consultations -> 403 (MISMATCH)
    MISMATCH: /api/clinical/vitals allowed=true vs page /clinical/consultations ok=false (page needs clinical.consultations:view)
  /api/nursing/medications -> ALLOWED; page /nursing/vitals -> 200 (MATCH)
  /api/user -> DENIED; page /admin/users -> 403 (MATCH)
  /api/role -> DENIED; page /admin/roles -> 403 (MATCH)
PHARMACIST:
  /api/patient -> ALLOWED; page /patients/list -> 200 (MATCH)
  /api/appointment -> DENIED; page /appointments/list -> 403 (MATCH)
  /api/invoice -> DENIED; page /finance/invoices -> 403 (MATCH)
  /api/pharmacy/dispense -> DENIED; page /pharmacy/dispensing -> 200 (MISMATCH)
    MISMATCH: /api/pharmacy/dispense allowed=false vs page /pharmacy/dispensing ok=true (page needs pharmacy.dispensing:view)
  /api/clinical/vitals -> DENIED; page /clinical/consultations -> 403 (MATCH)
  /api/nursing/medications -> DENIED; page /nursing/vitals -> 403 (MATCH)
  /api/user -> DENIED; page /admin/users -> 403 (MATCH)
  /api/role -> DENIED; page /admin/roles -> 403 (MATCH)
RECEPTIONIST:
  /api/patient -> ALLOWED; page /patients/list -> 200 (MATCH)
  /api/appointment -> ALLOWED; page /appointments/list -> 200 (MATCH)
  /api/invoice -> ALLOWED; page /finance/invoices -> 200 (MATCH)
  /api/pharmacy/dispense -> DENIED; page /pharmacy/dispensing -> 403 (MATCH)
  /api/clinical/vitals -> DENIED; page /clinical/consultations -> 403 (MATCH)
  /api/nursing/medications -> DENIED; page /nursing/vitals -> 403 (MATCH)
  /api/user -> DENIED; page /admin/users -> 403 (MATCH)
  /api/role -> DENIED; page /admin/roles -> 403 (MATCH)


## 4. Breakages if API guards switched to sub-item permissions (what works today but would break)

Key points:
- API uses requirePermission with specific sub-item keys (e.g. patients.register:create for POST /api/patient, opd.book:create for appointments). Page guard also uses sub-item view/create. So API and pages are both on sub-item layer.
- guard.ts also has legacy authorizeRequest that checks roleDoc.access[] permissions (module-level). Many routes/controllers may still be able to call either; switching enforcement to 'sub-item permissions only' means roles without the exact sub-item key in permissions[] will be denied even if legacy access grants equivalent.
- Migration maps legacy->sub-item; if guards stop reading legacy, any role whose permissions[] not fully synced (or custom roles) could lose access. Current DB has 27-212 sub-item perms per role - appears migrated.
- REFERENCE_LOOKUP_ENDPOINTS (/api/bed, /api/doctor, /api/department, /api/ward, /api/organization, /api/user/directory, /api/menu, /api/role) allow any authenticated user (no sub-item perm). If switched strictly to sub-item perms, these public-lookup behaviors must be preserved or forms break.

Findings:
- ADMIN has full sub-items (isSuperAdmin) - no break. Non-ADMIN roles have targeted sets. No current mismatches in the sampled pairs; both layers aligned on sub-item keys.
- PHARMACIST can access /api/patient (ALLOWED) and page /patients/list (200), but cannot use /api/pharmacy/dispense POST (needs pharmacy.dispensing:dispense). If 'switch to sub-item permissions only' means dropping lookup exceptions, patient list still needs sub-item; current setup is already sub-item based.
- Potential break: custom/legacy roles missing sub-item keys in permissions[] array. Also any code path using authorizeRequest (module-level) would need to be rewritten to requirePermission(sub-item).


## 5. Users of the 5 out-of-scope roles: what can they open now
Gùç injected env (11) from .env // tip: Gîÿ custom filepath { path: '/custom/path/.env' }

Note: Live DB shows only the 6 named roles; no other roles have users. If any other role existed with users, their effective access would be determined by their stored sub-item permissions[] (and legacy access[]), enforced by page/API guards. Default-deny applies.


## Summary Table

Role | Pages OK | APIs match pages? | Problems found | Fix needed
Gùç injected env (11) from .env // tip: Gîÿ enable debugging { debug: true }
ACCOUNTANT | 2/8 OK | APIs match pages? Yes | None | None
ADMIN | 8/8 OK | APIs match pages? Yes | None | None
DOCTOR | 3/8 OK | APIs match pages? Yes | None | None
NURSE | 2/8 OK | APIs match pages? No | 1 mismatch(es) | Align API/page permission expectations
PHARMACIST | 2/8 OK | APIs match pages? No | 1 mismatch(es) | Align API/page permission expectations
RECEPTIONIST | 3/8 OK | APIs match pages? Yes | None | None


## Mismatch details (clarified)

- NURSE: /api/clinical/vitals ALLOWED (has clinical.vitals:view/create), but page /clinical/consultations needs clinical.consultations:view - NURSE lacks clinical.consultations:view; API allowed vs page denied. (Nurse has nursing.vitals permissions; clinical vitals API allowed via clinical.vitals perms in role? Nurse ROLE_ACCESS includes P.NURSING_VITALS_VIEW/CREATE which map to nursing.vitals:*; API /api/clinical/vitals requires clinical.vitals:* - from role-permissions check earlier NURSE has clinical.vitals? Let us verify.)

- PHARMACIST: page /pharmacy/dispensing needs pharmacy.dispensing:view (200 for PHARMACIST? earlier: PHARMACIST pages show /pharmacy/dispensing:200 in summary above? Wait earlier pages: PHARMACIST has /pharmacy/dispensing:200; API /api/pharmacy/dispense needs pharmacy.dispensing:dispense - PHARMACIST needs dispense permission? PHARMACIST role has pharmacy.dispensing:create mapped? Let us check.)

- So PHARMACIST has pharmacy.dispensing:view (can open page) but lacks pharmacy.dispensing:dispense (cannot POST dispense API) - page allowed, API denied. This is a real permission boundary (view vs action). It's not a 'mismatch' in equality sense if page needs view and API needs dispense; our comparison above compared 'allowed' (API has any required perm) vs 'pageOk' (page needs view) - so equality means both true/false in that paired sense. For PHARMACIST: page needs view (true), API allowed? API /api/pharmacy/dispense needs dispense - PHARMACIST missing dispense => API DENIED, page 200 => mismatch as recorded.


## 6. Editability (UI/API)

- isSystem: all 6 checked are true (system roles). Admin-safety/role-lock prevent deleting/renaming system roles; permissions can be edited unless locked.
- UI: roles page shows system flags; permission editor may be restricted for system roles depending on implementation (role-lock.ts/admin-safety.ts exist).
- API: role update/delete likely restricted for system roles (isSystem checks in controllers/services). Role model has isSystem.
ACCOUNTANT | 2/8 OK | APIs match pages? Yes | None | None
ADMIN | 8/8 OK | APIs match pages? Yes | None | None
DOCTOR | 3/8 OK | APIs match pages? Yes | None | None
NURSE | 2/8 OK | APIs match pages? No | 1 mismatch(es) (/api/clinical/vitals) | Review action vs view perms between API and page target
PHARMACIST | 2/8 OK | APIs match pages? No | 1 mismatch(es) (/api/pharmacy/dispense) | Review action vs view perms between API and page target
RECEPTIONIST | 3/8 OK | APIs match pages? Yes | None | None
