/**
 * API route authorization contract.
 *
 * The receptionist 403 was caused by an endpoint that existed but was never
 * wired into the RBAC guard, plus endpoints that guarded only some HTTP
 * methods. These tests are static by design: they need no database and no
 * running server, so they can gate every commit.
 *
 * They lock three invariants:
 *   1. every HTTP method on a protected route calls `authorizeRequest`,
 *   2. each method demands the correct `PERMISSION_KEYS.*` value,
 *   3. no route picks its own scope - the guard is the only scope source.
 *
 * Usage: npx tsx tests/rbac/api-route-guard-contract.test.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { PERMISSION_KEYS } from "@/types/rbac";

const API_ROOT = path.join(process.cwd(), "src", "app", "api");

/** HTTP methods a route file may export. */
const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

/** A file that both exports HTTP methods and participates in the secured API. */
const SECURED_ROUTES = [
  "appointments/queue/route.ts",
  "doctor/route.ts",
  "department/route.ts",
  "staff/route.ts",
  "staff/[id]/route.ts",
  "staff/directory/route.ts",
  "staff/schedule/route.ts",
  "staff/schedule/[id]/route.ts",
  "staff/specializations/route.ts",
  "staff/specializations/[id]/route.ts",
  "hr/employees/route.ts",
  "hr/employees/[id]/route.ts"
] as const;

/** The permission each method must demand, keyed by route. */
const EXPECTED: Record<string, Partial<Record<(typeof HTTP_METHODS)[number], string>>> = {
  "appointments/queue/route.ts": {
    GET: PERMISSION_KEYS.APPOINTMENT_VIEW,
    POST: PERMISSION_KEYS.APPOINTMENT_UPDATE
  },
  "doctor/route.ts": {
    GET: PERMISSION_KEYS.DOCTOR_VIEW,
    POST: PERMISSION_KEYS.DOCTOR_CREATE
  },
  "department/route.ts": {
    GET: PERMISSION_KEYS.DEPARTMENT_VIEW,
    POST: PERMISSION_KEYS.DEPARTMENT_CREATE
  },
  "staff/route.ts": {
    GET: PERMISSION_KEYS.STAFF_VIEW,
    POST: PERMISSION_KEYS.STAFF_CREATE
  },
  "staff/[id]/route.ts": {
    GET: PERMISSION_KEYS.STAFF_VIEW,
    PUT: PERMISSION_KEYS.STAFF_UPDATE
  },
  "staff/directory/route.ts": {
    GET: PERMISSION_KEYS.STAFF_VIEW
  },
  "staff/schedule/route.ts": {
    GET: PERMISSION_KEYS.DOCTOR_VIEW,
    POST: PERMISSION_KEYS.STAFF_DEPT_MANAGE
  },
  "staff/schedule/[id]/route.ts": {
    GET: PERMISSION_KEYS.DOCTOR_VIEW,
    PUT: PERMISSION_KEYS.STAFF_DEPT_MANAGE
  },
  "staff/specializations/route.ts": {
    GET: PERMISSION_KEYS.DEPARTMENT_VIEW,
    POST: PERMISSION_KEYS.DEPARTMENT_CREATE
  },
  "staff/specializations/[id]/route.ts": {
    GET: PERMISSION_KEYS.DEPARTMENT_VIEW,
    PUT: PERMISSION_KEYS.DEPARTMENT_UPDATE
  },
  "hr/employees/route.ts": {
    GET: PERMISSION_KEYS.STAFF_VIEW,
    POST: PERMISSION_KEYS.STAFF_CREATE
  },
  "hr/employees/[id]/route.ts": {
    GET: PERMISSION_KEYS.STAFF_VIEW,
    PUT: PERMISSION_KEYS.STAFF_UPDATE
  }
};

/**
 * Maps a permission value back to the `PERMISSION_KEYS` constant names that
 * declare it. Expectations are written as permission values (the durable
 * contract) while the code references constants, so both sides are normalized
 * before comparison.
 */
const KEY_NAMES_BY_VALUE = new Map<string, string[]>();
for (const [key, value] of Object.entries(PERMISSION_KEYS)) {
  if (typeof value !== "string") continue;
  KEY_NAMES_BY_VALUE.set(value, [...(KEY_NAMES_BY_VALUE.get(value) ?? []), key]);
}

/** True when a source references the expected permission, by constant or literal. */
function demandsPermission(source: string, permission: string): boolean {
  if (source.includes(`"${permission}"`) || source.includes(`'${permission}'`)) return true;

  const names = KEY_NAMES_BY_VALUE.get(permission) ?? [];
  return names.some((name) => source.includes(`PERMISSION_KEYS.${name}`));
}

/** Reads a route file and asserts it exists. */
function readRoute(relativePath: string): string {  const absolute = path.join(API_ROOT, relativePath);
  assert.ok(fs.existsSync(absolute), `route ${relativePath} is missing at ${absolute}`);
  return fs.readFileSync(absolute, "utf8");
}

/** Returns the HTTP methods a route file exports. */
function exportedMethods(source: string): string[] {
  const methods = HTTP_METHODS.filter((method) =>
    new RegExp(`export\\s+(?:async\\s+)?function\\s+${method}\\b`).test(source) ||
    new RegExp(`export\\s+const\\s+${method}\\b`).test(source)
  );
  return methods;
}

/**
 * Extracts the body of a single exported handler.
 *
 * Brace matching is enough here because these handlers are top-level function
 * declarations; the scan simply tracks nesting depth from the opening brace.
 */
function handlerBody(source: string, method: string): string {
  const declaration = new RegExp(
    `export\\s+(?:async\\s+)?function\\s+${method}\\s*\\([^)]*\\)[^{]*\\{`,
    "m"
  ).exec(source);

  assert.ok(declaration, `${method} handler not found`);

  const start = declaration.index + declaration[0].length - 1;
  let depth = 0;

  for (let i = start; i < source.length; i++) {
    const char = source[i];
    if (char === "{") depth++;
    if (char === "}") {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }

  throw new Error(`unbalanced braces in ${method} handler`);
}

/** Reads a controller module from the src tree. */
function readController(modulePath: string): string {
  const absolute = path.join(process.cwd(), "src", modulePath);
  assert.ok(fs.existsSync(absolute), `controller ${modulePath} is missing at ${absolute}`);
  return fs.readFileSync(absolute, "utf8");
}

/** Extracts a class method body by name. */
function methodBody(source: string, method: string): string {
  const declaration = new RegExp(
    `(?:^|\\s)(?:static\\s+)?(?:async\\s+)?${method}\\s*\\([^)]*\\)[^{]*\\{`,
    "m"
  ).exec(source);
  assert.ok(declaration, `method ${method} not found`);

  const start = declaration.index + declaration[0].length - 1;
  let depth = 0;

  for (let i = start; i < source.length; i++) {
    const char = source[i];
    if (char === "{") depth++;
    if (char === "}") {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }

  throw new Error(`unbalanced braces in ${method}`);
}

/**
 * Resolves the source that must contain the guard for a given handler.
 *
 * Routes may be thin adapters that delegate to a controller, so the guard is
 * allowed to live one hop away. Following the delegation keeps the invariant
 * honest without banning that legitimate layering.
 */
function resolveGuardUnit(routePath: string, method: string): { label: string; body: string } {
  const routeSource = readRoute(routePath);
  const body = handlerBody(routeSource, method);

  if (body.includes("authorizeRequest")) {
    return { label: `${routePath} ${method}`, body };
  }

  const delegation = /(\w+)\.(\w+)\(request\)/.exec(body);
  assert.ok(delegation, `${routePath} ${method} neither guards nor delegates`);

  const controllerImport = new RegExp(`import\\s+${delegation[1]}\\s+from\\s+"@/([^"]+)"`).exec(
    routeSource
  );
  assert.ok(
    controllerImport,
    `${routePath} ${method} calls ${delegation[1]}.${delegation[2]} without a resolvable controller import`
  );

  const controllerSource = readController(`${controllerImport[1]}.ts`);
  return {
    label: `${controllerImport[1]}.${delegation[2]}()`,
    body: methodBody(controllerSource, delegation[2])
  };
}

async function run() {
  console.log("=================================================");
  console.log("  API Route Authorization Contract");
  console.log("=================================================\n");

  let passed = 0;
  let total = 0;

  function test(name: string, fn: () => void) {
    total++;
    try {
      fn();
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ ${name}`);
      console.error(err);
      throw err;
    }
  }

  for (const route of SECURED_ROUTES) {
    test(`${route}: every exported method is guarded`, () => {
      const methods = exportedMethods(readRoute(route));
      assert.ok(methods.length > 0, `${route} exports no HTTP methods`);

      for (const method of methods) {
        const unit = resolveGuardUnit(route, method);
        assert.ok(
          unit.body.includes("authorizeRequest"),
          `${unit.label} is unguarded - it must call authorizeRequest before touching data`
        );
        assert.ok(
          unit.body.includes("isAuthorized"),
          `${unit.label} must check isAuthorized and return the guard's 401/403 response`
        );
      }
    });

    test(`${route}: returns the guard response verbatim`, () => {
      // Re-throwing the guard's own response preserves the exact 401/403 body
      // (including the permission name) that the frontend surfaces to users.
      const source = readRoute(route);
      const delegated = source.includes("@/controllers/");
      if (delegated) return;

      assert.ok(
        /return\s+authResult\.response;/.test(source),
        `${route} must return authResult.response so status codes are not lost`
      );
    });

    test(`${route}: never chooses its own scope`, () => {
      const source = readRoute(route);

      assert.ok(
        !source.includes("ScopeResolver"),
        `${route} must not call ScopeResolver - the guard derives the immutable scope`
      );
    });

    test(`${route}: demands the expected permissions`, () => {
      const expected = EXPECTED[route];
      assert.ok(expected, `no expectation recorded for ${route}`);

      for (const [method, permission] of Object.entries(expected)) {
        const unit = resolveGuardUnit(route, method as string);
        assert.ok(
          demandsPermission(unit.body, permission),
          `${unit.label} must require ${permission}`
        );
      }
    });

    test(`${route}: guards reads before querying data`, () => {
      for (const method of exportedMethods(readRoute(route))) {
        const unit = resolveGuardUnit(route, method);
        const guardIndex = unit.body.indexOf("authorizeRequest");
        const findIndex = unit.body.search(/\b\w*(?:Doctor|Staff|Department|Employee)\w*\.(find|findById|findOne|aggregate|countDocuments)\w*\(/);

        if (findIndex !== -1) {
          assert.ok(
            guardIndex !== -1 && guardIndex < findIndex,
            `${unit.label} queries data before authorizing`
          );
        }
      }
    });
  }

  test("GET /api/doctor requires the roster read that 403'd for receptionists", () => {
    const unit = resolveGuardUnit("doctor/route.ts", "GET");
    assert.ok(
      demandsPermission(unit.body, PERMISSION_KEYS.DOCTOR_VIEW),
      `${unit.label} must require ${PERMISSION_KEYS.DOCTOR_VIEW}`
    );
  });

  test("GET /api/department requires the department read", () => {
    const unit = resolveGuardUnit("department/route.ts", "GET");
    assert.ok(
      demandsPermission(unit.body, PERMISSION_KEYS.DEPARTMENT_VIEW),
      `${unit.label} must require ${PERMISSION_KEYS.DEPARTMENT_VIEW}`
    );
  });

  test("appointment queue applies the guard-derived scope to reads and updates", () => {
    const source = readRoute("appointments/queue/route.ts");
    assert.ok(source.includes("buildScopedQuery(authResult.filter"));
    assert.ok(source.includes("findOneAndUpdate(scoped.query"));
  });

  test("the booking form needs two distinct permissions", () => {
    // The booking form loads doctors and departments in parallel; either one
    // returning 403 leaves the form unusable, so they must be separable grants.
    assert.notEqual(PERMISSION_KEYS.DOCTOR_VIEW, PERMISSION_KEYS.DEPARTMENT_VIEW);
  });

  console.log(`\n=================================================`);
  console.log(`  API Route Authorization Contract: ${passed}/${total} Passed`);
  console.log(`=================================================\n`);
}

run().catch((err: unknown) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
