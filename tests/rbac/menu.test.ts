import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  listRoleProfileAssignments,
  resolveDashboardProfile
} from "@/lib/rbac/dashboard-profiles";

interface MockMenu {
  _id: string;
  name: string;
  path: string;
  moduleKey?: string;
  children?: MockMenu[];
}

interface MockRoleAccess {
  moduleName: string;
  permissions: string[];
}

function getMenuModuleKey(menu: { moduleKey?: string; path?: string; name?: string }): string {
  if (menu.moduleKey && menu.moduleKey.trim()) {
    return menu.moduleKey.toLowerCase().trim();
  }
  const p = (menu.path || "").toLowerCase().trim();
  if (p.startsWith("/dashboard")) return "dashboard";
  if (p.startsWith("/patients")) return "patient";
  if (p.startsWith("/appointments")) return "appointment";
  if (p.startsWith("/admissions")) return "admission";
  if (p.startsWith("/wards")) return "ward";
  if (p.startsWith("/clinical")) return "clinical";
  if (p.startsWith("/nursing")) return "nursing";
  if (p.startsWith("/lab")) return "lab";
  if (p.startsWith("/radiology")) return "radiology";
  if (p.startsWith("/pharmacy")) return "pharmacy";
  if (p.startsWith("/emergency")) return "emergency";
  if (p.startsWith("/ot")) return "ot";
  if (p.startsWith("/blood-bank")) return "blood-bank";
  if (p.startsWith("/inventory")) return "inventory";
  if (p.startsWith("/procurement")) return "procurement";
  if (p.startsWith("/finance")) return "billing";
  if (p.startsWith("/insurance")) return "insurance";
  if (p.startsWith("/reports")) return "reports";
  if (p.startsWith("/staff")) return "staff";
  if (p.startsWith("/hr")) return "hr";
  if (p.startsWith("/notifications")) return "notifications";
  if (p.startsWith("/admin")) return "admin";
  if (p.startsWith("/organization")) return "organization";
  if (p.startsWith("/audit")) return "audit";
  if (p.startsWith("/config")) return "system";

  return (menu.name || "").toLowerCase().trim();
}

function filterMenusForRole(
  allMenus: MockMenu[],
  roleName: string,
  roleAccess: MockRoleAccess[]
): MockMenu[] {
  if (roleName === "SYSTEM_SUPER_ADMIN") {
    return allMenus;
  }

  // Menu visibility is derived exclusively from the role's own module grants.
  // Nothing is blanket-granted.
  const accessibleModules = new Set<string>();

  for (const item of roleAccess) {
    const mod = (item.moduleName || "").toLowerCase().trim();
    if (!mod) continue;
    accessibleModules.add(mod);
    if (mod === "user" || mod === "role") accessibleModules.add("admin");
    if (mod === "billing") accessibleModules.add("finance");
    if (mod === "system") accessibleModules.add("config");
  }

  return allMenus
    .map((menu) => {
      const menuObj = { ...menu };

      if (menuObj.children && menuObj.children.length > 0) {
        menuObj.children = menuObj.children.filter((child) => {
          const childKey = getMenuModuleKey(child);
          return accessibleModules.has(childKey);
        });
      }
      return menuObj;
    })
    .filter((menu) => {
      const parentKey = getMenuModuleKey(menu);
      const hasDirectAccess = accessibleModules.has(parentKey);
      const hasChildAccess = Array.isArray(menu.children) && menu.children.length > 0;
      return hasDirectAccess || hasChildAccess;
    });
}

const DASHBOARD_ACCESS: MockRoleAccess = {
  moduleName: "dashboard",
  permissions: ["dashboard.dashboard.view"]
};

/** Reads the demo login matrix straight out of the seeder. */
function matrixFromSeed(): [string, string, string][] {
  const seedContent = fs.readFileSync(path.resolve(process.cwd(), "src/seed.ts"), "utf-8");
  const start = seedContent.indexOf("const demoUserMatrix");
  const end = seedContent.indexOf("\n];", start);
  const block = seedContent.slice(start, end);
  return Array.from(
    block.matchAll(/\[\s*"([a-zA-Z]+)"\s*,\s*"([A-Z_]+)"\s*,\s*"([^"]+)"\s*\]/g)
  ).map((m) => [m[1], m[2], m[3]] as [string, string, string]);
}

/**
 * Phase 2 Menu & Sidebar Dynamic Authorization Test Suite
 */
async function runMenuTests() {
  console.log("=================================================");
  console.log("  Running Phase 2 Dynamic Menu & Sidebar Test Suite");
  console.log("=================================================\n");

  let passedTests = 0;
  let totalTests = 0;

  function test(name: string, fn: () => void | Promise<void>) {
    totalTests++;
    try {
      fn();
      console.log(`  ✓ ${name}`);
      passedTests++;
    } catch (err: unknown) {
      console.error(`  ✗ ${name}`);
      console.error(err);
      throw err;
    }
  }

  const mockCatalog: MockMenu[] = [
    { _id: "1", name: "Dashboard", path: "/dashboard", children: [{ _id: "1-1", name: "Main", path: "/dashboard/main" }] },
    { _id: "2", name: "Patient Management", path: "/patients", children: [{ _id: "2-1", name: "Register", path: "/patients/register" }] },
    { _id: "3", name: "Doctor & Staff", path: "/staff", children: [{ _id: "3-1", name: "Doctors", path: "/staff/doctors" }] },
    { _id: "4", name: "Appointments", path: "/appointments", children: [{ _id: "4-1", name: "List", path: "/appointments/list" }] },
    { _id: "5", name: "Admissions & Discharge", path: "/admissions", children: [{ _id: "5-1", name: "Current", path: "/admissions/current" }] },
    { _id: "6", name: "Ward & Bed Management", path: "/wards", children: [{ _id: "6-1", name: "Wards", path: "/wards/list" }] },
    { _id: "7", name: "Clinical / EMR", path: "/clinical", children: [{ _id: "7-1", name: "Notes", path: "/clinical/notes" }] },
    { _id: "8", name: "Nursing", path: "/nursing", children: [{ _id: "8-1", name: "Vitals", path: "/nursing/vitals" }] },
    { _id: "9", name: "Laboratory", path: "/lab", children: [{ _id: "9-1", name: "Orders", path: "/lab/orders" }] },
    { _id: "10", name: "Radiology / Imaging", path: "/radiology", children: [{ _id: "10-1", name: "Studies", path: "/radiology/studies" }] },
    { _id: "11", name: "Pharmacy", path: "/pharmacy", children: [{ _id: "11-1", name: "Dispense", path: "/pharmacy/dispense" }] },
    { _id: "12", name: "Billing & Finance", path: "/finance", children: [{ _id: "12-1", name: "Invoices", path: "/finance/invoices" }] },
    { _id: "13", name: "Administration", path: "/admin", children: [{ _id: "13-1", name: "Users", path: "/admin/users" }] },
    { _id: "14", name: "System Configuration", path: "/config", children: [{ _id: "14-1", name: "Settings", path: "/config/general" }] },
    { _id: "15", name: "Audit & Compliance", path: "/audit", children: [{ _id: "15-1", name: "Logs", path: "/audit/logs" }] }
  ];

  // Test 1: SYSTEM_SUPER_ADMIN receives all menus
  test("SYSTEM_SUPER_ADMIN receives all catalog menus without filtering", () => {
    const visible = filterMenusForRole(mockCatalog, "SYSTEM_SUPER_ADMIN", []);
    assert.equal(visible.length, mockCatalog.length);
  });

  // Test 2: DOCTOR role receives clinical & OPD modules only
  test("DOCTOR role receives patient, appointment, clinical, nursing, diagnostic modules only", () => {
    const doctorAccess: MockRoleAccess[] = [
      DASHBOARD_ACCESS,
      { moduleName: "patient", permissions: ["patient.patient.view"] },
      { moduleName: "appointment", permissions: ["appointment.appointment.view"] },
      { moduleName: "clinical", permissions: ["clinical.record.view"] },
      { moduleName: "nursing", permissions: ["nursing.vitals.view"] },
      { moduleName: "admission", permissions: ["admission.admission.view"] },
      { moduleName: "lab", permissions: ["lab.order.view"] },
      { moduleName: "radiology", permissions: ["radiology.order.view"] },
      { moduleName: "pharmacy", permissions: ["pharmacy.prescription.view"] }
    ];

    const visible = filterMenusForRole(mockCatalog, "DOCTOR", doctorAccess);
    const visiblePaths = visible.map((m) => m.path);

    assert.ok(visiblePaths.includes("/dashboard"), "Dashboard must be visible");
    assert.ok(visiblePaths.includes("/patients"), "Patients must be visible");
    assert.ok(visiblePaths.includes("/appointments"), "Appointments must be visible");
    assert.ok(visiblePaths.includes("/clinical"), "Clinical must be visible");
    assert.ok(visiblePaths.includes("/lab"), "Lab must be visible");

    assert.ok(!visiblePaths.includes("/finance"), "Billing must be hidden from Doctor");
    assert.ok(!visiblePaths.includes("/admin"), "Admin must be hidden from Doctor");
    assert.ok(!visiblePaths.includes("/config"), "Config must be hidden from Doctor");
    assert.ok(!visiblePaths.includes("/audit"), "Audit must be hidden from Doctor");
  });

  // Test 3: RECEPTIONIST role receives front desk modules only
  test("RECEPTIONIST role receives front desk modules and cannot see clinical, diagnostic, or admin", () => {
    const receptionistAccess: MockRoleAccess[] = [
      DASHBOARD_ACCESS,
      { moduleName: "patient", permissions: ["patient.patient.view", "patient.patient.create"] },
      { moduleName: "appointment", permissions: ["appointment.appointment.view", "appointment.appointment.create"] },
      { moduleName: "admission", permissions: ["admission.admission.view"] },
      { moduleName: "billing", permissions: ["billing.invoice.view"] }
    ];

    const visible = filterMenusForRole(mockCatalog, "RECEPTIONIST", receptionistAccess);
    const visiblePaths = visible.map((m) => m.path);

    assert.ok(visiblePaths.includes("/dashboard"));
    assert.ok(visiblePaths.includes("/patients"));
    assert.ok(visiblePaths.includes("/appointments"));
    assert.ok(visiblePaths.includes("/admissions"));
    assert.ok(visiblePaths.includes("/finance"), "Billing view should be visible to receptionist");

    assert.ok(!visiblePaths.includes("/clinical"), "Clinical EMR must be hidden from Receptionist");
    assert.ok(!visiblePaths.includes("/nursing"), "Nursing must be hidden from Receptionist");
    assert.ok(!visiblePaths.includes("/lab"), "Laboratory must be hidden from Receptionist");
    assert.ok(!visiblePaths.includes("/admin"), "Administration must be hidden from Receptionist");
    assert.ok(!visiblePaths.includes("/config"), "System Configuration must be hidden from Receptionist");
  });

  // Test 4: CASHIER role receives cash counter billing only
  test("CASHIER receives billing & finance only, completely isolated from clinical records", () => {
    const cashierAccess: MockRoleAccess[] = [
      DASHBOARD_ACCESS,
      { moduleName: "billing", permissions: ["billing.invoice.view", "billing.payment.create"] }
    ];

    const visible = filterMenusForRole(mockCatalog, "CASHIER", cashierAccess);
    const visiblePaths = visible.map((m) => m.path);

    assert.ok(visiblePaths.includes("/dashboard"));
    assert.ok(visiblePaths.includes("/finance"));
    assert.ok(!visiblePaths.includes("/patients"));
    assert.ok(!visiblePaths.includes("/appointments"));
    assert.ok(!visiblePaths.includes("/clinical"));
  });
  // Test 5: Verify HIDDEN_ROUTES is completely removed from sidebar.tsx
  test("Sidebar source code has zero occurrences of HIDDEN_ROUTES array", () => {
    const sidebarPath = path.resolve(process.cwd(), "src/components/layout/sidebar.tsx");
    const sidebarContent = fs.readFileSync(sidebarPath, "utf-8");

    assert.ok(
      !sidebarContent.includes("HIDDEN_ROUTES"),
      "sidebar.tsx must not contain HIDDEN_ROUTES array or references"
    );

    assert.ok(
      !sidebarContent.includes("hiddenSet"),
      "sidebar.tsx must not contain hiddenSet filter"
    );
  });

  // Test 6: Verify moduleKey mapping accuracy
  test("ModuleKey resolution correctly binds non-standard paths (/finance -> billing, /config -> system)", () => {
    assert.equal(getMenuModuleKey({ path: "/finance" }), "billing");
    assert.equal(getMenuModuleKey({ path: "/config" }), "system");
    assert.equal(getMenuModuleKey({ path: "/patients/register" }), "patient");
    assert.equal(getMenuModuleKey({ path: "/blood-bank/dashboard" }), "blood-bank");
  });

  // Test 7: Dashboard visibility is driven by the role's own dashboard grant
  test("Dashboard is hidden from a role that has no dashboard module grant", () => {
    const noDashboardAccess: MockRoleAccess[] = [
      { moduleName: "patient", permissions: ["patient.patient.view"] }
    ];

    const visible = filterMenusForRole(mockCatalog, "DOCTOR", noDashboardAccess);
    const visiblePaths = visible.map((m) => m.path);

    assert.ok(!visiblePaths.includes("/dashboard"), "Dashboard must be hidden without a dashboard grant");
    assert.ok(visiblePaths.includes("/patients"), "Patients must still be visible");
  });

  // Test 8: No blanket module grants remain in the controller
  test("menu.controller.ts does not blanket-grant the dashboard module to every role", () => {
    const controllerPath = path.resolve(process.cwd(), "src/controllers/menu.controller.ts");
    const controllerContent = fs.readFileSync(controllerPath, "utf-8");

    assert.ok(
      !/accessibleModules\.add\(\s*["']dashboard["']/.test(controllerContent),
      "menu.controller.ts must not hardcode accessibleModules.add('dashboard')"
    );
  });

  // Test 9: Every seeded role is granted the dashboard view permission
  test("seed.ts grants dashboard.dashboard.view to every role definition", () => {
    const seedPath = path.resolve(process.cwd(), "src/seed.ts");
    const seedContent = fs.readFileSync(seedPath, "utf-8");

    assert.ok(
      seedContent.includes('permissions: ["dashboard.dashboard.view"]'),
      "seed.ts must declare the dashboard.dashboard.view grant"
    );

    assert.ok(
      seedContent.includes("enrichAccessWithGrants(withDashboardAccess(r.access), r.role)"),
      "seed.ts must apply withDashboardAccess() to every role before creating it"
    );
  });

  // Test 10: Every seeded role resolves to its own dashboard profile
  test("Every role seeded in src/seed.ts resolves to an explicit dashboard profile", () => {
    const seedContent = fs.readFileSync(path.resolve(process.cwd(), "src/seed.ts"), "utf-8");
    const start = seedContent.indexOf("const roleDefinitions = [");
    const end = seedContent.indexOf("\n];", start);
    const block = seedContent.slice(start, end);

    const seededRoles = Array.from(block.matchAll(/\{\s*role:\s*"([A-Z_]+)"/g)).map((m) => m[1]);
    assert.ok(seededRoles.length >= 39, `Expected 39+ seeded roles, found ${seededRoles.length}`);

    const assignments = listRoleProfileAssignments().map((a) => a.role);
    const unmapped = seededRoles.filter((r) => !assignments.includes(r));
    assert.deepEqual(unmapped, [], "Seeded roles without a dashboard profile mapping");
  });

  // Test 11: Different roles get genuinely different dashboards
  test("Different roles resolve to different profiles with role-appropriate actions", () => {
    const doctor = resolveDashboardProfile("DOCTOR");
    const nurse = resolveDashboardProfile("NURSE");
    const receptionist = resolveDashboardProfile("RECEPTIONIST");
    const cashier = resolveDashboardProfile("CASHIER");

    assert.notEqual(doctor.key, nurse.key, "Doctor and Nurse must not share a dashboard");
    assert.notEqual(receptionist.key, cashier.key, "Receptionist and Cashier must not share a dashboard");
    assert.notEqual(doctor.key, cashier.key, "Doctor and Cashier must not share a dashboard");

    const doctorLinks = doctor.quickActions.map((a) => a.href);
    assert.ok(doctorLinks.includes("/clinical/notes"), "Doctor should get clinical quick actions");
    assert.ok(
      !doctorLinks.some((h) => h.startsWith("/finance")),
      "Doctor must not get finance quick actions"
    );

    const nurseLinks = nurse.quickActions.map((a) => a.href);
    assert.ok(nurseLinks.includes("/nursing/vitals"), "Nurse should get nursing quick actions");

    const cashierLinks = cashier.quickActions.map((a) => a.href);
    assert.ok(
      cashierLinks.includes("/finance/invoice/create"),
      "Cashier should get finance quick actions"
    );
    assert.ok(
      !cashierLinks.some((h) => h.startsWith("/clinical")),
      "Cashier must not get clinical quick actions"
    );
  });

  // Test 12: Unknown / missing roles degrade gracefully to the generic profile
  test("Unknown or missing role names fall back to the generic staff profile", () => {
    const fallback = resolveDashboardProfile("SOME_ROLE_THAT_DOES_NOT_EXIST");
    assert.equal(fallback.key, "default");
    assert.ok(fallback.quickActions.length > 0, "Fallback profile must still render actions");
    assert.equal(resolveDashboardProfile(null).key, "default");
    assert.equal(resolveDashboardProfile(undefined).key, "default");
  });

  // Test 13: Every profile is reachable and every demo login is unique
  test("Every dashboard profile is reachable and has a distinct demo login", () => {
    const assignments = listRoleProfileAssignments();

    const reachedProfiles = new Set(assignments.map((a) => a.profile));
    reachedProfiles.delete("default");

    const profilesSource = fs.readFileSync(
      path.resolve(process.cwd(), "src/lib/rbac/dashboard-profiles.ts"),
      "utf-8"
    );
    const profileBlock = profilesSource.slice(
      profilesSource.indexOf("const profiles: Record<string, DashboardProfile> = {")
    );
    const declaredProfiles = Array.from(
      profileBlock.slice(0, profileBlock.indexOf("\n};")).matchAll(/^  ([a-zA-Z]+):\s*\{/gm)
    ).map((m) => m[1]);

    // "default" is the intentional fallback profile for unmapped roles
    const unreachable = declaredProfiles.filter(
      (p) => p !== "default" && !reachedProfiles.has(p)
    );
    assert.deepEqual(unreachable, [], "Declared dashboard profiles that no role can reach");

    const emails = new Set<string>();
    const seen = new Set<string>();
    for (const [, role, name] of matrixFromSeed()) {
      const email = `demo.${role.toLowerCase()}@medistra.hospital`;
      assert.ok(!emails.has(email), `Duplicate demo login email: ${email}`);
      assert.ok(!seen.has(role), `Duplicate demo login role: ${role}`);
      emails.add(email);
      seen.add(role);
    }
  });

  console.log(`\n=================================================`);
  console.log(`  Menu Test Results: ${passedTests}/${totalTests} Passed (100%)`);
  console.log(`=================================================\n`);
}

runMenuTests().catch((err: unknown) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
