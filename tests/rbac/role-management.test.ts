import assert from "node:assert/strict";
import { MENUS, filterMenusByPermissions } from "@/lib/menu-data";
import {
  ACCESS_LEVELS,
  ACCESS_LEVEL_HELP,
  PRESET_IDS,
  allKeysForCatalogue,
  allKeysForSubItem,
  applyLevel,
  applyLevelEverywhere,
  applyPreset,
  catalogueProgress,
  countChangedSections,
  keysForLevel,
  levelOf,
  moduleHelp,
  moduleIsFullyOn,
  moduleIsPartlyOn,
  moduleProgress,
  resetToRoleDefault,
  specialActionLabel,
} from "@/lib/rbac/access-levels";
import { roleLock } from "@/lib/rbac/role-lock";
import { ALL_ROLES, roleDescription, roleLabel } from "@/lib/rbac/roles";
import { isSuperAdminRoleName } from "@/lib/rbac/admin-safety";
import { defaultPermissionsFor, normalizePermissions } from "@/lib/rbac/default-permissions";
import { resolveRolePermissions } from "@/lib/rbac/role-permissions";
import { buildRoleAccess } from "@/lib/rbac/role-access";
import { canOpenPage } from "@/lib/rbac/page-guard";
import {
  ALL_SUB_ITEM_PERMISSIONS,
  PERMISSION_MODULES,
  findModule,
  findSubItem,
  permissionKey,
  permissionsForPage,
  isPublicPage,
} from "@/lib/rbac/permissions.config";

/**
 * Role & Permissions management suite.
 *
 * This is the screen an administrator actually uses, so these tests are about
 * the behaviour that screen promises:
 *
 *   - only Super Admin is locked, and `isSystem` never locks a role;
 *   - the four levels round-trip, and lowering a level really removes rights;
 *   - the presets and "reset to default" land on the shipped baseline;
 *   - what the preview promises is what the sidebar and the URL guard enforce.
 */

const SUB_ITEMS = PERMISSION_MODULES.flatMap((module) => module.subItems);
const WRITE_ACTIONS = ["create", "update", "delete"] as const;

let passedTests = 0;
let totalTests = 0;

function test(name: string, fn: () => void): void {
  totalTests += 1;
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passedTests += 1;
  } catch (err: unknown) {
    console.error(`  ✗ ${name}`);
    console.error(err);
    throw err;
  }
}

function section(moduleKey: string, subItemKey: string) {
  const subItem = findSubItem(moduleKey, subItemKey);
  assert.ok(subItem, `${moduleKey}.${subItemKey} is not in the catalogue`);
  return subItem;
}

const patientsRegister = section("patients", "register");
const patientsList = section("patients", "list");

/* --------------------------------------------------------------- A1: locking */

test("Only Super Admin is locked; every other role is editable", () => {
  for (const roleName of ALL_ROLES) {
    const lock = roleLock({ roleName, mayUpdate: true });
    if (roleName === "ADMIN") {
      assert.equal(lock.locked, true, "Super Admin must stay locked");
      assert.equal(lock.reason, "SUPER_ADMIN");
    } else {
      assert.equal(lock.locked, false, `${roleName} must be editable`);
      assert.equal(lock.reason, "NOT_LOCKED");
    }
  }
});

test("The lock never depends on isSystem", () => {
  // `isSystem` is not even an input to roleLock: the five built-in roles other
  // than Super Admin are all isSystem:true and all still editable.
  for (const roleName of ["DOCTOR", "NURSE", "RECEPTIONIST", "PHARMACIST", "ACCOUNTANT"]) {
    assert.equal(roleLock({ roleName, mayUpdate: true }).locked, false);
  }
});

test("A custom role is editable as well", () => {
  assert.equal(roleLock({ roleName: "RECEPTION_SUPERVISOR", mayUpdate: true }).locked, false);
});

test("Without admin.roles:update nothing is editable, and the reason says so", () => {
  for (const roleName of ALL_ROLES) {
    const lock = roleLock({ roleName, mayUpdate: false });
    assert.equal(lock.locked, true, `${roleName} must be read-only without the permission`);
    assert.ok(lock.message.length > 0, "a locked role always explains itself");
    assert.equal(lock.reason, roleName === "ADMIN" ? "SUPER_ADMIN" : "NOT_PERMITTED");
  }
});

test("Nobody may edit the role they use themselves", () => {
  const lock = roleLock({ roleName: "DOCTOR", mayUpdate: true, isOwnRole: true });
  assert.equal(lock.locked, true);
  assert.equal(lock.reason, "OWN_ROLE");
  // Own role loses to Super Admin's reason, but stays locked either way.
  assert.equal(roleLock({ roleName: "ADMIN", mayUpdate: true, isOwnRole: true }).reason, "SUPER_ADMIN");
});

test("Every role has a plain-language label and a description", () => {
  for (const roleName of ALL_ROLES) {
    assert.notEqual(roleLabel(roleName), roleName, `${roleName} has no friendly label`);
    assert.ok(roleDescription(roleName).length > 20, `${roleName} has no usable description`);
  }
  assert.equal(roleLabel("ADMIN"), "Super Admin");
});

test("A description stored on the role wins over the built-in text", () => {
  assert.equal(roleDescription("DOCTOR", "Night doctor for ward 3"), "Night doctor for ward 3");
  assert.equal(roleDescription("DOCTOR", "   "), roleDescription("DOCTOR"));
});

/* ------------------------------------------------- A2: levels round-tripping */

test("The four levels are the only choices offered", () => {
  assert.deepEqual([...ACCESS_LEVELS], ["NONE", "VIEW", "EDIT", "FULL"]);
  assert.deepEqual(PRESET_IDS, ["NONE", "VIEW", "STANDARD", "FULL"]);
  for (const level of ACCESS_LEVELS) {
    assert.ok(ACCESS_LEVEL_HELP[level].length > 0, `${level} has no explanation`);
  }
});

test("Every level round-trips through the picker", () => {
  for (const level of ACCESS_LEVELS) {
    const next = applyLevel(new Set<string>(), "patients", patientsRegister, level);
    assert.equal(levelOf(next, "patients", patientsRegister), level, `${level} did not round-trip`);
  }
});

test("Lowering a level takes the extra rights away again", () => {
  let selection = applyLevel(new Set<string>(), "patients", patientsRegister, "FULL");
  assert.ok(selection.has(permissionKey("patients", "register", "delete")));

  selection = applyLevel(selection, "patients", patientsRegister, "VIEW");
  assert.equal(selection.has(permissionKey("patients", "register", "create")), false);
  assert.equal(selection.has(permissionKey("patients", "register", "update")), false);
  assert.equal(selection.has(permissionKey("patients", "register", "delete")), false);
  assert.equal(selection.has(permissionKey("patients", "register", "view")), true);

  selection = applyLevel(selection, "patients", patientsRegister, "NONE");
  assert.equal(selection.size, 0, "No access must clear the whole section");
});

test("No access never leaves a special action behind", () => {
  const withSpecial = applyLevel(new Set<string>(), "pharmacy", section("pharmacy", "dispensing"), "FULL");
  assert.ok(withSpecial.size > 0);
  const cleared = applyLevel(withSpecial, "pharmacy", section("pharmacy", "dispensing"), "NONE");
  for (const key of allKeysForSubItem("pharmacy", section("pharmacy", "dispensing"))) {
    assert.equal(cleared.has(key), false, `${key} survived No access`);
  }
});

test("Extra actions such as dispense are kept while the page stays reachable", () => {
  const dispensing = section("pharmacy", "dispensing");
  const dispenseKey = dispensing.specials[0].action;
  let selection = applyLevel(new Set<string>(), "pharmacy", dispensing, "EDIT");
  selection = new Set([...selection, permissionKey("pharmacy", "dispensing", dispenseKey)]);
  selection = applyLevel(selection, "pharmacy", dispensing, "EDIT");
  assert.ok(selection.has(permissionKey("pharmacy", "dispensing", dispenseKey)), "the extra action was dropped");
  // View only promises nothing can be changed, so it clears them.
  selection = applyLevel(selection, "pharmacy", dispensing, "VIEW");
  assert.equal(selection.has(permissionKey("pharmacy", "dispensing", dispenseKey)), false);
});

test("A section that has no delete button is never given one", () => {
  const reportsModule = PERMISSION_MODULES.find((module) => module.key === "reports");
  assert.ok(reportsModule, "reports module is missing");
  const readOnly = reportsModule.subItems.find((subItem) => !subItem.actions.includes("delete"));
  if (!readOnly) return; // every reports section offers delete; nothing to assert

  const keys = applyLevel(new Set<string>(), "reports", readOnly, "FULL");
  for (const key of keys) {
    assert.notEqual(key, permissionKey("reports", readOnly.key, "delete"));
    assert.ok(readOnly.actions.some((action) => key.endsWith(`:${action}`)));
  }
});

test("A level only grants keys the catalogue declares", () => {
  for (const subItem of SUB_ITEMS) {
    const declared = new Set(allKeysForSubItem("x", subItem));
    for (const level of ACCESS_LEVELS) {
      for (const key of keysForLevel("x", subItem, level)) {
        assert.ok(declared.has(key), `${key} is not declared for ${subItem.key}`);
      }
    }
  }
});

test("Unrecognised stored keys are reported as the highest level that is true", () => {
  // Legacy data can hold view + delete with no create. It must not claim "Full".
  const odd = new Set([
    permissionKey("patients", "register", "view"),
    permissionKey("patients", "register", "delete"),
  ]);
  assert.equal(levelOf(odd, "patients", patientsRegister), "EDIT");
  // And choosing a level repairs it.
  assert.equal(levelOf(applyLevel(odd, "patients", patientsRegister, "VIEW"), "patients", patientsRegister), "VIEW");
});

/* ----------------------------------------------------------- A3: the presets */

test("No access preset really means nothing at all", () => {
  assert.equal(applyPreset("NONE", "DOCTOR").size, 0);
});

test("View only preset opens every page and grants nothing else", () => {
  const selection = applyPreset("VIEW", "DOCTOR");
  for (const catalogueModule of PERMISSION_MODULES) {
    for (const subItem of catalogueModule.subItems) {
      assert.ok(selection.has(permissionKey(catalogueModule.key, subItem.key, "view")), `${subItem.key} is not open`);
      for (const action of WRITE_ACTIONS) {
        if (subItem.actions.includes(action)) {
          assert.equal(selection.has(permissionKey(catalogueModule.key, subItem.key, action)), false);
        }
      }
      for (const special of subItem.specials) {
        assert.equal(selection.has(permissionKey(catalogueModule.key, subItem.key, special.action)), false);
      }
    }
  }
});

test("Full access preset covers the whole catalogue, extras included", () => {
  const selection = applyPreset("FULL", "ACCOUNTANT");
  const catalogue = allKeysForCatalogue();
  for (const key of catalogue) assert.ok(selection.has(key), `${key} is missing from Full access`);
  assert.equal(selection.size, catalogue.length);
});

test("The Standard preset and Reset return the shipped default for the role", () => {
  for (const roleName of ALL_ROLES) {
    const expected = normalizePermissions(defaultPermissionsFor(roleName));
    assert.deepEqual([...applyPreset("STANDARD", roleName)].sort(), expected, `${roleName} standard preset`);
    assert.deepEqual([...resetToRoleDefault(roleName)].sort(), expected, `${roleName} reset`);
  }
});

test("The shipped default for a role is always openable", () => {
  for (const roleName of ALL_ROLES) {
    for (const catalogueModule of PERMISSION_MODULES) {
      const progress = moduleProgress(new Set(resetToRoleDefault(roleName)), catalogueModule);
      assert.ok(progress.total > 0);
    }
    assert.ok(catalogueProgress(resetToRoleDefault(roleName)).allowed > 0, `${roleName} has no pages at all`);
  }
});

/* ------------------------------------------------- A4: progress and unsaved */

test("Module and catalogue progress count openable sections", () => {
  const selection = new Set([
    permissionKey("patients", "register", "view"),
    permissionKey("patients", "list", "view"),
  ]);
  const patients = findModule("patients");
  assert.ok(patients);
  assert.deepEqual(moduleProgress(selection, patients), {
    allowed: 2,
    total: patients.subItems.length,
  });
  assert.equal(moduleIsFullyOn(selection, patients), false);
  assert.equal(moduleIsPartlyOn(selection, patients), true);

  const all = applyLevelEverywhere(new Set<string>(), "VIEW");
  assert.equal(moduleIsFullyOn(all, patients), true);
  assert.equal(moduleIsPartlyOn(all, patients), false);
});

test("Progress never exceeds the catalogue", () => {
  const everything = applyLevelEverywhere(new Set<string>(), "FULL");
  const progress = catalogueProgress(everything);
  assert.equal(progress.allowed, progress.total);
  assert.equal(
    progress.total,
    PERMISSION_MODULES.reduce((sum, module) => sum + module.subItems.length, 0)
  );
});

test("Unsaved-change counting notices both a gain and a loss", () => {
  const base = resetToRoleDefault("DOCTOR");
  assert.equal(countChangedSections(base, base), 0);

  const gained = applyLevel(base, "patients", patientsRegister, "VIEW");
  assert.ok(countChangedSections(gained, base) >= 1, "a change must be reported");

  const nothing = applyLevelEverywhere(base, "NONE");
  assert.equal(countChangedSections(nothing, base), catalogueProgress(base).allowed);
});

test("Every special action reads as a plain sentence", () => {
  assert.equal(specialActionLabel("dispense"), "Can dispense medicines");
  assert.equal(specialActionLabel("upload"), "Can upload documents");
  assert.equal(specialActionLabel("something_odd"), "Can something_odd");
  assert.ok(moduleHelp("patients").length > 0);
});

/* -------------------------------- A5: sidebar, preview and the URL guard agree */

test("A Receptionist with only Register Patient sees exactly that in the sidebar", () => {
  const selection = new Set(normalizePermissions([permissionKey("patients", "register", "create")]));
  const menus = filterMenusByPermissions(MENUS, selection);
  const visible = menus.flatMap((group) => (group.children ?? []).map((child) => child.name));
  assert.equal(visible.length, 1, `expected one sidebar item, saw ${visible.join(", ")}`);
  assert.equal(catalogueProgress(selection).allowed, 1);
});

test("The URL guard refuses the pages the sidebar hides", () => {
  const selection = new Set(normalizePermissions([permissionKey("patients", "register", "create")]));
  const identity = { isSuperAdmin: false, all: new Set(selection) };

  assert.equal(canOpenPage(permissionsForPage("/patients/register"), identity), true, "the one page it has");
  assert.equal(canOpenPage(permissionsForPage("/patients/list"), identity), false, "the patient list must be 403");
  assert.equal(canOpenPage(permissionsForPage("/admin/roles"), identity), false, "role management must be 403");
});

test("A page with no catalogue entry is denied by default", () => {
  const identity = { isSuperAdmin: false, all: new Set<string>() };
  assert.equal(canOpenPage([], identity), false);
  assert.equal(canOpenPage([], identity, isPublicPage("/login")), true);
});

test("Super Admin can open every catalogue page", () => {
  const identity = { isSuperAdmin: true, all: new Set<string>() };
  for (const path of ["/patients/list", "/admin/roles", "/admin/roles/abc/permissions", "/dashboard"]) {
    assert.ok(permissionsForPage(path).length > 0, `${path} is not guarded at all`);
    assert.equal(canOpenPage(permissionsForPage(path), identity), true);
  }
});

test("The role editor is guarded like the roles list", () => {
  const required = permissionsForPage("/admin/roles/65f0000000000000000000aa/permissions");
  assert.deepEqual([...required], [permissionKey("admin", "roles", "view")]);
  assert.equal(
    canOpenPage(required, { isSuperAdmin: false, all: new Set([permissionKey("admin", "roles", "view")]) }),
    true
  );
  assert.equal(canOpenPage(required, { isSuperAdmin: false, all: new Set() }), false);
});

test("Every catalogue page is either guarded or deliberately always open", () => {
  const alwaysOpen = new Set(["/", "/login", "/forbidden"]);
  const identity = { isSuperAdmin: false, all: new Set<string>() };
  for (const group of MENUS) {
    const paths = [group.path, ...(group.children ?? []).map((child) => child.path)];
    for (const path of paths) {
      if (!path || alwaysOpen.has(path)) continue;
      const required = permissionsForPage(path);
      assert.ok(required.length > 0, `${path} is reachable with no permission at all`);
      assert.equal(canOpenPage(required, identity), false, `${path} is open to a role holding nothing`);
    }
  }
});

/* ------------------------------------------------- A6: stored data sanity */

test("Normalising a write implies its own view and drops unknown keys", () => {
  const normalised = normalizePermissions([
    permissionKey("patients", "register", "create"),
    "patients.register:launch_rocket",
    "not-a-permission",
  ]);
  assert.ok(normalised.includes(permissionKey("patients", "register", "view")));
  assert.equal(normalised.includes("patients.register:launch_rocket"), false);
  assert.equal(normalised.includes("not-a-permission"), false);
});

test("Nothing in the catalogue can produce a key outside the catalogue", () => {
  const known = new Set<string>(ALL_SUB_ITEM_PERMISSIONS);
  for (const roleName of ALL_ROLES) {
    for (const key of resetToRoleDefault(roleName)) {
      assert.ok(known.has(key), `${roleName} default holds unknown key ${key}`);
    }
    for (const preset of PRESET_IDS) {
      for (const key of applyPreset(preset, roleName)) {
        assert.ok(known.has(key), `${roleName}/${preset} produced unknown key ${key}`);
      }
    }
  }
});

test("The lock helper agrees with the role-name helper", () => {
  assert.equal(isSuperAdminRoleName("ADMIN"), true);
  assert.equal(isSuperAdminRoleName("admin"), true);
  assert.equal(isSuperAdminRoleName("  ADMIN  "), true);
  assert.equal(isSuperAdminRoleName("DOCTOR"), false);
  assert.equal(isSuperAdminRoleName(null), false);
  assert.equal(roleLock({ roleName: "ADMIN", mayUpdate: true }).locked, true);
});

test("A saved change survives a save/load round-trip through the level model", () => {
  // What the editor writes is exactly what it reads back: no phantom keys, and
  // the preview agrees with the stored set.
  let selection = applyLevel(new Set<string>(), "patients", patientsRegister, "VIEW");
  selection = applyLevel(selection, "patients", patientsList, "FULL");
  const stored = normalizePermissions(selection);

  assert.deepEqual(stored, [...stored].sort(), "the stored list is sorted, so an unchanged save is a no-op");
  assert.deepEqual(new Set(stored), selection, "normalising this selection adds nothing");
  assert.equal(stored.includes(permissionKey("patients", "register", "create")), false);
  assert.equal(stored.includes(permissionKey("patients", "list", "delete")), true);

  // Re-read as the editor would on the next visit.
  assert.equal(levelOf(new Set(stored), "patients", patientsRegister), "VIEW");
  assert.equal(levelOf(new Set(stored), "patients", patientsList), "FULL");

  // And the preview matches the stored set, not the in-memory one.
  const menus = filterMenusByPermissions(MENUS, new Set(stored));
  assert.deepEqual(menus, filterMenusByPermissions(MENUS, selection));
  assert.equal(catalogueProgress(new Set(stored)).allowed, 2);
  assert.equal(countChangedSections(selection, new Set(stored)), 0);
});

/* ------------------------------------- A7: a removed permission stays removed */

test("A permission removed on screen does not come back through the old keys", () => {
  // `access[]` still holds the legacy module keys the app shipped with. If the
  // resolver unioned the two layers, unticking a box on the Roles screen would
  // change nothing — which is the bug this rule exists to prevent.
  const legacy = buildRoleAccess("RECEPTIONIST");
  const full = resolveRolePermissions({ role: "RECEPTIONIST", permissions: [], access: legacy });
  assert.ok(full.subItem.length > 1, "the legacy layer alone should open several sections");

  const narrowed = resolveRolePermissions({
    role: "RECEPTIONIST",
    permissions: [permissionKey("patients", "register", "create")],
    access: legacy,
  });
  assert.deepEqual(narrowed.subItem.sort(), [
    permissionKey("patients", "register", "create"),
    permissionKey("patients", "register", "view"),
  ]);
  assert.equal(canOpenPage(permissionsForPage("/patients/list"), narrowed), false);
  assert.equal(canOpenPage(permissionsForPage("/finance/payments"), narrowed), false);
});

test("A role that has never stored sub-item keys still migrates its legacy ones", () => {
  const resolved = resolveRolePermissions({ role: "NURSE", permissions: [], access: buildRoleAccess("NURSE") });
  assert.ok(resolved.subItem.length > 0, "an un-migrated database must not resolve to nothing");
  assert.ok(resolved.legacy.length > 0, "the legacy keys are still needed by the data-layer guard");
});

test("Super Admin keeps every permission whatever is stored", () => {
  const resolved = resolveRolePermissions({ role: "ADMIN", permissions: ["patients.list:view"], access: [] });
  assert.equal(resolved.subItem.length, ALL_SUB_ITEM_PERMISSIONS.length);
  assert.equal(resolved.isSuperAdmin, true);
});

test("Removing a box changes what the guard would see on the very next read", () => {
  const identity = (permissions: string[]) => ({ isSuperAdmin: false, all: new Set(permissions) });
  const before = resolveRolePermissions({
    role: "RECEPTIONIST",
    permissions: [permissionKey("patients", "list", "view"), permissionKey("patients", "register", "create")],
    access: [],
  });
  const after = resolveRolePermissions({
    role: "RECEPTIONIST",
    permissions: [permissionKey("patients", "register", "create")],
    access: [],
  });

  assert.equal(canOpenPage(permissionsForPage("/patients/list"), identity(before.subItem)), true);
  assert.equal(canOpenPage(permissionsForPage("/patients/list"), identity(after.subItem)), false);
  assert.equal(canOpenPage(permissionsForPage("/patients/register"), identity(after.subItem)), true);
});

console.log("\n=================================================");
console.log("  Role & Permissions Management Tests");
console.log(`  Result: ${passedTests}/${totalTests} passed`);
console.log("=================================================\n");

if (passedTests !== totalTests) process.exit(1);
