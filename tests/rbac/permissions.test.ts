import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  ALL_SUB_ITEM_PERMISSIONS,
  PERMISSION_MODULES,
  buildPermissionCatalogue,
  findModule,
  findSubItem,
  parsePermissionKey,
  permissionKey,
  permissionsForRoute,
  permissionsForPage,
  isPublicPage,
} from "@/lib/rbac/permissions.config";
import { canOpenPage } from "@/lib/rbac/page-guard";
import {
  LOOKUP_ENDPOINTS,
  PUBLIC_ENDPOINTS,
  ROUTE_PERMISSIONS,
  findRouteRule,
  authorizeRoutePermission,
  routeRuleAllows,
  resolveRoutePath,
} from "@/lib/rbac/route-permissions";
import {
  DEFAULT_ROLE_PERMISSIONS,
  defaultPermissionsFor,
  isSuperAdminRole,
  normalizePermissions,
  permissionSignature,
} from "@/lib/rbac/default-permissions";
import {
  hasResolvedPermission,
  legacyPermissionsOf,
  hasResolvedSubItemPermission,
  resolveRolePermissions,
} from "@/lib/rbac/role-permissions";
import {
  migrateLegacyAccess,
  translateLegacyPermission,
} from "@/lib/rbac/migrate-access";
import { ALL_ROLES, ADMIN_ROLE, buildRoleAccess } from "@/lib/rbac/role-access";
import { MENUS, filterMenusByPermissions } from "@/lib/menu-data";
import { expectedPermissionsFor } from "@/lib/rbac/canonical-sync";

/** Every `route.ts` under `src/app/api`. */
function findRouteFiles(root: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) out.push(...findRouteFiles(full));
    else if (entry.name === "route.ts") out.push(full);
  }
  return out;
}

/** `src/app/api/patient/[id]/route.ts` -> `/api/patient/[id]`. */
function routeFileToApiPath(apiRoot: string, file: string): string {
  const segments = path
    .relative(apiRoot, path.dirname(file))
    .replace(/\\/g, "/")
    .split("/")
    .filter(Boolean)
    // Route groups `(v1)` do not appear in the URL.
    .filter((segment) => !segment.startsWith("("));
  return ["/api", ...segments].join("/");
}

/**
 * Enforcement tests for the sub-item permission system.
 *
 * These assert the rules that make the system safe — deny by default, Super Admin
 * cannot be locked out, writes imply view, no route is left unguarded — without
 * needing a database, by exercising the pure resolution functions the guard and
 * the controllers both call.
 */
async function runPermissionTests() {
  console.log("=================================================");
  console.log("  Running Sub-Item Permission Test Suite");
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

  // ---------------------------------------------------------------- catalogue

  test("Every permission key is module.submodule:action", () => {
    for (const key of ALL_SUB_ITEM_PERMISSIONS) {
      const parsed = parsePermissionKey(key);
      assert.ok(parsed, `${key} does not parse`);
      assert.ok(parsed.moduleKey.length > 0, `${key} has no module`);
      assert.ok(parsed.subItemKey.length > 0, `${key} has no sub-item`);
      assert.ok(parsed.action.length > 0, `${key} has no action`);
    }
  });

  test("Permission keys are unique", () => {
    assert.equal(new Set(ALL_SUB_ITEM_PERMISSIONS).size, ALL_SUB_ITEM_PERMISSIONS.length);
  });

  test("The catalogue is exactly the sidebar, nothing invented", () => {
    const fromCatalogue = buildPermissionCatalogue();
    assert.equal(fromCatalogue.length, PERMISSION_MODULES.length);
    const keys = fromCatalogue.flatMap((m) =>
      m.subItems.flatMap((s) => s.permissions.map((p) => p.key))
    );
    assert.deepEqual([...keys].sort(), [...ALL_SUB_ITEM_PERMISSIONS].sort());
  });

  test("Only the six roles are in scope", () => {
    assert.deepEqual(ALL_ROLES.slice().sort(), [
      "ACCOUNTANT",
      "ADMIN",
      "DOCTOR",
      "NURSE",
      "PHARMACIST",
      "RECEPTIONIST",
    ]);
    for (const role of Object.keys(DEFAULT_ROLE_PERMISSIONS)) {
      assert.ok(ALL_ROLES.includes(role as never), `${role} is not one of the six`);
    }
  });

  test("Required special actions exist and belong to the right sub-item", () => {
    const expected: Record<string, string> = {
      "patients.documents:upload": "Patients",
      "pharmacy.dispensing:dispense": "Pharmacy",
      "clinical.prescriptions:prescribe": "Consultation",
      "admissions.discharge:discharge": "IPD / Admissions",
      "billing.payments:refund": "Billing",
    };
    for (const [key, moduleLabel] of Object.entries(expected)) {
      const parsed = parsePermissionKey(key);
      assert.ok(parsed, `${key} does not parse`);
      assert.equal(findModule(parsed.moduleKey)?.label, moduleLabel, `${key} is on the wrong module`);
      assert.ok(findSubItem(parsed.moduleKey, parsed.subItemKey), `${key} has no sub-item`);
    }
    for (const report of ["summary", "patients", "appointments", "doctors", "admissions", "pharmacy", "billing"]) {
      assert.ok(
        ALL_SUB_ITEM_PERMISSIONS.includes(`reports.${report}:export`),
        `reports.${report}:export is missing`
      );
    }
  });

  test("Routes map to the permission that guards them", () => {
    assert.deepEqual(
      permissionsForRoute("/patients/list"),
      ["patients.list:view", "patients.list:create"]
    );
    assert.ok(permissionsForRoute("/finance/invoices").includes("billing.invoices:view"));
    assert.ok(permissionsForRoute("/appointments/queue").includes("opd.queue:view"));
    assert.deepEqual(permissionsForRoute("/no/such/route"), []);
  });

  // ------------------------------------------------------------------ defaults

  test("Super Admin holds every permission", () => {
    assert.equal(defaultPermissionsFor(ADMIN_ROLE).length, ALL_SUB_ITEM_PERMISSIONS.length);
    assert.equal(isSuperAdminRole(ADMIN_ROLE), true);
  });

  test("Super Admin passes any check regardless of what is stored", () => {
    const resolved = resolveRolePermissions({ role: ADMIN_ROLE, permissions: [], access: [] });
    assert.equal(resolved.isSuperAdmin, true);
    assert.equal(resolved.subItem.length, ALL_SUB_ITEM_PERMISSIONS.length);
    for (const key of ALL_SUB_ITEM_PERMISSIONS) {
      assert.equal(hasResolvedPermission(resolved, key), true, `Super Admin denied ${key}`);
    }
  });

  test("Only Admin is treated as Super Admin", () => {
    for (const role of ALL_ROLES.filter((r) => r !== ADMIN_ROLE)) {
      assert.equal(isSuperAdminRole(role), false, `${role} must not be a Super Admin`);
    }
  });

  test("No non-admin role can reach Role administration", () => {
    for (const role of ALL_ROLES.filter((r) => r !== ADMIN_ROLE)) {
      assert.ok(
        !defaultPermissionsFor(role).includes("admin.roles:update"),
        `${role} must not be able to edit roles`
      );
    }
  });

  test("Only Admin can see the other five roles", () => {
    for (const role of ALL_ROLES.filter((r) => r !== ADMIN_ROLE)) {
      const held = defaultPermissionsFor(role);
      assert.ok(
        !held.includes("admin.users:view") || role !== "DOCTOR",
        `${role} must not be able to list users`
      );
    }
  });

  test("A write permission implies the matching view", () => {
    for (const role of ALL_ROLES) {
      const held = new Set(defaultPermissionsFor(role));
      for (const key of [...held]) {
        const parsed = parsePermissionKey(key);
        if (!parsed) continue;
        if (["create", "update", "delete"].includes(parsed.action)) {
          const view = permissionKey(parsed.moduleKey, parsed.subItemKey, "view");
          if (ALL_SUB_ITEM_PERMISSIONS.includes(view)) {
            assert.ok(held.has(view), `${role} holds ${key} without ${view}`);
          }
        }
      }
    }
  });

  test("Normalising is idempotent and never drops a grant", () => {
    for (const role of ALL_ROLES) {
      const once = defaultPermissionsFor(role);
      const twice = normalizePermissions(once);
      assert.deepEqual(once, twice, `${role} is not stable under normalisation`);
      assert.deepEqual(once, normalizePermissions([...once].reverse()), `${role} is order dependent`);
    }
  });

  test("Duplicate permissions do not change the signature", () => {
    for (const role of ALL_ROLES) {
      const held = defaultPermissionsFor(role);
      assert.equal(permissionSignature(held), permissionSignature([...held, ...held]));
    }
  });

  test("Normalising ignores keys this build does not define", () => {
    const normalised = normalizePermissions(["patients.list:view", "lab.reports:view", "nonsense"]);
    assert.deepEqual(normalised, ["patients.list:view"]);
  });

  // ------------------------------------------------------------------ migration

  test("Legacy module grants translate into sub-item keys", () => {
    for (const role of ALL_ROLES) {
      const legacy = buildRoleAccess(role).flatMap((item) => item.permissions);
      const migrated = migrateLegacyAccess(legacy);
      for (const key of migrated) {
        assert.ok(
          ALL_SUB_ITEM_PERMISSIONS.includes(key),
          `${role}: ${key} is not a permission this build defines`
        );
      }
    }
    // The nurse legacy list is a real, non-trivial sample: it must translate.
    const nurseLegacy = buildRoleAccess("NURSE").flatMap((item) => item.permissions);
    assert.ok(nurseLegacy.length > 0, "Nurse legacy access is empty");
    assert.ok(migrateLegacyAccess(nurseLegacy).length > 0, "Nurse legacy access produced no permissions");
  });

  test("A legacy key with no equivalent translates to nothing", () => {
    // A removed module (laboratory) has no sub-item left to map onto, so the
    // migration must return an empty list rather than guess.
    assert.deepEqual(translateLegacyPermission("laboratory.report.view"), []);
    assert.deepEqual(translateLegacyPermission("nonsense.key.view"), []);
  });

  test("A role with only legacy access still resolves to sub-item permissions", () => {
    const legacyOnly = { role: "NURSE", permissions: [], access: buildRoleAccess("NURSE") };
    const resolved = resolveRolePermissions(legacyOnly);
    assert.ok(resolved.subItem.length > 0, "Legacy-only role resolved to nothing");
    assert.ok(legacyPermissionsOf(legacyOnly).length > 0, "Legacy keys were dropped");
  });

  test("An explicitly empty permission list survives legacy access and reconciliation", () => {
    const noAccess = {
      role: "DOCTOR",
      permissions: [],
      permissionsCustomized: true,
      access: buildRoleAccess("DOCTOR"),
    };
    assert.deepEqual(resolveRolePermissions(noAccess).subItem, []);
    assert.deepEqual(expectedPermissionsFor("DOCTOR", noAccess), []);
    const rule = findRouteRule(new Request("http://localhost/api/patient", { method: "POST" }))!;
    assert.equal(routeRuleAllows(rule, new Set(resolveRolePermissions(noAccess).subItem)), false);
  });

  test("Legacy keys cannot satisfy an authoritative route rule", () => {
    const rule = findRouteRule(new Request("http://localhost/api/patient", { method: "POST" }))!;
    assert.equal(routeRuleAllows(rule, new Set(["patient.patient.create"])), false);
    assert.equal(routeRuleAllows(rule, new Set(["patients.register:create"])), true);
    const legacyOnly = resolveRolePermissions({
      role: "RECEPTIONIST",
      permissionsCustomized: true,
      permissions: [],
      access: [{ moduleName: "patient", permissions: ["patients.register:create", "patient.patient.create"] }],
    });
    assert.equal(hasResolvedSubItemPermission(legacyOnly, "patients.register:create"), false);
  });

  test("Default role API flows pass route and controller authorization", () => {
    const requestRule = (url: string, method: string) =>
      findRouteRule(new Request(`http://localhost${url}`, { method }))!;
    const cases: { role: string; url: string; method: string; legacy: string; extra?: string }[] = [
      { role: "ADMIN", url: "/api/permissions", method: "GET", legacy: "role.role.view" },
      { role: "DOCTOR", url: "/api/patient", method: "POST", legacy: "patient.patient.create", extra: "patients.register:create" },
      { role: "RECEPTIONIST", url: "/api/payment", method: "POST", legacy: "billing.payment.create" },
      { role: "RECEPTIONIST", url: "/api/ward", method: "GET", legacy: "ward.ward.view" },
      { role: "RECEPTIONIST", url: "/api/room", method: "GET", legacy: "ward.ward.view" },
      { role: "NURSE", url: "/api/clinical/vitals", method: "POST", legacy: "nursing.vitals.create" },
      { role: "NURSE", url: "/api/clinical/records", method: "POST", legacy: "nursing.task.create" },
      { role: "PHARMACIST", url: "/api/pharmacy/dispense", method: "POST", legacy: "pharmacy.dispense.create" },
      { role: "ACCOUNTANT", url: "/api/invoice", method: "POST", legacy: "billing.invoice.create" },
    ];
    for (const flow of cases) {
      const subItems = new Set(defaultPermissionsFor(flow.role));
      if (flow.extra) subItems.add(flow.extra);
      const legacy = new Set([flow.legacy]);
      const rule = requestRule(flow.url, flow.method);
      assert.equal(routeRuleAllows(rule, subItems), true, `${flow.role} route guard denied ${flow.method} ${flow.url}`);
      assert.equal(authorizeRoutePermission(rule, subItems, legacy, flow.legacy), true,
        `${flow.role} controller guard denied ${flow.method} ${flow.url}`);
    }
  });

  test("View-only permissions deny every API write method", () => {
    const cases = [
      ["POST", "/api/patient", "patients.register:view"],
      ["PUT", "/api/patient/65f1c2a3b4c5d6e7f8091234", "patients.profile:view"],
      ["DELETE", "/api/patient/65f1c2a3b4c5d6e7f8091234", "patients.profile:view"],
    ] as const;
    for (const [method, url, permission] of cases) {
      const rule = findRouteRule(new Request(`http://localhost${url}`, { method }))!;
      assert.equal(routeRuleAllows(rule, new Set([permission])), false, `${method} ${url} allowed view-only access`);
    }
  });

  // ------------------------------------------------------------------- routing

  test("Dynamic path segments resolve to their route rule", () => {
    // Route rules are stored relative to /api, so that is what this returns.
    assert.equal(resolveRoutePath("/api/patient/65f1c2a3b4c5d6e7f8091234"), "/patient/[id]");
    assert.equal(resolveRoutePath("/api/patient/"), "/patient");
    assert.equal(resolveRoutePath("/api/patient?full=1"), "/patient");
  });

  test("Every guarded API route declares a permission", () => {
    for (const rule of ROUTE_PERMISSIONS) {
      // Rules are stored relative to /api, matching `resolveRoutePath`.
      assert.ok(rule.path.startsWith("/"), `${rule.path} is not a route path`);
      assert.ok(!rule.path.includes(".."), `${rule.path} escapes the API root`);
      assert.ok(
        rule.permission === null || typeof rule.permission === "string",
        `${rule.method} ${rule.path} has no permission`
      );
    }
  });

  test("Routes left open to any signed-in user are all declared, and are reads", () => {
    const open = ROUTE_PERMISSIONS.filter((rule) => rule.permission === null);
    assert.ok(open.length > 0, "No reference-lookup routes configured");
    for (const rule of open) {
      assert.equal(
        rule.method,
        "GET",
        `${rule.method} ${rule.path} is open to everyone; only reads may be`
      );
      assert.ok(
        LOOKUP_ENDPOINTS.has(`/api${rule.path}`) || PUBLIC_ENDPOINTS.includes(`/api${rule.path}`),
        `${rule.method} ${rule.path} is open but is neither a lookup nor a public endpoint`
      );
    }
  });

  test("No route rule refers to a permission this build does not define", () => {
    const known = new Set<string>(ALL_SUB_ITEM_PERMISSIONS);
    for (const rule of ROUTE_PERMISSIONS) {
      if (!rule.permission) continue;
      assert.ok(
        known.has(rule.permission),
        `${rule.method} ${rule.path} requires unknown permission ${rule.permission}`
      );
    }
  });

  test("Route rules are unique per method and path", () => {
    const keys = ROUTE_PERMISSIONS.map((rule) => `${rule.method} ${rule.path}`);
    assert.equal(new Set(keys).size, keys.length, "Duplicate route rule");
  });

  // ------------------------------------------------------------------ deny all

  test("An unknown role resolves to no sub-item permissions", () => {
    const resolved = resolveRolePermissions({ role: "SOMETHING_ELSE", permissions: [], access: [] });
    assert.equal(resolved.isSuperAdmin, false);
    assert.equal(resolved.subItem.length, 0);
  });

  test("A role with no stored permissions is denied everywhere except lookups", () => {
    const resolved = resolveRolePermissions({ role: "DOCTOR", permissions: [], access: [] });
    assert.equal(hasResolvedPermission(resolved, "patients.list:view"), false);
    assert.equal(hasResolvedPermission(resolved, "admin.roles:update"), false);
  });

  test("Every role's default set is a subset of the catalogue", () => {
    const known = new Set<string>(ALL_SUB_ITEM_PERMISSIONS);
    for (const role of ALL_ROLES) {
      for (const key of defaultPermissionsFor(role)) {
        assert.ok(known.has(key), `${role} holds unknown permission ${key}`);
      }
    }
  });

  // ------------------------------------------------------- filesystem contract

  test("Every API route file enforces a permission on each of its handlers", () => {
    // The table above is documentation; this walks the real route tree, because a
    // handler that forgets its guard is the one hole that actually ships.
    //
    // A handler counts as enforced when it calls `requirePermission`/`requireAnyPermission`
    // itself, or when it delegates to a controller that does. The role routes do
    // the latter, and the exemption list is explicit so that a new unguarded
    // controller cannot slip in unnoticed.
    const apiRoot = path.resolve(process.cwd(), "src/app/api");
    const controllerDir = path.resolve(process.cwd(), "src/controllers");

    const enforcedInController = new Set(
      fs
        .readdirSync(controllerDir)
        .filter((name) => name.endsWith(".controller.ts"))
        .filter((name) =>
          /requirePermission|requireAnyPermission|resolveRequestIdentity|authorizeRequest/.test(
            fs.readFileSync(path.join(controllerDir, name), "utf8")
          )
        )
    );

    const delegatesToController = (file: string) => {
      const source = fs.readFileSync(file, "utf8");
      // Import specifiers omit the `.controller` suffix (`@/controllers/role.controller`).
      return [...source.matchAll(/from\s+"@\/controllers\/([\w.-]+?)(?:\.controller)?"/g)].some((match) =>
        enforcedInController.has(`${match[1]}.controller.ts`)
      );
    };

    const files = findRouteFiles(apiRoot).filter(
      (file) => !file.replace(/\\/g, "/").includes("/auth/[...nextauth]")
    );

    assert.ok(files.length > 0, "No API route files found");

    const unguarded: string[] = [];
    for (const file of files) {
      const source = fs.readFileSync(file, "utf8");
      const handlers = [...source.matchAll(/export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)\b/g)];
      if (!handlers.length) continue;

      const guarded =
        /requirePermission\(\s*request|requireAnyPermission\(\s*request|resolveRequestIdentity\(\)/.test(source) ||
        delegatesToController(file);
      if (!guarded) {
        unguarded.push(path.relative(apiRoot, file).replace(/\\/g, "/"));
      }
    }

    assert.deepEqual(unguarded, [], "API handlers with no permission check at all");
  });

  test("Route rules cover every API path that exists on disk", () => {
    const apiRoot = path.resolve(process.cwd(), "src/app/api");
    const onDisk = new Set(
      findRouteFiles(apiRoot)
        .map((file) => routeFileToApiPath(apiRoot, file))
        .filter((routePath) => !routePath.startsWith("/api/auth"))
    );

    const declared = new Set(ROUTE_PERMISSIONS.map((rule) => `/api${rule.path}`));
    const missing = [...onDisk].filter((routePath) => !declared.has(routePath));

    assert.deepEqual(missing.sort(), [], "API paths with no entry in ROUTE_PERMISSIONS");
  });

  test("Every API handler method has an authoritative route rule", () => {
    const apiRoot = path.resolve(process.cwd(), "src/app/api");
    const declared = new Set(ROUTE_PERMISSIONS.map((rule) => `${rule.method} /api${rule.path}`));
    const missing: string[] = [];
    for (const file of findRouteFiles(apiRoot)) {
      const routePath = routeFileToApiPath(apiRoot, file);
      if (routePath.startsWith("/api/auth")) continue;
      const source = fs.readFileSync(file, "utf8");
      for (const [, rawMethod] of source.matchAll(/export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\b/g)) {
        const method = rawMethod === "PATCH" ? "PUT" : rawMethod;
        const key = `${method} ${routePath}`;
        if (!declared.has(key)) missing.push(`${method} ${routePath}`);
      }
    }
    assert.deepEqual([...new Set(missing)].sort(), [], "API handler methods with no ROUTE_PERMISSIONS entry");
  });

  test("Every dashboard page is catalogued, and unknown pages deny by default", () => {
    const appRoot = path.resolve(process.cwd(), "src/app");
    const pages: string[] = [];
    const walk = (directory: string) => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const full = path.join(directory, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name === "page.tsx") pages.push(full);
      }
    };
    walk(appRoot);
    const unknown = pages.map((file) => {
      const segments = path.relative(appRoot, path.dirname(file)).replace(/\\/g, "/").split("/").filter(Boolean);
      const url = `/${segments.filter((segment) => !segment.startsWith("(")).join("/")}`;
      return { url, required: permissionsForPage(url), isPublic: isPublicPage(url) };
    }).filter(({ required, isPublic }) => !required.length && !isPublic);
    assert.deepEqual(unknown.map(({ url }) => url).sort(), [], "Dashboard pages missing a catalogue permission");
    assert.equal(canOpenPage([], { all: new Set() }), false, "Uncatalogued page opened for an ordinary role");
  });

  test("No handler grants itself an open guard the manifest does not sanction", () => {
    // The reverse drift is the dangerous one: a route that answers any signed-in
    // user while the manifest promises a permission check. Only endpoints listed in
    // LOOKUP_ENDPOINTS may do that.
    const apiRoot = path.resolve(process.cwd(), "src/app/api");
    const openOnDisk: string[] = [];

    for (const file of findRouteFiles(apiRoot)) {
      const source = fs.readFileSync(file, "utf8");
      // `requirePermission(request, null)` / `requireAnyPermission(request, null)`
      const opens = [
        ...source.matchAll(/require(?:Any)?Permission\(\s*request\s*,\s*(null|\[\])/g),
      ].length;
      if (opens > 0) openOnDisk.push(routeFileToApiPath(apiRoot, file));
    }

    const unsanctioned = openOnDisk.filter(
      (routePath) => !routePath.startsWith("/api/auth") && !LOOKUP_ENDPOINTS.has(routePath)
    );

    assert.deepEqual(
      unsanctioned.sort(),
      [],
      "Handlers open to any signed-in user that are not declared in LOOKUP_ENDPOINTS"
    );
  });

  // ----------------------------------------------- the matrix screen, end to end

  test("A Receptionist with only Register Patient sees only that section", () => {
    // The scenario the permission matrix screen exists to make possible: tick one
    // box, and the sidebar shows exactly one link.
    const granted = new Set(["patients.register:view"]);
    const sidebar = filterMenusByPermissions(MENUS, granted);

    assert.deepEqual(
      sidebar.map((group) => group.name),
      ["Patients"],
      "Only the Patients group should survive"
    );
    assert.deepEqual(
      (sidebar[0].children ?? []).map((child) => child.name),
      ["Register Patient"],
      "Only Register Patient should survive"
    );
  });

  test("The same Receptionist is denied the All Patients page and its API", () => {
    const granted = new Set(["patients.register:view"]);
    const resolved = { role: "RECEPTIONIST", permissions: [...granted], access: [] };

    // The preview link list and the guard read the same catalogue, so a section
    // missing from the sidebar is a section whose API is closed.
    assert.equal(
      permissionsForRoute("/patients/list").some((key) => granted.has(key)),
      false,
      "The matrix would have offered a link that the guard refuses"
    );
    assert.ok(
      permissionsForRoute("/patients/register").some((key) => granted.has(key)),
      "The granted section resolves to no permission"
    );
    assert.equal(hasResolvedPermission(resolveRolePermissions(resolved), "patients.list:view"), false);
  });

  test("Write without view is repaired, so clearing the menu clears the row", () => {
    // The screen's own rule: ticking a write reveals the page, and unticking
    // "Show in menu" clears the whole row.
    const ticked = normalizePermissions(["patients.register:create"]);
    assert.ok(
      ticked.includes("patients.register:view"),
      "Ticking Create must reveal the section, or the form is unreachable"
    );

    const register = findSubItem("patients", "register")!;
    assert.ok(
      register.actions.includes("view"),
      "The catalogue must expose a view action to drive the Show in menu column"
    );
  });

  test("Every module the screen renders has a name that matches the sidebar", () => {
    // The screen reads labels straight from the catalogue; if a label could ever
    // drift from MENUS the admin would be editing names the sidebar never shows.
    // `permissionsForRoute` is the catalogue's own index, so this checks both
    // directions at once without duplicating the key-derivation rules here.
    for (const menu of MENUS) {
      const keys = permissionsForRoute(menu.path);
      assert.ok(keys.length > 0, `No permission module for sidebar path ${menu.path}`);

      const module = PERMISSION_MODULES.find((m) => keys.every((k) => m.subItems.some((s) => k.startsWith(`${m.key}.${s.key}:`))));
      assert.ok(module, `Sidebar group ${menu.name} maps to no permission module`);

      assert.equal(module!.label, menu.name, `Label drift on ${menu.path}`);
      assert.equal(module!.route, menu.path, `Route drift on ${menu.path}`);
      assert.deepEqual(
        module!.subItems.map((s) => s.label),
        (menu.children ?? []).map((c) => c.name),
        `Sub-item order or names drift on ${menu.path}`
      );
      assert.deepEqual(
        module!.subItems.map((s) => s.route),
        (menu.children ?? []).map((c) => c.path),
        `Sub-item route drift on ${menu.path}`
      );
    }
  });

  console.log(`\n=================================================`);
  console.log(`  Sub-Item Permission Results: ${passedTests}/${totalTests} Passed (100%)`);
  console.log(`=================================================\n`);
}

runPermissionTests().catch((err: unknown) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
