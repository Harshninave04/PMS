/**
 * Upgrades module-level role access to sub-item permissions.
 *
 * The sidebar used to be all-or-nothing per module, so a stored role says "this
 * user can reach the `patient` module" and nothing finer. That is not enough to
 * tell "All Patients" apart from "Documents", which is the whole point of this
 * work. Rather than rebuild the access list from the shipped defaults and hope
 * nobody notices what was lost, the migration *translates* what the database
 * already grants into the nearest sub-item permissions, and the seed unions the
 * two. Existing users therefore keep every screen they had.
 */
import { permissionKey } from "./permissions.config";
import { normalizePermissions } from "./default-permissions";

type KeyList = readonly string[];

const K = permissionKey;

function crud(...targets: readonly (readonly [string, string])[]): string[] {
    return targets.flatMap(([moduleKey, subItemKey]) =>
        ["view", "create", "update", "delete"].map((action) => K(moduleKey, subItemKey, action))
    );
}

/** Views across a whole module, used by the broad legacy `view` permissions. */
function views(moduleKey: string, ...subItemKeys: string[]): string[] {
    return subItemKeys.map((subItemKey) => K(moduleKey, subItemKey, "view"));
}

/**
 * Legacy permission key -> the sub-item permissions it stands for.
 *
 * A legacy key is deliberately mapped as widely as it actually was: the old
 * `patient.patient.view` unlocked every patient page, so the migration has to
 * unlock every patient sub-item too, otherwise the migration itself would take
 * access away.
 */
const LEGACY_TO_SUB_ITEM: Readonly<Record<string, KeyList>> = {
    // Patients
    "patient.patient.view": [...views("patients", "list", "profile", "register")],
    "patient.patient.create": [K("patients", "register", "create")],
    "patient.patient.update": [K("patients", "list", "update"), K("patients", "profile", "update")],
    "patient.patient.delete": [K("patients", "list", "delete"), K("patients", "profile", "delete")],
    "patient.document.upload": [K("patients", "documents", "view"), K("patients", "documents", "upload")],
    "patient.document.delete": [K("patients", "documents", "delete")],

    // OPD
    "appointment.appointment.view": [...views("opd", "book", "queue", "list")],
    "appointment.appointment.create": [K("opd", "book", "create")],
    "appointment.appointment.update": [K("opd", "queue", "update"), K("opd", "list", "update"), K("opd", "book", "update")],
    "appointment.appointment.cancel": [K("opd", "book", "update"), K("opd", "queue", "update"), K("opd", "list", "update")],

    // Admissions & wards
    "admission.admission.view": [
        ...views("admissions", "new", "current", "transfer", "discharge", "summary", "history"),
    ],
    "admission.admission.create": [K("admissions", "new", "create")],
    "admission.admission.update": [K("admissions", "current", "update"), K("admissions", "new", "update")],
    "admission.admission.transfer": [K("admissions", "transfer", "create")],
    "admission.admission.discharge": [K("admissions", "discharge", "discharge")],
    "admission.admission.cancel": [K("admissions", "current", "delete")],
    "ward.ward.view": [...views("wards", "availability", "list", "rooms", "beds")],
    "ward.ward.manage": [
        ...crud(["wards", "list"], ["wards", "rooms"], ["wards", "beds"]),
        ...views("wards", "availability"),
    ],

    // Consultation
    "clinical.record.view": [...views("clinical", "consultations", "history")],
    "clinical.record.create": [K("clinical", "consultations", "create")],
    "clinical.record.update": [K("clinical", "consultations", "update"), K("clinical", "history", "update")],
    "clinical.record.delete": [K("clinical", "consultations", "delete")],
    "clinical.diagnosis.view": [...views("clinical", "consultations")],
    "clinical.diagnosis.create": [K("clinical", "consultations", "create")],
    "clinical.prescription.view": [...views("clinical", "prescriptions")],
    "clinical.prescription.create": [K("clinical", "prescriptions", "prescribe")],
    "clinical.prescription.cancel": [K("clinical", "prescriptions", "update"), K("clinical", "prescriptions", "delete")],

    // Nursing
    "nursing.vitals.view": [...views("nursing", "vitals")],
    "nursing.vitals.create": [K("nursing", "vitals", "create")],
    "nursing.vitals.update": [K("nursing", "vitals", "update")],
    "nursing.task.view": [...views("nursing", "patients", "medications", "notes")],
    "nursing.task.create": [K("nursing", "notes", "create"), K("nursing", "medications", "create")],
    "nursing.task.execute": [K("nursing", "medications", "update")],

    // Pharmacy
    "pharmacy.prescription.view": [...views("pharmacy", "prescriptions", "dispensing")],
    "pharmacy.dispense.create": [K("pharmacy", "dispensing", "dispense")],
    "pharmacy.stock.view": [...views("pharmacy", "stock", "medicines")],
    "pharmacy.stock.manage": [
        ...crud(["pharmacy", "stock"], ["pharmacy", "medicines"], ["pharmacy", "categories"], ["pharmacy", "expiry"]),
    ],

    // Billing
    "billing.invoice.view": [...views("billing", "create", "invoices")],
    "billing.invoice.create": [K("billing", "create", "create"), K("billing", "invoices", "create")],
    "billing.invoice.update": [K("billing", "create", "update"), K("billing", "invoices", "update")],
    "billing.invoice.cancel": [K("billing", "create", "delete"), K("billing", "invoices", "delete")],
    "billing.payment.view": [...views("billing", "payments", "outstanding")],
    "billing.payment.create": [K("billing", "payments", "create")],

    // Reports
    "reports.financial.view": [...views("reports", "billing")],
    "reports.clinical.view": [...views("reports", "summary", "patients", "appointments", "admissions")],
    "reports.operational.view": [...views("reports", "doctors")],

    // Staff, users, roles, hospital
    "staff.staff.view": [...views("admin", "staff")],
    "staff.staff.create": [K("admin", "staff", "create")],
    "staff.staff.update": [K("admin", "staff", "update"), K("admin", "schedule", "update")],
    "staff.department.manage": [K("admin", "departments", "create"), K("admin", "departments", "update"), K("admin", "departments", "delete")],
    "user.user.view": [...views("admin", "users")],
    "user.user.create": [K("admin", "users", "create")],
    "user.user.update": [K("admin", "users", "update")],
    "user.user.disable": [K("admin", "users", "update")],
    "role.role.view": [...views("admin", "roles")],
    "role.role.update": [K("admin", "roles", "update"), K("admin", "roles", "delete")],
    "organization.organization.view": [...views("admin", "hospital")],
    "organization.organization.create": [K("admin", "hospital", "create")],
    "organization.organization.update": [K("admin", "hospital", "update")],
    "organization.organization.delete": [K("admin", "hospital", "delete")],
    "department.department.view": [...views("admin", "departments")],
    "department.department.create": [K("admin", "departments", "create")],
    "department.department.update": [K("admin", "departments", "update")],
    "department.department.delete": [K("admin", "departments", "delete")],
    "doctor.doctor.view": [...views("admin", "doctors")],
    "doctor.doctor.create": [K("admin", "doctors", "create")],
    "doctor.doctor.update": [K("admin", "doctors", "update")],
    "doctor.doctor.delete": [K("admin", "doctors", "delete")],

    // Dashboard
    "dashboard.dashboard.view": [...views("dashboard", "main")],
};

/**
 * Legacy keys that used to be granted to every role purely so that form
 * dropdowns would populate. They unlock nothing on the sidebar, so they are
 * dropped during migration and served by the reference-lookup endpoints
 * instead (see `ROUTE_PERMISSIONS` in `rbac/route-permissions.ts`).
 */
const REFERENCE_LOOKUP_KEYS: ReadonlySet<string> = new Set([
    "user.directory.view",
    "organization.organization.view",
    "department.department.view",
    "doctor.doctor.view",
    "ward.ward.view",
]);

/** Translates one legacy permission key into sub-item permissions. */
export function translateLegacyPermission(legacyPermission: string): string[] {
    return [...(LEGACY_TO_SUB_ITEM[legacyPermission] ?? [])];
}

/**
 * Sub-item permissions equivalent to everything a stored role already grants.
 *
 * Deterministic and additive: it never returns less than the role had, and it
 * never invents a screen the legacy access list did not cover.
 */
export function migrateLegacyAccess(legacyPermissions: Iterable<string> | null | undefined): string[] {
    const mapped: string[] = [];
    for (const permission of legacyPermissions ?? []) {
        mapped.push(...translateLegacyPermission(permission));
    }
    return normalizePermissions(mapped);
}