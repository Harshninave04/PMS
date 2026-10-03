/**
 * Which permission guards which API endpoint.
 *
 * This is the backend half of `permissions.config.ts`: the sidebar says what a
 * user may *see*, this says what the server will *accept*. Both are generated
 * from the same sub-item definitions, so they cannot drift apart.
 *
 * `tests/rbac/guard-contract.test.ts` walks the API directory and fails if a
 * route is missing from this table, which is what makes "deny by default"
 * enforceable rather than aspirational.
 */
import { permissionKey } from "./permissions.config";

const K = permissionKey;

/** Endpoints every authenticated user may call. */
export const PUBLIC_ENDPOINTS: readonly string[] = ["/api/auth", "/api/me/permissions"];

/**
 * Read-only lookups that populate dropdowns in every other module's forms, plus
 * the two navigation-support reads described below.
 *
 * The lookups were previously granted to every role as
 * `BASELINE_REFERENCE_PERMISSIONS` under a module that matched no menu, precisely
 * so that granting navigation access was never a prerequisite for filling in a
 * form. The result is still bounded by tenant scope, and it widens navigation by
 * nothing.
 *
 * `GET /api/menu` is the sidebar itself: it must answer every signed-in user,
 * because hiding entries is what it does, not something it can refuse.
 * `GET /api/role` is the role picker on the user forms. It returns names and
 * counts only — no permission detail — which is why it can stay open while
 * `GET /api/role/[id]` and `GET /api/role/admin` require `admin.roles:view`.
 */
export const LOOKUP_ENDPOINTS: ReadonlySet<string> = new Set([
    "/api/bed",
    "/api/doctor",
    "/api/department",
    "/api/ward",
    "/api/organization",
    "/api/org",
    "/api/user/directory",
    "/api/staff/directory",
    "/api/menu",
    "/api/role",
]);

/** Endpoints whose *GET* is a lookup, but whose writes are governed normally. */
export interface RouteRule {
    /** Path relative to `/api`, without the trailing `[id]` segment. */
    path: string;
    /** HTTP method the rule applies to. */
    method: "GET" | "POST" | "PUT" | "DELETE";
    /** Permission required, or `null` for authenticated-but-unrestricted. */
    permission: string | null;
    /** True when the endpoint is reachable by any active user. */
    lookup?: boolean;
}

/** Shorthand builders keep the table below readable. */
const get = (path: string, permission: string): RouteRule => ({ path, method: "GET", permission });
const post = (path: string, permission: string): RouteRule => ({ path, method: "POST", permission });
const put = (path: string, permission: string): RouteRule => ({ path, method: "PUT", permission });
const del = (path: string, permission: string): RouteRule => ({ path, method: "DELETE", permission });
/**
 * A GET on a reference lookup: any active user, no permission required. The query
 * is still bounded by tenant scope by the controller, and it widens the sidebar
 * by nothing.
 */
const lookupGet = (path: string): RouteRule => ({ path, method: "GET", permission: null, lookup: true });

/** Like `lookupGet`, but not a reference list — the sidebar and own-permissions reads. */
const openGet = (path: string): RouteRule => ({ path, method: "GET", permission: null });

export const ROUTE_PERMISSIONS: readonly RouteRule[] = [
    // Dashboard
    get("/dashboard/stats", K("dashboard", "main", "view")),

    // Patients
    { path: "/patient", method: "GET", permission: K("patients", "list", "view") },
    post("/patient", K("patients", "register", "create")),
    { path: "/patient/[id]", method: "GET", permission: K("patients", "profile", "view") },
    { path: "/patient/[id]", method: "PUT", permission: K("patients", "profile", "update") },
    { path: "/patient/[id]", method: "DELETE", permission: K("patients", "profile", "delete") },
    get("/patient/history", K("patients", "profile", "view")),
    get("/patient/reports", K("patients", "profile", "view")),
    post("/patient/documents", K("patients", "documents", "upload")),
    del("/patient/documents", K("patients", "documents", "delete")),
    post("/upload", K("patients", "documents", "upload")),

    // OPD
    { path: "/appointment", method: "GET", permission: K("opd", "list", "view") },
    post("/appointment", K("opd", "book", "create")),
    { path: "/appointment/[id]", method: "GET", permission: K("opd", "list", "view") },
    { path: "/appointment/[id]", method: "PUT", permission: K("opd", "list", "update") },
    { path: "/appointment/[id]", method: "DELETE", permission: K("opd", "list", "delete") },
    { path: "/appointments", method: "GET", permission: K("opd", "list", "view") },
    post("/appointments", K("opd", "book", "create")),
    { path: "/appointments/[id]", method: "GET", permission: K("opd", "list", "view") },
    { path: "/appointments/[id]", method: "PUT", permission: K("opd", "list", "update") },
    { path: "/appointments/[id]", method: "DELETE", permission: K("opd", "list", "delete") },
    get("/appointments/cancel", K("opd", "list", "view")),
    post("/appointments/cancel", K("opd", "list", "update")),
    get("/appointments/no-show", K("opd", "list", "view")),
    post("/appointments/no-show", K("opd", "list", "update")),
    get("/appointments/queue", K("opd", "queue", "view")),
    post("/appointments/queue", K("opd", "queue", "update")),
    get("/appointments/reschedule", K("opd", "list", "view")),
    post("/appointments/reschedule", K("opd", "list", "update")),

    // Consultation
    get("/clinical/records", K("clinical", "consultations", "view")),
    post("/clinical/records", K("clinical", "consultations", "create")),
    { path: "/clinical/records/[id]", method: "PUT", permission: K("clinical", "consultations", "update") },
    { path: "/clinical/records/[id]", method: "DELETE", permission: K("clinical", "consultations", "delete") },
    get("/clinical/diagnoses", K("clinical", "consultations", "view")),
    post("/clinical/diagnoses", K("clinical", "consultations", "create")),
    del("/clinical/diagnoses/[id]", K("clinical", "consultations", "delete")),
    get("/clinical/vitals", K("clinical", "vitals", "view")),
    post("/clinical/vitals", K("clinical", "vitals", "create")),
    del("/clinical/vitals/[id]", K("clinical", "vitals", "delete")),
    get("/clinical/stats", K("clinical", "consultations", "view")),
    { path: "/prescription", method: "GET", permission: K("clinical", "prescriptions", "view") },
    post("/prescription", K("clinical", "prescriptions", "prescribe")),
    { path: "/prescription/[id]", method: "GET", permission: K("clinical", "prescriptions", "view") },
    { path: "/prescription/[id]", method: "PUT", permission: K("clinical", "prescriptions", "update") },
    { path: "/prescription/[id]", method: "DELETE", permission: K("clinical", "prescriptions", "delete") },

    // Admissions
    get("/admission", K("admissions", "current", "view")),
    post("/admission", K("admissions", "new", "create")),
    { path: "/admission/[id]", method: "GET", permission: K("admissions", "current", "view") },
    { path: "/admission/[id]", method: "PUT", permission: K("admissions", "current", "update") },
    { path: "/admission/[id]", method: "DELETE", permission: K("admissions", "current", "delete") },
    post("/admission/discharge", K("admissions", "discharge", "discharge")),
    post("/admission/transfer", K("admissions", "transfer", "create")),
    get("/admission/stats", K("admissions", "current", "view")),

    // Wards
    get("/ward", K("wards", "list", "view")),
    post("/ward", K("wards", "list", "create")),
    { path: "/ward/[id]", method: "GET", permission: K("wards", "list", "view") },
    { path: "/ward/[id]", method: "PUT", permission: K("wards", "list", "update") },
    { path: "/ward/[id]", method: "DELETE", permission: K("wards", "list", "delete") },
    get("/ward/stats", K("wards", "availability", "view")),
    get("/room", K("wards", "rooms", "view")),
    post("/room", K("wards", "rooms", "create")),
    { path: "/room/[id]", method: "GET", permission: K("wards", "rooms", "view") },
    { path: "/room/[id]", method: "PUT", permission: K("wards", "rooms", "update") },
    { path: "/room/[id]", method: "DELETE", permission: K("wards", "rooms", "delete") },
    lookupGet("/bed"),
    post("/bed", K("wards", "beds", "create")),
    { path: "/bed/[id]", method: "GET", permission: K("wards", "beds", "view") },
    { path: "/bed/[id]", method: "PUT", permission: K("wards", "beds", "update") },
    { path: "/bed/[id]", method: "DELETE", permission: K("wards", "beds", "delete") },

    // Nursing
    get("/nursing/stats", K("nursing", "patients", "view")),
    get("/nursing/my-patients", K("nursing", "patients", "view")),
    get("/nursing/medications", K("nursing", "medications", "view")),
    post("/nursing/medications", K("nursing", "medications", "create")),
    { path: "/nursing/medications/[id]", method: "PUT", permission: K("nursing", "medications", "update") },
    { path: "/nursing/medications/[id]", method: "DELETE", permission: K("nursing", "medications", "delete") },

    // Pharmacy
    get("/pharmacy/stats", K("pharmacy", "medicines", "view")),
    get("/pharmacy/prescriptions", K("pharmacy", "prescriptions", "view")),
    post("/pharmacy/prescriptions", K("pharmacy", "dispensing", "dispense")),
    { path: "/pharmacy/prescriptions/[id]", method: "GET", permission: K("pharmacy", "prescriptions", "view") },
    { path: "/pharmacy/prescriptions/[id]", method: "PUT", permission: K("pharmacy", "dispensing", "dispense") },
    { path: "/pharmacy/prescriptions/[id]", method: "DELETE", permission: K("pharmacy", "prescriptions", "delete") },
    get("/pharmacy/dispense", K("pharmacy", "dispensing", "view")),
    post("/pharmacy/dispense", K("pharmacy", "dispensing", "dispense")),
    { path: "/pharmacy/dispense/[id]", method: "GET", permission: K("pharmacy", "dispensing", "view") },
    get("/pharmacy/medicines", K("pharmacy", "medicines", "view")),
    post("/pharmacy/medicines", K("pharmacy", "medicines", "create")),
    { path: "/pharmacy/medicines/[id]", method: "GET", permission: K("pharmacy", "medicines", "view") },
    { path: "/pharmacy/medicines/[id]", method: "PUT", permission: K("pharmacy", "medicines", "update") },
    { path: "/pharmacy/medicines/[id]", method: "DELETE", permission: K("pharmacy", "medicines", "delete") },
    get("/pharmacy/categories", K("pharmacy", "categories", "view")),
    post("/pharmacy/categories", K("pharmacy", "categories", "create")),
    { path: "/pharmacy/categories/[id]", method: "PUT", permission: K("pharmacy", "categories", "update") },
    { path: "/pharmacy/categories/[id]", method: "DELETE", permission: K("pharmacy", "categories", "delete") },
    get("/pharmacy/stock", K("pharmacy", "stock", "view")),
    post("/pharmacy/stock", K("pharmacy", "stock", "update")),

    // Billing
    get("/invoice", K("billing", "invoices", "view")),
    post("/invoice", K("billing", "create", "create")),
    { path: "/invoice/[id]", method: "GET", permission: K("billing", "invoices", "view") },
    { path: "/invoice/[id]", method: "PUT", permission: K("billing", "invoices", "update") },
    { path: "/invoice/[id]", method: "DELETE", permission: K("billing", "invoices", "delete") },
    get("/payment", K("billing", "payments", "view")),
    post("/payment", K("billing", "payments", "create")),
    { path: "/payment/[id]", method: "GET", permission: K("billing", "payments", "view") },
    { path: "/payment/[id]", method: "PUT", permission: K("billing", "payments", "update") },
    get("/finance/stats", K("billing", "invoices", "view")),
    get("/finance/outstanding", K("billing", "outstanding", "view")),

    // Reports
    get("/reports/summary", K("reports", "summary", "view")),
    get("/reports/patients", K("reports", "patients", "view")),
    get("/reports/appointments", K("reports", "appointments", "view")),
    get("/reports/doctors", K("reports", "doctors", "view")),
    get("/reports/admissions", K("reports", "admissions", "view")),
    get("/reports/pharmacy", K("reports", "pharmacy", "view")),
    get("/reports/billing", K("reports", "billing", "view")),

    // Administration
    get("/admin/stats", K("admin", "users", "view")),
    get("/user", K("admin", "users", "view")),
    post("/user", K("admin", "users", "create")),
    { path: "/user/[id]", method: "GET", permission: K("admin", "users", "view") },
    { path: "/user/[id]", method: "PUT", permission: K("admin", "users", "update") },
    { path: "/user/[id]", method: "DELETE", permission: K("admin", "users", "delete") },
    lookupGet("/user/directory"),
    { path: "/role", method: "GET", permission: null }, // authenticated: the user and role pickers need it
    post("/role", K("admin", "roles", "update")),
    { path: "/role/[id]", method: "GET", permission: K("admin", "roles", "view") },
    { path: "/role/[id]", method: "PUT", permission: K("admin", "roles", "update") },
    { path: "/role/[id]", method: "DELETE", permission: K("admin", "roles", "update") },
    // The roles table with permission summaries and user counts.
    get("/role/admin", K("admin", "roles", "view")),
    get("/permissions", K("admin", "roles", "view")),
    // The signed-in user's own snapshot. Must answer for every session, or the
    // sidebar would have nothing to filter with.
    openGet("/me/permissions"),
    openGet("/menu"), // the sidebar itself
    post("/menu", K("admin", "roles", "update")),
    post("/organization", K("admin", "hospital", "create")),
    lookupGet("/organization"),
    get("/organization/settings", K("admin", "hospital", "view")),
    put("/organization/settings", K("admin", "hospital", "update")),
    { path: "/organization/[id]", method: "PUT", permission: K("admin", "hospital", "update") },
    { path: "/organization/[id]", method: "DELETE", permission: K("admin", "hospital", "delete") },
    post("/org", K("admin", "hospital", "create")),
    lookupGet("/org"),
    { path: "/org/[id]", method: "PUT", permission: K("admin", "hospital", "update") },
    { path: "/org/[id]", method: "DELETE", permission: K("admin", "hospital", "delete") },
    lookupGet("/staff/directory"),
    get("/staff", K("admin", "staff", "view")),
    post("/staff", K("admin", "staff", "create")),
    { path: "/staff/[id]", method: "GET", permission: K("admin", "staff", "view") },
    { path: "/staff/[id]", method: "PUT", permission: K("admin", "staff", "update") },
    { path: "/staff/[id]", method: "DELETE", permission: K("admin", "staff", "delete") },
    get("/staff/schedule", K("admin", "schedule", "view")),
    post("/staff/schedule", K("admin", "schedule", "create")),
    { path: "/staff/schedule/[id]", method: "GET", permission: K("admin", "schedule", "view") },
    { path: "/staff/schedule/[id]", method: "PUT", permission: K("admin", "schedule", "update") },
    { path: "/staff/schedule/[id]", method: "DELETE", permission: K("admin", "schedule", "delete") },
    get("/staff/designations", K("admin", "staff", "view")),
    post("/staff/designations", K("admin", "departments", "update")),
{ path: "/staff/designations/[id]", method: "GET", permission: K("admin", "staff", "view") },
    { path: "/staff/designations/[id]", method: "PUT", permission: K("admin", "departments", "update") },
    { path: "/staff/designations/[id]", method: "DELETE", permission: K("admin", "departments", "delete") },
    get("/staff/specializations", K("admin", "staff", "view")),
    post("/staff/specializations", K("admin", "departments", "update")),
    { path: "/staff/specializations/[id]", method: "GET", permission: K("admin", "staff", "view") },
    { path: "/staff/specializations/[id]", method: "PUT", permission: K("admin", "departments", "update") },
    { path: "/staff/specializations/[id]", method: "DELETE", permission: K("admin", "departments", "delete") },
    post("/department", K("admin", "departments", "create")),
    lookupGet("/department"),
    { path: "/department/[id]", method: "GET", permission: K("admin", "departments", "view") },
    { path: "/department/[id]", method: "PUT", permission: K("admin", "departments", "update") },
    { path: "/department/[id]", method: "DELETE", permission: K("admin", "departments", "delete") },
    post("/doctor", K("admin", "doctors", "create")),
    lookupGet("/doctor"),
    { path: "/doctor/[id]", method: "GET", permission: K("admin", "doctors", "view") },
    { path: "/doctor/[id]", method: "PUT", permission: K("admin", "doctors", "update") },
    { path: "/doctor/[id]", method: "DELETE", permission: K("admin", "doctors", "delete") },
];

/** Normalises `/api/admission/65f...` to `/admission/[id]`. */
const OBJECT_ID_LIKE = /^[a-f\d]{24}$/i;

export function resolveRoutePath(pathname: string): string {
    // Drop the query string and any hash first: `/api/patient?full=1` has to
    // resolve to the same rule as `/api/patient`, or a lookup built from a real
    // request URL silently misses.
    const withoutQuery = (pathname || "").split(/[?#]/)[0];
    const withoutPrefix = withoutQuery.replace(/^\/api/, "");
    const segments = withoutPrefix.split("/").filter(Boolean);
    if (!segments.length) return "";
    return `/${segments
        .map((segment) => (/^\[.+\]$/.test(segment) ? segment : OBJECT_ID_LIKE.test(segment) ? "[id]" : segment))
        .join("/")}`;
}
