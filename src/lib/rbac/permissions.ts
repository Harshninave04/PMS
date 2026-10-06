/**
 * Canonical permission strings. Kept free of server-only imports so client
 * pages (e.g. the role permission editor) can use it too.
 */
export const PERMISSION_KEYS = {
  // Patients
  PATIENT_VIEW: "patient.patient.view",
  PATIENT_CREATE: "patient.patient.create",
  PATIENT_UPDATE: "patient.patient.update",
  PATIENT_DELETE: "patient.patient.delete",
  PATIENT_DOC_UPLOAD: "patient.document.upload",
  PATIENT_DOC_DELETE: "patient.document.delete",

  // OPD / Appointments
  APPOINTMENT_VIEW: "appointment.appointment.view",
  APPOINTMENT_CREATE: "appointment.appointment.create",
  APPOINTMENT_UPDATE: "appointment.appointment.update",
  APPOINTMENT_CANCEL: "appointment.appointment.cancel",
  /** Moving an appointment to a different doctor. Separate from a general update. */
  APPOINTMENT_REASSIGN: "appointment.appointment.reassign",

  // IPD / Admissions & Wards
  ADMISSION_VIEW: "admission.admission.view",
  ADMISSION_CREATE: "admission.admission.create",
  ADMISSION_UPDATE: "admission.admission.update",
  ADMISSION_TRANSFER: "admission.admission.transfer",
  ADMISSION_DISCHARGE: "admission.admission.discharge",
  ADMISSION_CANCEL: "admission.admission.cancel",
  WARD_VIEW: "ward.ward.view",
  WARD_MANAGE: "ward.ward.manage",

  // Consultation
  CLINICAL_RECORD_VIEW: "clinical.record.view",
  CLINICAL_RECORD_CREATE: "clinical.record.create",
  CLINICAL_RECORD_UPDATE: "clinical.record.update",
  CLINICAL_DIAGNOSIS_VIEW: "clinical.diagnosis.view",
  CLINICAL_DIAGNOSIS_CREATE: "clinical.diagnosis.create",
  CLINICAL_PRESCRIPTION_VIEW: "clinical.prescription.view",
  CLINICAL_PRESCRIPTION_CREATE: "clinical.prescription.create",
  CLINICAL_PRESCRIPTION_CANCEL: "clinical.prescription.cancel",

  // Nursing (the "task" permissions cover the nursing workstation: inpatients & medication rounds)
  NURSING_VITALS_VIEW: "nursing.vitals.view",
  NURSING_VITALS_CREATE: "nursing.vitals.create",
  NURSING_VITALS_UPDATE: "nursing.vitals.update",
  NURSING_TASK_VIEW: "nursing.task.view",
  NURSING_TASK_CREATE: "nursing.task.create",
  NURSING_TASK_EXECUTE: "nursing.task.execute",

  // Pharmacy
  PHARMACY_PRESCRIPTION_VIEW: "pharmacy.prescription.view",
  PHARMACY_DISPENSE_CREATE: "pharmacy.dispense.create",
  PHARMACY_STOCK_VIEW: "pharmacy.stock.view",
  PHARMACY_STOCK_MANAGE: "pharmacy.stock.manage",

  // Billing
  BILLING_INVOICE_VIEW: "billing.invoice.view",
  BILLING_INVOICE_CREATE: "billing.invoice.create",
  BILLING_INVOICE_UPDATE: "billing.invoice.update",
  BILLING_INVOICE_CANCEL: "billing.invoice.cancel",
  BILLING_PAYMENT_VIEW: "billing.payment.view",
  BILLING_PAYMENT_CREATE: "billing.payment.create",

  // Staff, users & roles
  STAFF_VIEW: "staff.staff.view",
  STAFF_CREATE: "staff.staff.create",
  STAFF_UPDATE: "staff.staff.update",
  STAFF_DEPT_MANAGE: "staff.department.manage",
  USER_VIEW: "user.user.view",
  USER_CREATE: "user.user.create",
  USER_UPDATE: "user.user.update",
  USER_DISABLE: "user.user.disable",
  // Permanent removal. Distinct from USER_DISABLE: deactivating a clinician
  // must not require the authority to erase their record.
  USER_DELETE: "user.user.delete",
  USER_DIRECTORY_VIEW: "user.directory.view",
  ROLE_VIEW: "role.role.view",
  ROLE_UPDATE: "role.role.update",

  // Hospital, departments & doctors
  ORGANIZATION_VIEW: "organization.organization.view",
  ORGANIZATION_CREATE: "organization.organization.create",
  ORGANIZATION_UPDATE: "organization.organization.update",
  ORGANIZATION_DELETE: "organization.organization.delete",
  DEPARTMENT_VIEW: "department.department.view",
  DEPARTMENT_CREATE: "department.department.create",
  DEPARTMENT_UPDATE: "department.department.update",
  DEPARTMENT_DELETE: "department.department.delete",
  DOCTOR_VIEW: "doctor.doctor.view",
  DOCTOR_CREATE: "doctor.doctor.create",
  DOCTOR_UPDATE: "doctor.doctor.update",
  DOCTOR_DELETE: "doctor.doctor.delete",

  // Reports
  REPORTS_FINANCIAL_VIEW: "reports.financial.view",
  REPORTS_CLINICAL_VIEW: "reports.clinical.view",
  REPORTS_OPERATIONAL_VIEW: "reports.operational.view",

  // Dashboard
  DASHBOARD_VIEW: "dashboard.dashboard.view",

  // Audit trail. Administrator-only in practice; not granted to any staff role.
  AUDIT_VIEW: "audit.audit.view",
} as const;

export type PermissionKey = typeof PERMISSION_KEYS[keyof typeof PERMISSION_KEYS];

/** Every permission grouped by its module prefix ("ward.ward.view" -> "ward"). */
export function groupPermissionsByModule(permissions: Iterable<string> = Object.values(PERMISSION_KEYS)): Record<string, string[]> {
  const modules: Record<string, string[]> = {};
  for (const perm of permissions) {
    const moduleName = perm.split(".")[0];
    (modules[moduleName] ??= []).push(perm);
  }
  return modules;
}
