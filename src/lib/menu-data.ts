/**
 * Sidebar navigation for the simplified hospital system.
 * Seeded into the Menu collection; each role only sees the menus whose
 * module appears in its access list (see src/lib/rbac/roles.ts).
 */
export interface MenuSeed {
    name: string;
    path: string;
    icon?: string;
    children?: { name: string; path: string }[];
}

export const MENUS: MenuSeed[] = [
    {
        name: "Dashboard",
        path: "/dashboard",
        icon: "LayoutDashboard",
        children: [{ name: "Dashboard", path: "/dashboard/main" }]
    },
    {
        name: "Patients",
        path: "/patients",
        icon: "Users",
        children: [
            { name: "Register Patient", path: "/patients/register" },
            { name: "All Patients", path: "/patients/list" },
            { name: "Patient Profile", path: "/patients/profile" },
            { name: "Documents", path: "/patients/documents" }
        ]
    },
    {
        name: "OPD",
        path: "/appointments",
        icon: "Calendar",
        children: [
            { name: "Book Appointment", path: "/appointments/book" },
            { name: "Today's Queue", path: "/appointments/queue" },
            { name: "All Appointments", path: "/appointments/list" }
        ]
    },
    {
        name: "Consultation",
        path: "/clinical",
        icon: "Stethoscope",
        children: [
            { name: "Consultations", path: "/clinical/consultations" },
            { name: "Prescriptions", path: "/clinical/prescriptions" },
            { name: "Vital Signs", path: "/clinical/vitals" },
            { name: "Medical History", path: "/clinical/history" }
        ]
    },
    {
        name: "IPD / Admissions",
        path: "/admissions",
        icon: "Bed",
        children: [
            { name: "New Admission", path: "/admissions/new" },
            { name: "Admitted Patients", path: "/admissions/current" },
            { name: "Transfer Bed", path: "/admissions/transfer" },
            { name: "Discharge", path: "/admissions/discharge" },
            { name: "Discharge Summary", path: "/admissions/summary" },
            { name: "Admission History", path: "/admissions/history" }
        ]
    },
    {
        name: "Wards & Beds",
        path: "/wards",
        icon: "Building",
        children: [
            { name: "Bed Availability", path: "/wards/availability" },
            { name: "Wards", path: "/wards/list" },
            { name: "Rooms", path: "/wards/rooms" },
            { name: "Beds", path: "/wards/beds" }
        ]
    },
    {
        name: "Nursing",
        path: "/nursing",
        icon: "HeartPulse",
        children: [
            { name: "Admitted Patients", path: "/nursing/patients" },
            { name: "Vital Signs", path: "/nursing/vitals" },
            { name: "Nursing Notes", path: "/nursing/notes" },
            { name: "Medication Rounds", path: "/nursing/medications" }
        ]
    },
    {
        name: "Pharmacy",
        path: "/pharmacy",
        icon: "Pill",
        children: [
            { name: "Prescriptions", path: "/pharmacy/prescriptions" },
            { name: "Dispense Medicines", path: "/pharmacy/dispensing" },
            { name: "Medicines", path: "/pharmacy/medicines" },
            { name: "Categories", path: "/pharmacy/categories" },
            { name: "Stock", path: "/pharmacy/stock" },
            { name: "Expiry", path: "/pharmacy/expiry" }
        ]
    },
    {
        name: "Billing",
        path: "/finance",
        icon: "Banknote",
        children: [
            { name: "Create Bill", path: "/finance/invoice/create" },
            { name: "Bills", path: "/finance/invoices" },
            { name: "Payments", path: "/finance/payments" },
            { name: "Outstanding Dues", path: "/finance/outstanding" }
        ]
    },
    {
        name: "Reports",
        path: "/reports",
        icon: "BarChart3",
        children: [
            { name: "Summary", path: "/reports" },
            { name: "Patients", path: "/reports/patients" },
            { name: "Appointments", path: "/reports/appointments" },
            { name: "Doctors", path: "/reports/doctors" },
            { name: "Admissions", path: "/reports/admissions" },
            { name: "Pharmacy", path: "/reports/pharmacy" },
            { name: "Billing", path: "/reports/billing" }
        ]
    },
    {
        name: "Settings",
        path: "/admin",
        icon: "Settings",
        children: [
            { name: "Hospital Profile", path: "/organization/details" },
            { name: "Users", path: "/admin/users" },
            { name: "Roles & Permissions", path: "/admin/roles" },
            { name: "Doctors", path: "/staff/doctors" },
            { name: "Staff", path: "/staff/list" },
            { name: "Departments", path: "/staff/departments" },
            { name: "Doctor Schedule", path: "/staff/schedule" }
        ]
    }
];

/** Maps a menu path to the role-access module that unlocks it. */
export function getMenuModuleKey(menu: { moduleKey?: string; path?: string; name?: string }): string {
    if (menu.moduleKey && menu.moduleKey.trim()) {
        return menu.moduleKey.toLowerCase().trim();
    }
    const path = (menu.path || "").toLowerCase().trim();
    const prefixes: [string, string][] = [
        ["/dashboard", "dashboard"],
        ["/patients", "patient"],
        ["/appointments", "appointment"],
        ["/admissions", "admission"],
        ["/wards", "ward"],
        ["/clinical", "clinical"],
        ["/nursing", "nursing"],
        ["/pharmacy", "pharmacy"],
        ["/finance", "billing"],
        ["/reports", "reports"],
        ["/staff", "staff"],
        ["/admin", "admin"],
        ["/organization", "organization"],
    ];
    const match = prefixes.find(([prefix]) => path.startsWith(prefix));
    return match ? match[1] : (menu.name || "").toLowerCase().trim();
}

export interface MenuNode {
    moduleKey?: string;
    path?: string;
    name?: string;
    children?: MenuNode[];
}

/** Every path this build owns, parents and children alike. */
export const CANONICAL_MENU_PATHS: ReadonlySet<string> = new Set(
    MENUS.flatMap(({ children, ...parent }) => [
        parent.path ?? "",
        ...(children ?? []).map((child) => child.path ?? ""),
    ])
);

function isCanonicalMenu(menu: MenuNode): boolean {
    return CANONICAL_MENU_PATHS.has((menu.path ?? "").toLowerCase());
}

/**
 * Drops every stored menu this build does not ship.
 *
 * The sidebar reads `Menu` documents from MongoDB, and that database outlives a
 * code change: it keeps rows for modules that no longer exist, so they would
 * render as links to pages that were deleted. Filtering here means the UI is
 * correct even when the rows have not been cleaned up yet — the reconciler in
 * `rbac/canonical-sync` removes them from the database, this stops them from
 * ever being shown.
 */
export function restrictToCanonicalMenus<T extends MenuNode>(menus: readonly T[]): T[] {
    return menus
        .filter(isCanonicalMenu)
        .map((menu) =>
            Array.isArray(menu.children)
                ? { ...menu, children: menu.children.filter(isCanonicalMenu) }
                : menu
        );
}

/**
 * Keeps only the menus a role may open. Visibility comes exclusively from the
 * role's own module grants; nothing is blanket-granted, otherwise every role
 * would end up with an identical sidebar.
 */
export function filterMenusForAccess<T extends MenuNode>(menus: readonly T[], access: readonly { moduleName?: string }[]): T[] {
    const modules = new Set<string>();
    for (const item of access) {
        const mod = (item.moduleName || "").toLowerCase().trim();
        if (!mod) continue;
        modules.add(mod);
        if (mod === "user" || mod === "role") modules.add("admin");
    }

    return menus
        .map((menu) => ({
            ...menu,
            children: Array.isArray(menu.children)
                ? menu.children.filter((child) => modules.has(getMenuModuleKey(child)))
                : menu.children,
        }))
        .filter((menu) => modules.has(getMenuModuleKey(menu)) || (menu.children?.length ?? 0) > 0);
}
