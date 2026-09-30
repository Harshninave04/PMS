import { Types } from "mongoose";
import { NextResponse } from "next/server";

/**
 * All 25 canonical modules in Medistra HMS
 */
export type ModuleKey =
  | "dashboard"
  | "patient"
  | "staff"
  | "appointment"
  | "admission"
  | "ward"
  | "clinical"
  | "nursing"
  | "lab"
  | "radiology"
  | "pharmacy"
  | "emergency"
  | "ot"
  | "blood-bank"
  | "inventory"
  | "procurement"
  | "billing"
  | "insurance"
  | "reports"
  | "hr"
  | "notifications"
  | "admin"
  | "organization"
  | "audit"
  | "config";

/**
 * Organizational boundary scopes (Spatial / Administrative Jurisdiction)
 */
export type OrganizationalBoundary =
  | "GLOBAL"
  | "ORGANIZATION"
  | "BRANCH"
  | "DEPARTMENT"
  | "WARD";

/**
 * Relational constraint scopes (Subject / Actor-to-Entity Connection)
 */
export type RelationalConstraint =
  | "UNRESTRICTED"
  | "ASSIGNED"
  | "OWN";

/**
 * Represents a deterministic, explicit permission-to-scope grant
 */
export interface IPermissionGrant {
  readonly permission: string;
  readonly orgScope: OrganizationalBoundary;
  readonly relScope: RelationalConstraint;
}

/**
 * Fully resolved context for an authenticated request
 */
export interface AuthenticatedUserContext {
  readonly userId: Types.ObjectId;
  readonly email: string;
  readonly name?: string;
  readonly roleId: Types.ObjectId;
  readonly roleName: string;
  readonly organizationId?: Types.ObjectId;
  readonly branchId?: Types.ObjectId;
  readonly departmentId?: Types.ObjectId;
  readonly doctorProfileId?: Types.ObjectId;
  readonly staffProfileId?: Types.ObjectId;
  readonly assignedWardIds: readonly Types.ObjectId[];
  readonly permissions: ReadonlySet<string>;
  readonly grants: ReadonlyMap<string, IPermissionGrant>;
}

/**
 * Strongly typed MongoDB filter query for scope enforcement
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export type ScopeFilter<T = unknown> = Record<string, unknown>;

/**
 * Successful authorization result containing derived, immutable query filter
 */
export interface AuthorizationSuccess<T> {
  readonly isAuthorized: true;
  readonly context: AuthenticatedUserContext;
  readonly filter: ScopeFilter<T>;
  readonly grant: IPermissionGrant;
}

/**
 * Failed authorization result with strict 401 or 403 HTTP response
 */
export interface AuthorizationFailure {
  readonly isAuthorized: false;
  readonly response: NextResponse;
  readonly errorCode: "UNAUTHENTICATED" | "FORBIDDEN" | "INACTIVE_ACCOUNT";
  readonly reason: string;
}

/**
 * Discriminated union of authorization outcome
 */
export type AuthorizationResult<T> = AuthorizationSuccess<T> | AuthorizationFailure;

/**
 * Canonical taxonomy of permission strings across Medistra HMS
 */
export const PERMISSION_KEYS = {
  // Patient Management
  PATIENT_VIEW: "patient.patient.view",
  PATIENT_CREATE: "patient.patient.create",
  PATIENT_UPDATE: "patient.patient.update",
  PATIENT_DELETE: "patient.patient.delete",
  PATIENT_MERGE: "patient.patient.merge",
  PATIENT_EXPORT: "patient.patient.export",
  PATIENT_DOC_UPLOAD: "patient.document.upload",
  PATIENT_DOC_DELETE: "patient.document.delete",

  // Appointments
  APPOINTMENT_VIEW: "appointment.appointment.view",
  APPOINTMENT_CREATE: "appointment.appointment.create",
  APPOINTMENT_UPDATE: "appointment.appointment.update",
  APPOINTMENT_CANCEL: "appointment.appointment.cancel",
  APPOINTMENT_QUEUE_MANAGE: "appointment.queue.manage",

  // Admissions & Wards
  ADMISSION_VIEW: "admission.admission.view",
  ADMISSION_CREATE: "admission.admission.create",
  ADMISSION_UPDATE: "admission.admission.update",
  ADMISSION_TRANSFER: "admission.admission.transfer",
  ADMISSION_DISCHARGE: "admission.admission.discharge",
  ADMISSION_CANCEL: "admission.admission.cancel",
  WARD_VIEW: "ward.ward.view",
  WARD_MANAGE: "ward.ward.manage",

  // Clinical & EMR
  CLINICAL_RECORD_VIEW: "clinical.record.view",
  CLINICAL_RECORD_CREATE: "clinical.record.create",
  CLINICAL_RECORD_UPDATE: "clinical.record.update",
  CLINICAL_RECORD_SIGN: "clinical.record.sign",
  CLINICAL_DIAGNOSIS_VIEW: "clinical.diagnosis.view",
  CLINICAL_DIAGNOSIS_CREATE: "clinical.diagnosis.create",
  CLINICAL_DIAGNOSIS_UPDATE: "clinical.diagnosis.update",
  CLINICAL_PRESCRIPTION_VIEW: "clinical.prescription.view",
  CLINICAL_PRESCRIPTION_CREATE: "clinical.prescription.create",
  CLINICAL_PRESCRIPTION_UPDATE: "clinical.prescription.update",
  CLINICAL_PRESCRIPTION_CANCEL: "clinical.prescription.cancel",

  // Nursing
  NURSING_VITALS_VIEW: "nursing.vitals.view",
  NURSING_VITALS_CREATE: "nursing.vitals.create",
  NURSING_VITALS_UPDATE: "nursing.vitals.update",
  NURSING_TASK_VIEW: "nursing.task.view",
  NURSING_TASK_CREATE: "nursing.task.create",
  NURSING_TASK_EXECUTE: "nursing.task.execute",

  // Laboratory
  LAB_ORDER_VIEW: "lab.order.view",
  LAB_ORDER_CREATE: "lab.order.create",
  LAB_SAMPLE_COLLECT: "lab.sample.collect",
  LAB_RESULT_CREATE: "lab.result.create",
  LAB_RESULT_UPDATE: "lab.result.update",
  LAB_RESULT_VERIFY: "lab.result.verify",
  LAB_REPORT_PUBLISH: "lab.report.publish",

  // Radiology
  RADIOLOGY_ORDER_VIEW: "radiology.order.view",
  RADIOLOGY_ORDER_CREATE: "radiology.order.create",
  RADIOLOGY_STUDY_PERFORM: "radiology.study.perform",
  RADIOLOGY_REPORT_CREATE: "radiology.report.create",
  RADIOLOGY_REPORT_VERIFY: "radiology.report.verify",
  RADIOLOGY_REPORT_PUBLISH: "radiology.report.publish",

  // Pharmacy
  PHARMACY_PRESCRIPTION_VIEW: "pharmacy.prescription.view",
  PHARMACY_DISPENSE_CREATE: "pharmacy.dispense.create",
  PHARMACY_DISPENSE_CANCEL: "pharmacy.dispense.cancel",
  PHARMACY_STOCK_VIEW: "pharmacy.stock.view",
  PHARMACY_STOCK_MANAGE: "pharmacy.stock.manage",

  // Billing & Finance
  BILLING_INVOICE_VIEW: "billing.invoice.view",
  BILLING_INVOICE_CREATE: "billing.invoice.create",
  BILLING_INVOICE_UPDATE: "billing.invoice.update",
  BILLING_INVOICE_CANCEL: "billing.invoice.cancel",
  BILLING_PAYMENT_VIEW: "billing.payment.view",
  BILLING_PAYMENT_CREATE: "billing.payment.create",
  BILLING_REFUND_CREATE: "billing.refund.create",

  // Inventory & Procurement
  INVENTORY_STOCK_VIEW: "inventory.stock.view",
  INVENTORY_STOCK_RECEIVE: "inventory.stock.receive",
  INVENTORY_STOCK_ISSUE: "inventory.stock.issue",
  INVENTORY_STOCK_TRANSFER: "inventory.stock.transfer",
  INVENTORY_STOCK_ADJUST: "inventory.stock.adjust",
  PROCUREMENT_REQUEST_CREATE: "procurement.request.create",
  PROCUREMENT_REQUEST_APPROVE: "procurement.request.approve",
  PROCUREMENT_ORDER_CREATE: "procurement.order.create",
  PROCUREMENT_ORDER_APPROVE: "procurement.order.approve",

  // Insurance
  INSURANCE_POLICY_VIEW: "insurance.policy.view",
  INSURANCE_POLICY_MANAGE: "insurance.policy.manage",
  INSURANCE_CLAIM_VIEW: "insurance.claim.view",
  INSURANCE_CLAIM_CREATE: "insurance.claim.create",
  INSURANCE_CLAIM_SUBMIT: "insurance.claim.submit",
  INSURANCE_CLAIM_ADJUDICATE: "insurance.claim.adjudicate",

  // Emergency
  EMERGENCY_TRIAGE_VIEW: "emergency.triage.view",
  EMERGENCY_TRIAGE_CREATE: "emergency.triage.create",
  EMERGENCY_TRIAGE_UPDATE: "emergency.triage.update",
  EMERGENCY_CASE_MANAGE: "emergency.case.manage",

  // Operation Theatre (OT)
  OT_SCHEDULE_VIEW: "ot.schedule.view",
  OT_SCHEDULE_CREATE: "ot.schedule.create",
  OT_SCHEDULE_UPDATE: "ot.schedule.update",
  OT_RECORD_CREATE: "ot.record.create",
  OT_CHECKLIST_VERIFY: "ot.checklist.verify",

  // Blood Bank
  BLOOD_BANK_DONOR_VIEW: "blood-bank.donor.view",
  BLOOD_BANK_DONOR_CREATE: "blood-bank.donor.create",
  BLOOD_BANK_DONOR_UPDATE: "blood-bank.donor.update",
  BLOOD_BANK_COLLECTION_CREATE: "blood-bank.collection.create",
  BLOOD_BANK_TESTING_CREATE: "blood-bank.testing.create",
  BLOOD_BANK_CROSSMATCH_CREATE: "blood-bank.crossmatch.create",
  BLOOD_BANK_INVENTORY_VIEW: "blood-bank.inventory.view",
  BLOOD_BANK_INVENTORY_ADJUST: "blood-bank.inventory.adjust",
  BLOOD_BANK_ISSUE_CREATE: "blood-bank.issue.create",
  BLOOD_BANK_ISSUE_APPROVE: "blood-bank.issue.approve",
  BLOOD_BANK_REPORTS_VIEW: "blood-bank.reports.view",

  // Staff & Administration
  STAFF_VIEW: "staff.staff.view",
  STAFF_CREATE: "staff.staff.create",
  STAFF_UPDATE: "staff.staff.update",
  STAFF_DEPT_MANAGE: "staff.department.manage",
  USER_VIEW: "user.user.view",
  USER_CREATE: "user.user.create",
  USER_UPDATE: "user.user.update",
  USER_DISABLE: "user.user.disable",
  ROLE_VIEW: "role.role.view",
  ROLE_CREATE: "role.role.create",
  ROLE_UPDATE: "role.role.update",
  ROLE_DELETE: "role.role.delete",
  ROLE_ASSIGN: "role.role.assign",
  ROLE_HIERARCHY_VIEW: "role.hierarchy.view",
  ROLE_HIERARCHY_UPDATE: "role.hierarchy.update",

  // Organization & Department Management
  ORGANIZATION_VIEW: "organization.organization.view",
  ORGANIZATION_CREATE: "organization.organization.create",
  ORGANIZATION_UPDATE: "organization.organization.update",
  ORGANIZATION_DELETE: "organization.organization.delete",
  DEPARTMENT_VIEW: "department.department.view",
  DEPARTMENT_CREATE: "department.department.create",
  DEPARTMENT_UPDATE: "department.department.update",
  DEPARTMENT_DELETE: "department.department.delete",

  // Doctor Profiles
  DOCTOR_VIEW: "doctor.doctor.view",
  DOCTOR_CREATE: "doctor.doctor.create",
  DOCTOR_UPDATE: "doctor.doctor.update",
  DOCTOR_DELETE: "doctor.doctor.delete",

  // Reports
  REPORTS_VIEW: "reports.reports.view",
  REPORTS_FINANCIAL_VIEW: "reports.financial.view",
  REPORTS_CLINICAL_VIEW: "reports.clinical.view",
  REPORTS_OPERATIONAL_VIEW: "reports.operational.view",
  REPORTS_EXPORT: "reports.reports.export",

  // Procurement & Supply Chain
  PROCUREMENT_VIEW: "procurement.procurement.view",
  PROCUREMENT_SUPPLIER_MANAGE: "procurement.supplier.manage",
  PROCUREMENT_PO_CREATE: "procurement.purchase-order.create",
  PROCUREMENT_PO_APPROVE: "procurement.purchase-order.approve",
  PROCUREMENT_PO_RECEIVE: "procurement.purchase-order.receive",

  // Alerts & Notifications
  ALERT_VIEW: "alert.alert.view",
  ALERT_CREATE: "alert.alert.create",
  ALERT_MANAGE: "alert.alert.manage",

  // Task & Operations
  TASK_VIEW: "task.task.view",
  TASK_CREATE: "task.task.create",
  TASK_UPDATE: "task.task.update",

  // Dashboard
  DASHBOARD_VIEW: "dashboard.dashboard.view",

  // Audit & System
  AUDIT_VIEW: "audit.audit.view",
  AUDIT_EXPORT: "audit.audit.export",
  SYSTEM_SETTINGS_VIEW: "system.settings.view",
  SYSTEM_SETTINGS_UPDATE: "system.settings.update",
} as const;

export type PermissionKey = typeof PERMISSION_KEYS[keyof typeof PERMISSION_KEYS];
