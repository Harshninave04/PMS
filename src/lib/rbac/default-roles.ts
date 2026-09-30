import { IAccess } from "@/interfaces/role.interface";
import {
    OrganizationalBoundary,
    PERMISSION_KEYS,
    RelationalConstraint,
} from "@/types/rbac";

/**
 * Canonical catalog of the roles Medistra HMS ships with.
 *
 * These roles are inserted automatically the first time the app connects to a
 * database (see src/lib/bootstrap/ensure-defaults.ts) so an administrator can
 * create users immediately, without running the destructive `npm run seed`.
 *
 * IMPORTANT: this file is a standalone copy of the role block in src/seed.ts.
 * `npm run seed` recreates the same 39 roles from scratch (it wipes the Role
 * collection first), so both paths must stay in sync. tests/rbac/defaults.test.ts
 * asserts the two catalogs match.
 */

export interface DefaultRoleDefinition {
    role: string;
    access: IAccess[];
}

export interface DefaultRoleHierarchyDefinition {
    parent: string;
    target: string;
    permissions: string[];
}

export const DASHBOARD_ACCESS: IAccess = {
    moduleName: "dashboard",
    permissions: [PERMISSION_KEYS.DASHBOARD_VIEW]
};

/**
 * Every authenticated role must be able to load its own dashboard.
 * Without this grant the /api/dashboard/stats guard rejects the request and
 * every non-super-admin falls back to the same empty placeholder view.
 */
export function withDashboardAccess(accessList: IAccess[]): IAccess[] {
    const alreadyGranted = Array.isArray(accessList) && accessList.some(
        item => (item.moduleName || "").toLowerCase() === DASHBOARD_ACCESS.moduleName
    );
    return alreadyGranted ? accessList : [DASHBOARD_ACCESS, ...(accessList ?? [])];
}

/**
 * Attaches an explicit orgScope/relScope grant to every permission so the
 * RBAC scope resolver never has to fall back to a default guess.
 */
export function enrichAccessWithGrants(accessList: IAccess[], roleName: string): IAccess[] {
    return accessList.map(item => {
        const isDoc = roleName.includes("DOCTOR") || roleName.includes("CONSULTANT");
        const isOrgLevel = roleName.includes("ORGANIZATION");
        const isGlobal = roleName.includes("SYSTEM_");
        const defaultOrgScope: OrganizationalBoundary = isGlobal ? "GLOBAL" : (isOrgLevel ? "ORGANIZATION" : "BRANCH");

        const grants = (item.permissions || []).map((permission) => {
            let relScope: RelationalConstraint = "UNRESTRICTED";
            if (isDoc && (permission.startsWith("appointment.") || permission.startsWith("clinical."))) {
                relScope = "OWN";
            } else if (roleName.includes("NURSE") && permission.startsWith("nursing.task.")) {
                relScope = "ASSIGNED";
            }
            return {
                permission,
                orgScope: defaultOrgScope as OrganizationalBoundary,
                relScope
            };
        });

        return {
            ...item,
            grants
        };
    });
}

export const FULL_ACCESS: IAccess[] = [
    { moduleName: "patient", permissions: [PERMISSION_KEYS.PATIENT_VIEW, PERMISSION_KEYS.PATIENT_CREATE, PERMISSION_KEYS.PATIENT_UPDATE, PERMISSION_KEYS.PATIENT_DELETE, PERMISSION_KEYS.PATIENT_EXPORT] },
    { moduleName: "appointment", permissions: [PERMISSION_KEYS.APPOINTMENT_VIEW, PERMISSION_KEYS.APPOINTMENT_CREATE, PERMISSION_KEYS.APPOINTMENT_UPDATE, PERMISSION_KEYS.APPOINTMENT_CANCEL] },
    { moduleName: "admission", permissions: [PERMISSION_KEYS.ADMISSION_VIEW, PERMISSION_KEYS.ADMISSION_CREATE, PERMISSION_KEYS.ADMISSION_UPDATE, PERMISSION_KEYS.ADMISSION_TRANSFER, PERMISSION_KEYS.ADMISSION_DISCHARGE] },
    { moduleName: "clinical", permissions: [PERMISSION_KEYS.CLINICAL_RECORD_VIEW, PERMISSION_KEYS.CLINICAL_RECORD_CREATE, PERMISSION_KEYS.CLINICAL_RECORD_UPDATE, PERMISSION_KEYS.CLINICAL_RECORD_SIGN, PERMISSION_KEYS.CLINICAL_DIAGNOSIS_VIEW, PERMISSION_KEYS.CLINICAL_DIAGNOSIS_CREATE, PERMISSION_KEYS.CLINICAL_DIAGNOSIS_UPDATE, PERMISSION_KEYS.CLINICAL_PRESCRIPTION_VIEW, PERMISSION_KEYS.CLINICAL_PRESCRIPTION_CREATE, PERMISSION_KEYS.CLINICAL_PRESCRIPTION_UPDATE, PERMISSION_KEYS.CLINICAL_PRESCRIPTION_CANCEL] },
    { moduleName: "nursing", permissions: [PERMISSION_KEYS.NURSING_VITALS_VIEW, PERMISSION_KEYS.NURSING_VITALS_CREATE, PERMISSION_KEYS.NURSING_VITALS_UPDATE] },
    { moduleName: "lab", permissions: [PERMISSION_KEYS.LAB_ORDER_VIEW, PERMISSION_KEYS.LAB_ORDER_CREATE, PERMISSION_KEYS.LAB_SAMPLE_COLLECT, PERMISSION_KEYS.LAB_RESULT_CREATE, PERMISSION_KEYS.LAB_RESULT_UPDATE, PERMISSION_KEYS.LAB_RESULT_VERIFY, PERMISSION_KEYS.LAB_REPORT_PUBLISH] },
    { moduleName: "radiology", permissions: [PERMISSION_KEYS.RADIOLOGY_ORDER_VIEW, PERMISSION_KEYS.RADIOLOGY_ORDER_CREATE, PERMISSION_KEYS.RADIOLOGY_STUDY_PERFORM, PERMISSION_KEYS.RADIOLOGY_REPORT_CREATE, PERMISSION_KEYS.RADIOLOGY_REPORT_VERIFY, PERMISSION_KEYS.RADIOLOGY_REPORT_PUBLISH] },
    { moduleName: "pharmacy", permissions: [PERMISSION_KEYS.PHARMACY_PRESCRIPTION_VIEW, PERMISSION_KEYS.PHARMACY_DISPENSE_CREATE, PERMISSION_KEYS.PHARMACY_DISPENSE_CANCEL, PERMISSION_KEYS.PHARMACY_STOCK_VIEW] },
    { moduleName: "billing", permissions: [PERMISSION_KEYS.BILLING_INVOICE_VIEW, PERMISSION_KEYS.BILLING_INVOICE_CREATE, PERMISSION_KEYS.BILLING_INVOICE_UPDATE, PERMISSION_KEYS.BILLING_INVOICE_CANCEL, PERMISSION_KEYS.BILLING_PAYMENT_VIEW, PERMISSION_KEYS.BILLING_PAYMENT_CREATE, PERMISSION_KEYS.BILLING_REFUND_CREATE] },
    { moduleName: "inventory", permissions: [PERMISSION_KEYS.INVENTORY_STOCK_VIEW, PERMISSION_KEYS.INVENTORY_STOCK_RECEIVE, PERMISSION_KEYS.INVENTORY_STOCK_ISSUE, PERMISSION_KEYS.INVENTORY_STOCK_TRANSFER, PERMISSION_KEYS.INVENTORY_STOCK_ADJUST] },
    { moduleName: "procurement", permissions: [PERMISSION_KEYS.PROCUREMENT_REQUEST_CREATE, PERMISSION_KEYS.PROCUREMENT_REQUEST_APPROVE, PERMISSION_KEYS.PROCUREMENT_ORDER_CREATE, PERMISSION_KEYS.PROCUREMENT_ORDER_APPROVE] },
    { moduleName: "user", permissions: [PERMISSION_KEYS.USER_VIEW, PERMISSION_KEYS.USER_CREATE, PERMISSION_KEYS.USER_UPDATE, PERMISSION_KEYS.USER_DISABLE] },
    { moduleName: "role", permissions: [PERMISSION_KEYS.ROLE_VIEW, PERMISSION_KEYS.ROLE_CREATE, PERMISSION_KEYS.ROLE_UPDATE, PERMISSION_KEYS.ROLE_DELETE, PERMISSION_KEYS.ROLE_ASSIGN] },
    { moduleName: "audit", permissions: [PERMISSION_KEYS.AUDIT_VIEW, PERMISSION_KEYS.AUDIT_EXPORT] },
    { moduleName: "system", permissions: [PERMISSION_KEYS.SYSTEM_SETTINGS_VIEW, PERMISSION_KEYS.SYSTEM_SETTINGS_UPDATE] }
];

export const AUDITOR_ACCESS: IAccess[] = [
    { moduleName: "audit", permissions: [PERMISSION_KEYS.AUDIT_VIEW, PERMISSION_KEYS.AUDIT_EXPORT] },
    { moduleName: "role", permissions: [PERMISSION_KEYS.ROLE_VIEW] },
    { moduleName: "user", permissions: [PERMISSION_KEYS.USER_VIEW] },
    { moduleName: "system", permissions: [PERMISSION_KEYS.SYSTEM_SETTINGS_VIEW] }
];

/**
 * The IT administrator provisions accounts and roles, so it needs the user and
 * role management permissions in addition to system settings. It deliberately
 * stops short of SYSTEM_SUPER_ADMIN: no role.role.delete, no clinical/financial
 * data access, and no global org scope beyond the SYSTEM_* naming.
 */
export const IT_ADMIN_ACCESS: IAccess[] = [
    { moduleName: "user", permissions: [PERMISSION_KEYS.USER_VIEW, PERMISSION_KEYS.USER_CREATE, PERMISSION_KEYS.USER_UPDATE, PERMISSION_KEYS.USER_DISABLE] },
    { moduleName: "role", permissions: [PERMISSION_KEYS.ROLE_VIEW, PERMISSION_KEYS.ROLE_CREATE, PERMISSION_KEYS.ROLE_UPDATE, PERMISSION_KEYS.ROLE_ASSIGN] },
    { moduleName: "system", permissions: [PERMISSION_KEYS.SYSTEM_SETTINGS_VIEW, PERMISSION_KEYS.SYSTEM_SETTINGS_UPDATE] }
];

export const DOCTOR_ACCESS: IAccess[] = [
    { moduleName: "patient", permissions: [PERMISSION_KEYS.PATIENT_VIEW] },
    { moduleName: "appointment", permissions: [PERMISSION_KEYS.APPOINTMENT_VIEW, PERMISSION_KEYS.APPOINTMENT_CREATE] },
    { moduleName: "admission", permissions: [PERMISSION_KEYS.ADMISSION_VIEW] },
    { moduleName: "clinical", permissions: [PERMISSION_KEYS.CLINICAL_RECORD_VIEW, PERMISSION_KEYS.CLINICAL_RECORD_CREATE, PERMISSION_KEYS.CLINICAL_RECORD_UPDATE, PERMISSION_KEYS.CLINICAL_RECORD_SIGN, PERMISSION_KEYS.CLINICAL_DIAGNOSIS_VIEW, PERMISSION_KEYS.CLINICAL_DIAGNOSIS_CREATE, PERMISSION_KEYS.CLINICAL_DIAGNOSIS_UPDATE, PERMISSION_KEYS.CLINICAL_PRESCRIPTION_VIEW, PERMISSION_KEYS.CLINICAL_PRESCRIPTION_CREATE, PERMISSION_KEYS.CLINICAL_PRESCRIPTION_CANCEL] },
    { moduleName: "nursing", permissions: [PERMISSION_KEYS.NURSING_VITALS_VIEW] },
    { moduleName: "lab", permissions: [PERMISSION_KEYS.LAB_ORDER_VIEW, PERMISSION_KEYS.LAB_ORDER_CREATE] },
    { moduleName: "radiology", permissions: [PERMISSION_KEYS.RADIOLOGY_ORDER_VIEW, PERMISSION_KEYS.RADIOLOGY_ORDER_CREATE] },
    { moduleName: "pharmacy", permissions: [PERMISSION_KEYS.PHARMACY_PRESCRIPTION_VIEW] }
];

export const NURSE_ACCESS: IAccess[] = [
    { moduleName: "patient", permissions: [PERMISSION_KEYS.PATIENT_VIEW] },
    { moduleName: "admission", permissions: [PERMISSION_KEYS.ADMISSION_VIEW] },
    { moduleName: "clinical", permissions: [PERMISSION_KEYS.CLINICAL_RECORD_VIEW] },
    { moduleName: "nursing", permissions: [PERMISSION_KEYS.NURSING_VITALS_VIEW, PERMISSION_KEYS.NURSING_VITALS_CREATE, PERMISSION_KEYS.NURSING_VITALS_UPDATE] }
];

export const RECEPTIONIST_ACCESS: IAccess[] = [
    { moduleName: "patient", permissions: [PERMISSION_KEYS.PATIENT_VIEW, PERMISSION_KEYS.PATIENT_CREATE, PERMISSION_KEYS.PATIENT_UPDATE] },
    { moduleName: "appointment", permissions: [PERMISSION_KEYS.APPOINTMENT_VIEW, PERMISSION_KEYS.APPOINTMENT_CREATE, PERMISSION_KEYS.APPOINTMENT_UPDATE, PERMISSION_KEYS.APPOINTMENT_CANCEL] },
    { moduleName: "admission", permissions: [PERMISSION_KEYS.ADMISSION_VIEW, PERMISSION_KEYS.ADMISSION_CREATE] },
    { moduleName: "billing", permissions: [PERMISSION_KEYS.BILLING_INVOICE_VIEW] }
];

export const LAB_TECHNICIAN_ACCESS: IAccess[] = [
    { moduleName: "patient", permissions: [PERMISSION_KEYS.PATIENT_VIEW] },
    { moduleName: "lab", permissions: [PERMISSION_KEYS.LAB_ORDER_VIEW, PERMISSION_KEYS.LAB_SAMPLE_COLLECT, PERMISSION_KEYS.LAB_RESULT_CREATE, PERMISSION_KEYS.LAB_RESULT_UPDATE] }
];

export const LAB_SUPERVISOR_ACCESS: IAccess[] = [
    ...LAB_TECHNICIAN_ACCESS,
    { moduleName: "lab", permissions: [PERMISSION_KEYS.LAB_ORDER_VIEW, PERMISSION_KEYS.LAB_SAMPLE_COLLECT, PERMISSION_KEYS.LAB_RESULT_CREATE, PERMISSION_KEYS.LAB_RESULT_UPDATE, PERMISSION_KEYS.LAB_RESULT_VERIFY, PERMISSION_KEYS.LAB_REPORT_PUBLISH] }
];

export const PHARMACIST_ACCESS: IAccess[] = [
    { moduleName: "pharmacy", permissions: [PERMISSION_KEYS.PHARMACY_PRESCRIPTION_VIEW, PERMISSION_KEYS.PHARMACY_DISPENSE_CREATE, PERMISSION_KEYS.PHARMACY_DISPENSE_CANCEL, PERMISSION_KEYS.PHARMACY_STOCK_VIEW] }
];

export const BILLING_OFFICER_ACCESS: IAccess[] = [
    { moduleName: "billing", permissions: [PERMISSION_KEYS.BILLING_INVOICE_VIEW, PERMISSION_KEYS.BILLING_INVOICE_CREATE, PERMISSION_KEYS.BILLING_INVOICE_UPDATE, PERMISSION_KEYS.BILLING_PAYMENT_VIEW, PERMISSION_KEYS.BILLING_PAYMENT_CREATE] }
];

export const INVENTORY_MANAGER_ACCESS: IAccess[] = [
    { moduleName: "inventory", permissions: [PERMISSION_KEYS.INVENTORY_STOCK_VIEW, PERMISSION_KEYS.INVENTORY_STOCK_RECEIVE, PERMISSION_KEYS.INVENTORY_STOCK_ISSUE, PERMISSION_KEYS.INVENTORY_STOCK_TRANSFER, PERMISSION_KEYS.INVENTORY_STOCK_ADJUST] }
];

export const BLOOD_BANK_TECHNICIAN_ACCESS: IAccess[] = [
    { moduleName: "blood-bank", permissions: [PERMISSION_KEYS.BLOOD_BANK_DONOR_VIEW, PERMISSION_KEYS.BLOOD_BANK_DONOR_CREATE, PERMISSION_KEYS.BLOOD_BANK_COLLECTION_CREATE, PERMISSION_KEYS.BLOOD_BANK_TESTING_CREATE, PERMISSION_KEYS.BLOOD_BANK_CROSSMATCH_CREATE, PERMISSION_KEYS.BLOOD_BANK_INVENTORY_VIEW, PERMISSION_KEYS.BLOOD_BANK_ISSUE_CREATE] }
];

export const BLOOD_BANK_MANAGER_ACCESS: IAccess[] = [
    ...BLOOD_BANK_TECHNICIAN_ACCESS,
    { moduleName: "blood-bank", permissions: [PERMISSION_KEYS.BLOOD_BANK_DONOR_UPDATE, PERMISSION_KEYS.BLOOD_BANK_INVENTORY_ADJUST, PERMISSION_KEYS.BLOOD_BANK_ISSUE_APPROVE, PERMISSION_KEYS.BLOOD_BANK_REPORTS_VIEW] }
];

/**
 * HR is driven entirely by the staff + user modules - src/services/hr.service.ts
 * performs no permission checks of its own - so the HR roles reuse those keys
 * rather than an unused "hr.*" namespace.
 */
export const HR_OFFICER_ACCESS: IAccess[] = [
    { moduleName: "staff", permissions: [PERMISSION_KEYS.STAFF_VIEW, PERMISSION_KEYS.STAFF_CREATE, PERMISSION_KEYS.STAFF_UPDATE] },
    { moduleName: "user", permissions: [PERMISSION_KEYS.USER_VIEW] },
    { moduleName: "organization", permissions: [PERMISSION_KEYS.DEPARTMENT_VIEW] }
];

export const HR_MANAGER_ACCESS: IAccess[] = [
    { moduleName: "staff", permissions: [PERMISSION_KEYS.STAFF_VIEW, PERMISSION_KEYS.STAFF_CREATE, PERMISSION_KEYS.STAFF_UPDATE, PERMISSION_KEYS.STAFF_DEPT_MANAGE] },
    { moduleName: "user", permissions: [PERMISSION_KEYS.USER_VIEW, PERMISSION_KEYS.USER_CREATE, PERMISSION_KEYS.USER_UPDATE] },
    { moduleName: "organization", permissions: [PERMISSION_KEYS.DEPARTMENT_VIEW, PERMISSION_KEYS.DEPARTMENT_CREATE, PERMISSION_KEYS.DEPARTMENT_UPDATE] }
];

export const INSURANCE_OFFICER_ACCESS: IAccess[] = [
    { moduleName: "insurance", permissions: [PERMISSION_KEYS.INSURANCE_POLICY_VIEW, PERMISSION_KEYS.INSURANCE_POLICY_MANAGE, PERMISSION_KEYS.INSURANCE_CLAIM_VIEW, PERMISSION_KEYS.INSURANCE_CLAIM_CREATE, PERMISSION_KEYS.INSURANCE_CLAIM_SUBMIT] }
];

export const INSURANCE_MANAGER_ACCESS: IAccess[] = [
    { moduleName: "insurance", permissions: [PERMISSION_KEYS.INSURANCE_POLICY_VIEW, PERMISSION_KEYS.INSURANCE_POLICY_MANAGE, PERMISSION_KEYS.INSURANCE_CLAIM_VIEW, PERMISSION_KEYS.INSURANCE_CLAIM_CREATE, PERMISSION_KEYS.INSURANCE_CLAIM_SUBMIT, PERMISSION_KEYS.INSURANCE_CLAIM_ADJUDICATE] }
];

export const DEFAULT_ROLE_DEFINITIONS: DefaultRoleDefinition[] = [
    // PLATFORM LEVEL
    { role: "SYSTEM_SUPER_ADMIN", access: FULL_ACCESS },
    { role: "SYSTEM_AUDITOR", access: AUDITOR_ACCESS },
    { role: "SYSTEM_IT_ADMIN", access: IT_ADMIN_ACCESS },

    // ORGANIZATION LEVEL
    { role: "ORGANIZATION_ADMIN", access: FULL_ACCESS },
    { role: "ORGANIZATION_AUDITOR", access: AUDITOR_ACCESS },

    // HOSPITAL LEVEL
    { role: "HOSPITAL_ADMIN", access: FULL_ACCESS },
    { role: "HOSPITAL_AUDITOR", access: AUDITOR_ACCESS },

    // BRANCH LEVEL
    { role: "BRANCH_MANAGER", access: FULL_ACCESS },

    // CLINICAL
    { role: "DOCTOR", access: DOCTOR_ACCESS },
    { role: "CONSULTANT", access: DOCTOR_ACCESS },
    { role: "NURSE", access: NURSE_ACCESS },
    { role: "NURSE_MANAGER", access: NURSE_ACCESS },

    // LABORATORY
    { role: "LAB_TECHNICIAN", access: LAB_TECHNICIAN_ACCESS },
    { role: "LAB_SUPERVISOR", access: LAB_SUPERVISOR_ACCESS },

    // RADIOLOGY
    { role: "RADIOLOGY_TECHNICIAN", access: [{ moduleName: "radiology", permissions: [PERMISSION_KEYS.RADIOLOGY_ORDER_VIEW, PERMISSION_KEYS.RADIOLOGY_STUDY_PERFORM] }] },
    { role: "RADIOLOGIST", access: [{ moduleName: "radiology", permissions: [PERMISSION_KEYS.RADIOLOGY_ORDER_VIEW, PERMISSION_KEYS.RADIOLOGY_REPORT_CREATE, PERMISSION_KEYS.RADIOLOGY_REPORT_VERIFY, PERMISSION_KEYS.RADIOLOGY_REPORT_PUBLISH] }] },

    // PHARMACY
    { role: "PHARMACIST", access: PHARMACIST_ACCESS },
    { role: "PHARMACY_MANAGER", access: PHARMACIST_ACCESS },

    // RECEPTION / FRONT DESK
    { role: "RECEPTIONIST", access: RECEPTIONIST_ACCESS },
    { role: "FRONT_DESK_MANAGER", access: RECEPTIONIST_ACCESS },

    // BILLING / FINANCE
    { role: "CASHIER", access: [{ moduleName: "billing", permissions: [PERMISSION_KEYS.BILLING_INVOICE_VIEW, PERMISSION_KEYS.BILLING_PAYMENT_VIEW, PERMISSION_KEYS.BILLING_PAYMENT_CREATE] }] },
    { role: "BILLING_OFFICER", access: BILLING_OFFICER_ACCESS },
    { role: "BILLING_MANAGER", access: [...BILLING_OFFICER_ACCESS, { moduleName: "billing", permissions: [PERMISSION_KEYS.BILLING_REFUND_CREATE] }] },
    { role: "FINANCE_MANAGER", access: FULL_ACCESS },

    // INVENTORY / PROCUREMENT
    { role: "STOREKEEPER", access: [{ moduleName: "inventory", permissions: [PERMISSION_KEYS.INVENTORY_STOCK_VIEW, PERMISSION_KEYS.INVENTORY_STOCK_RECEIVE, PERMISSION_KEYS.INVENTORY_STOCK_ISSUE, PERMISSION_KEYS.INVENTORY_STOCK_TRANSFER] }] },
    { role: "INVENTORY_MANAGER", access: INVENTORY_MANAGER_ACCESS },
    { role: "PROCUREMENT_OFFICER", access: [{ moduleName: "procurement", permissions: [PERMISSION_KEYS.PROCUREMENT_REQUEST_CREATE, PERMISSION_KEYS.PROCUREMENT_ORDER_CREATE] }] },
    { role: "PROCUREMENT_MANAGER", access: [{ moduleName: "procurement", permissions: [PERMISSION_KEYS.PROCUREMENT_REQUEST_CREATE, PERMISSION_KEYS.PROCUREMENT_REQUEST_APPROVE, PERMISSION_KEYS.PROCUREMENT_ORDER_CREATE, PERMISSION_KEYS.PROCUREMENT_ORDER_APPROVE] }] },

    // HR
    { role: "HR_OFFICER", access: HR_OFFICER_ACCESS },
    { role: "HR_MANAGER", access: HR_MANAGER_ACCESS },

    // EMERGENCY
    { role: "EMERGENCY_DOCTOR", access: DOCTOR_ACCESS },
    { role: "EMERGENCY_NURSE", access: NURSE_ACCESS },
    { role: "EMERGENCY_MANAGER", access: FULL_ACCESS },

    // OPERATION THEATRE
    { role: "OT_NURSE", access: NURSE_ACCESS },
    { role: "OT_MANAGER", access: FULL_ACCESS },

    // BLOOD BANK
    { role: "BLOOD_BANK_TECHNICIAN", access: BLOOD_BANK_TECHNICIAN_ACCESS },
    { role: "BLOOD_BANK_MANAGER", access: BLOOD_BANK_MANAGER_ACCESS },

    // INSURANCE
    { role: "INSURANCE_OFFICER", access: INSURANCE_OFFICER_ACCESS },
    { role: "INSURANCE_MANAGER", access: INSURANCE_MANAGER_ACCESS }
];

/**
 * Default parent -> child delegation.
 *
 * The first block is the account-provisioning chain: each level may create
 * users holding the next level down. The second block is pure permission
 * inheritance for line managers.
 */
export const DEFAULT_ROLE_HIERARCHY: DefaultRoleHierarchyDefinition[] = [
    { parent: "SYSTEM_SUPER_ADMIN", target: "ORGANIZATION_ADMIN", permissions: [PERMISSION_KEYS.ROLE_ASSIGN, PERMISSION_KEYS.ROLE_CREATE] },
    { parent: "ORGANIZATION_ADMIN", target: "HOSPITAL_ADMIN", permissions: [PERMISSION_KEYS.ROLE_ASSIGN, PERMISSION_KEYS.ROLE_CREATE] },
    { parent: "HOSPITAL_ADMIN", target: "BRANCH_MANAGER", permissions: [PERMISSION_KEYS.ROLE_ASSIGN, PERMISSION_KEYS.ROLE_CREATE] },
    { parent: "BRANCH_MANAGER", target: "DOCTOR", permissions: [PERMISSION_KEYS.ROLE_ASSIGN] },
    { parent: "BRANCH_MANAGER", target: "NURSE", permissions: [PERMISSION_KEYS.ROLE_ASSIGN] },

    // Inheritance links
    { parent: "NURSE_MANAGER", target: "NURSE", permissions: ["INHERIT"] },
    { parent: "PHARMACY_MANAGER", target: "PHARMACIST", permissions: ["INHERIT"] },
    { parent: "BILLING_MANAGER", target: "BILLING_OFFICER", permissions: ["INHERIT"] },
    { parent: "LAB_SUPERVISOR", target: "LAB_TECHNICIAN", permissions: ["INHERIT"] },
    { parent: "INVENTORY_MANAGER", target: "STOREKEEPER", permissions: ["INHERIT"] }
];

/**
 * Builds the `access` array to persist for a role: dashboard grant guaranteed,
 * then an explicit org/rel scope grant per permission.
 */
export function buildRoleAccess(roleName: string, access: IAccess[]): IAccess[] {
    return enrichAccessWithGrants(withDashboardAccess(access), roleName);
}
