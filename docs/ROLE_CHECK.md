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
