import { PERMISSION_KEYS as P } from "./permissions";

/**
 * The fixed set of roles for a small / medium hospital.
 * Kept free of server-only imports so client pages can use the labels.
 */
export const ADMIN_ROLE = "ADMIN";

export const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Administrator",
  DOCTOR: "Doctor",
  NURSE: "Nurse",
  RECEPTIONIST: "Receptionist",
  PHARMACIST: "Pharmacist",
  ACCOUNTANT: "Accountant",
};

export interface ModuleAccess {
  moduleName: string;
  permissions: string[];
  grants?: unknown[];
}

/**
 * Module access for every non-admin role (ADMIN receives every permission).
 * `moduleName` only controls which sidebar menus the role sees; the API guard
 * reads permissions from every module. So a permission a role needs for its
 * own screens (e.g. a doctor recording vitals) is filed under that role's menu.
 */
export const ROLE_ACCESS: Record<string, ModuleAccess[]> = {
  DOCTOR: [
    { moduleName: "patient", permissions: [P.PATIENT_VIEW] },
    { moduleName: "appointment", permissions: [P.APPOINTMENT_VIEW, P.APPOINTMENT_UPDATE] },
    { moduleName: "admission", permissions: [P.ADMISSION_VIEW] },
    {
      moduleName: "clinical",
      permissions: [
        P.CLINICAL_RECORD_VIEW, P.CLINICAL_RECORD_CREATE, P.CLINICAL_RECORD_UPDATE,
        P.CLINICAL_DIAGNOSIS_VIEW, P.CLINICAL_DIAGNOSIS_CREATE,
        P.CLINICAL_PRESCRIPTION_VIEW, P.CLINICAL_PRESCRIPTION_CREATE, P.CLINICAL_PRESCRIPTION_CANCEL,
        // Vitals are recorded from the Consultation screens
        P.NURSING_VITALS_VIEW, P.NURSING_VITALS_CREATE,
      ],
    },
  ],
  NURSE: [
    { moduleName: "patient", permissions: [P.PATIENT_VIEW] },
    { moduleName: "admission", permissions: [P.ADMISSION_VIEW] },
    { moduleName: "ward", permissions: [P.WARD_VIEW] },
    {
      moduleName: "nursing",
      permissions: [
        P.NURSING_VITALS_VIEW, P.NURSING_VITALS_CREATE, P.NURSING_VITALS_UPDATE,
        P.NURSING_TASK_VIEW, P.NURSING_TASK_CREATE, P.NURSING_TASK_EXECUTE,
        // Nursing notes are stored as clinical records
        P.CLINICAL_RECORD_VIEW, P.CLINICAL_RECORD_CREATE,
      ],
    },
  ],
  RECEPTIONIST: [
    { moduleName: "patient", permissions: [P.PATIENT_VIEW, P.PATIENT_CREATE, P.PATIENT_UPDATE, P.PATIENT_DOC_UPLOAD] },
    { moduleName: "appointment", permissions: [P.APPOINTMENT_VIEW, P.APPOINTMENT_CREATE, P.APPOINTMENT_UPDATE, P.APPOINTMENT_CANCEL] },
    {
      moduleName: "admission",
      permissions: [P.ADMISSION_VIEW, P.ADMISSION_CREATE, P.ADMISSION_UPDATE, P.ADMISSION_TRANSFER, P.ADMISSION_DISCHARGE],
    },
    { moduleName: "ward", permissions: [P.WARD_VIEW] },
    // Reception collects OPD / registration fees
    { moduleName: "billing", permissions: [P.BILLING_INVOICE_VIEW, P.BILLING_INVOICE_CREATE, P.BILLING_PAYMENT_VIEW, P.BILLING_PAYMENT_CREATE] },
  ],
  PHARMACIST: [
    { moduleName: "patient", permissions: [P.PATIENT_VIEW] },
    {
      moduleName: "pharmacy",
      permissions: [P.PHARMACY_PRESCRIPTION_VIEW, P.PHARMACY_DISPENSE_CREATE, P.PHARMACY_STOCK_VIEW, P.PHARMACY_STOCK_MANAGE],
    },
  ],
  ACCOUNTANT: [
    { moduleName: "patient", permissions: [P.PATIENT_VIEW] },
    {
      moduleName: "billing",
      permissions: [
        P.BILLING_INVOICE_VIEW, P.BILLING_INVOICE_CREATE, P.BILLING_INVOICE_UPDATE, P.BILLING_INVOICE_CANCEL,
        P.BILLING_PAYMENT_VIEW, P.BILLING_PAYMENT_CREATE,
      ],
    },
    { moduleName: "reports", permissions: [P.REPORTS_FINANCIAL_VIEW, P.REPORTS_OPERATIONAL_VIEW, P.REPORTS_CLINICAL_VIEW] },
  ],
};

export const ALL_ROLES: readonly string[] = [ADMIN_ROLE, ...Object.keys(ROLE_ACCESS)];
