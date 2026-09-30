import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { listRoleProfileAssignments, resolveDashboardProfile } from "@/lib/rbac/dashboard-profiles";
import { ADMIN_ROLE, ALL_ROLES, buildRoleAccess, withBaselineAccess } from "@/lib/rbac/role-access";
import { MENUS, filterMenusForAccess, getMenuModuleKey } from "@/lib/menu-data";
import { BASELINE_REFERENCE_PERMISSIONS, PERMISSION_KEYS, REFERENCE_DATA_MODULE } from "@/types/rbac";
import { DEMO_USERS, demoEmail } from "@/seed";

const DASHBOARD_ROOT = path.resolve(process.cwd(), "src/app/(dashboard)");

function pageExists(route: string): boolean {
  const clean = route.split("?")[0].replace(/^\//, "");
  return fs.existsSync(path.join(DASHBOARD_ROOT, clean, "page.tsx"));
}

function visibleMenuNames(roleName: string): string[] {
  return filterMenusForAccess(MENUS, buildRoleAccess(roleName)).map((m) => m.name);
}

/** Module keys a role can open, as the sidebar computes them. */
function accessibleModules(roleName: string): Set<string> {
  const modules = new Set(buildRoleAccess(roleName).map((a) => a.moduleName));
  if (modules.has("user") || modules.has("role")) modules.add("admin");
  return modules;
}

/**
 * Menu, sidebar and dashboard test suite for the simplified hospital setup.
 */
async function runMenuTests() {
  console.log("=================================================");
  console.log("  Running Menu & Dashboard Test Suite");
  console.log("=================================================\n");

  let passedTests = 0;
  let totalTests = 0;

  function test(name: string, fn: () => void) {
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

  test("Every menu link points to an existing page", () => {
    const missing = MENUS.flatMap((m) => m.children ?? []).map((c) => c.path).filter((p) => !pageExists(p));
    assert.deepEqual(missing, [], "Menu links without a page");
  });

  test("Every menu link maps to a known module", () => {
    const known = new Set(["dashboard", "patient", "appointment", "admission", "ward", "clinical", "nursing", "pharmacy", "billing", "reports", "staff", "admin", "organization"]);
    for (const menu of MENUS) {
      for (const item of [menu, ...(menu.children ?? [])]) {
        assert.ok(known.has(getMenuModuleKey(item)), `${item.path} maps to unknown module "${getMenuModuleKey(item)}"`);
      }
    }
  });

  test("Admin sees every menu", () => {
    assert.deepEqual(visibleMenuNames(ADMIN_ROLE), MENUS.map((m) => m.name));
  });

  test("Each role sees only its own sections", () => {
    const expected: Record<string, string[]> = {
      DOCTOR: ["Dashboard", "Patients", "OPD", "Consultation", "IPD / Admissions"],
      NURSE: ["Dashboard", "Patients", "IPD / Admissions", "Wards & Beds", "Nursing"],
      RECEPTIONIST: ["Dashboard", "Patients", "OPD", "IPD / Admissions", "Wards & Beds", "Billing"],
      PHARMACIST: ["Dashboard", "Patients", "Pharmacy"],
      ACCOUNTANT: ["Dashboard", "Patients", "Billing", "Reports"],
    };
    for (const [role, menus] of Object.entries(expected)) {
      assert.deepEqual(visibleMenuNames(role), menus, `Unexpected sidebar for ${role}`);
    }
  });

  test("Only the admin sees Settings", () => {
    for (const role of ALL_ROLES.filter((r) => r !== ADMIN_ROLE)) {
      assert.ok(!visibleMenuNames(role).includes("Settings"), `${role} must not see Settings`);
    }
  });

  test("Baseline grants the dashboard and dropdown lookups without widening navigation", () => {
    const granted = withBaselineAccess([]).flatMap((item) => item.permissions);
    for (const perm of [PERMISSION_KEYS.DASHBOARD_VIEW, ...BASELINE_REFERENCE_PERMISSIONS]) {
      assert.ok(granted.includes(perm), `withBaselineAccess() must grant ${perm}`);
    }
    const lookupMenus = filterMenusForAccess(MENUS, [{ moduleName: REFERENCE_DATA_MODULE }]);
    assert.deepEqual(lookupMenus, [], "Reference lookups must not unlock any menu");
  });

  test("Every stored grant carries a scope", () => {
    for (const role of ALL_ROLES) {
      for (const item of buildRoleAccess(role)) {
        assert.equal(item.grants?.length, item.permissions.length, `${role}/${item.moduleName} grants out of sync`);
      }
    }
  });

  test("Every role resolves to its own dashboard profile", () => {
    const mapped = listRoleProfileAssignments().map((a) => a.role);
    assert.deepEqual([...mapped].sort(), [...ALL_ROLES].sort(), "Roles and dashboard profiles out of sync");
    const keys = ALL_ROLES.map((r) => resolveDashboardProfile(r).key);
    assert.equal(new Set(keys).size, keys.length, "Two roles share a dashboard profile");
  });

  test("Dashboard quick actions open pages the role is allowed to see", () => {
    for (const role of ALL_ROLES) {
      const modules = accessibleModules(role);
      const profile = resolveDashboardProfile(role);
      const links = [...profile.quickActions.map((a) => a.href), ...(profile.moduleDashboard ? [profile.moduleDashboard] : [])];
      for (const href of links) {
        assert.ok(pageExists(href), `${role} dashboard links to missing page ${href}`);
        assert.ok(modules.has(getMenuModuleKey({ path: href })), `${role} dashboard links to ${href} outside its access`);
      }
    }
  });

  test("Unknown or missing role names fall back to the generic staff profile", () => {
    assert.equal(resolveDashboardProfile("SOME_ROLE_THAT_DOES_NOT_EXIST").key, "default");
    assert.equal(resolveDashboardProfile(null).key, "default");
    assert.equal(resolveDashboardProfile(undefined).key, "default");
  });

  test("There is exactly one demo login per role", () => {
    assert.deepEqual(DEMO_USERS.map(([role]) => role).sort(), [...ALL_ROLES].sort());
    const emails = DEMO_USERS.map(([role]) => demoEmail(role));
    assert.equal(new Set(emails).size, emails.length, "Duplicate demo login email");
  });

  console.log(`\n=================================================`);
  console.log(`  Menu Test Results: ${passedTests}/${totalTests} Passed (100%)`);
  console.log(`=================================================\n`);
}

runMenuTests().catch((err: unknown) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
