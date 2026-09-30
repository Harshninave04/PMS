/**
 * Frontend error-surfacing contract.
 *
 * The reported symptom was half backend, half frontend: receptionists saw an
 * empty doctor dropdown with no explanation. A 401/403 must surface as a
 * visible, specific message - never as a silently empty list.
 *
 * These tests are static (no DOM, no bundler) so they can gate every commit.
 * They assert that pages which read protected reference data route their loads
 * through `apiFetch`, keep the rejection reason in state, and render it, and
 * that no page swallows the failure with an empty-array catch.
 *
 * Usage: npx tsx tests/rbac/frontend-error-surfacing.test.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP_ROOT = path.join(process.cwd(), "src", "app");

/**
 * Pages that load protected reference data (doctors, departments, staff) and
 * therefore must be able to explain an authorization failure.
 */
const PAGES = [
  "(dashboard)/clinical/dashboard/page.tsx",
  "(dashboard)/nursing/dashboard/page.tsx",
  "(dashboard)/appointments/book/page.tsx",
  "(dashboard)/appointments/list/page.tsx",
  "(dashboard)/appointments/calendar/page.tsx",
  "(dashboard)/appointments/queue/page.tsx",
  "(dashboard)/appointments/reschedule/page.tsx",
  "(dashboard)/appointments/schedule/page.tsx",
  "(dashboard)/lab/orders/page.tsx",
  "(dashboard)/radiology/orders/page.tsx",
  "(dashboard)/staff/page.tsx",
  "(dashboard)/staff/list/page.tsx",
  "(dashboard)/staff/schedule/page.tsx",
  "(dashboard)/staff/doctors/page.tsx",
  "(dashboard)/staff/directory/page.tsx",
  "(dashboard)/staff/departments/page.tsx",
  "(dashboard)/staff/specializations/page.tsx",
  "(dashboard)/hr/employees/page.tsx"
];

function readPage(relativePath: string): string {
  const absolute = path.join(APP_ROOT, relativePath);
  assert.ok(fs.existsSync(absolute), `page ${relativePath} is missing at ${absolute}`);
  return fs.readFileSync(absolute, "utf8");
}

/** The protected endpoints a page must not fetch without error handling. */
const PROTECTED_ENDPOINTS = [
  "/api/doctor",
  "/api/department",
  "/api/staff",
  "/api/hr/employees",
  "/api/clinical/",
  "/api/nursing/",
  "/api/appointments/queue"
];

/**
 * Pages that read protected reference data but have not been converted to
 * `apiFetch` yet. Listed explicitly so the remaining gap stays visible and
 * anyone who converts one is prompted to move it into PAGES above.
 */
const NOT_YET_CONVERTED = [
  "(dashboard)/hr/attendance/page.tsx",
  "(dashboard)/hr/documents/page.tsx",
  "(dashboard)/hr/leave/page.tsx",
  "(dashboard)/hr/profiles/page.tsx",
  "(dashboard)/hr/shifts/page.tsx",
  "(dashboard)/organization/departments/page.tsx"
];

/**
 * Extracts every `fetch(...)` call expression from a source file.
 *
 * Balanced-paren scanning keeps the analysis honest about which calls are reads
 * and which are mutations: a POST to `/api/staff` shares its URL with the GET
 * but does not share its error-handling requirements.
 */
function extractFetchCalls(source: string): string[] {
  const calls: string[] = [];
  const pattern = /\bfetch\s*\(/g;

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    const open = match.index + match[0].length - 1;
    let depth = 0;

    for (let i = open; i < source.length; i++) {
      const char = source[i];
      if (char === "(") depth++;
      if (char === ")") {
        depth--;
        if (depth === 0) {
          calls.push(source.slice(open, i + 1));
          pattern.lastIndex = i + 1;
          break;
        }
      }
    }
  }

  return calls;
}

/** True when the call performs a read (no explicit non-GET method). */
function isReadCall(call: string): boolean {
  const method = /method\s*:\s*["'`]([A-Za-z]+)["'`]/i.exec(call);
  return !method || method[1].toUpperCase() === "GET";
}

/** Protected collection endpoints that are read with a bare raw fetch. */
function readsProtectedDataWithRawFetch(source: string): string[] {
  const offenders = new Set<string>();

  for (const call of extractFetchCalls(source)) {
    if (!isReadCall(call)) continue;

    for (const endpoint of PROTECTED_ENDPOINTS) {
      if (call.includes(`"${endpoint}"`) || call.includes(`'${endpoint}'`) || call.includes(`\`${endpoint}\``)) {
        offenders.add(endpoint);
      }
    }
  }

  return [...offenders];
}

async function run() {
  console.log("=================================================");
  console.log("  Frontend Error Surfacing Contract");
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

  for (const page of PAGES) {
    const source = readPage(page);
    const touchesProtectedData = PROTECTED_ENDPOINTS.some((endpoint) => source.includes(endpoint));

    if (!touchesProtectedData) continue;

    test(`${page}: loads protected data through apiFetch`, () => {
      const offenders = readsProtectedDataWithRawFetch(source);
      assert.deepEqual(
        offenders,
        [],
        `${page} calls raw fetch for ${offenders.join(", ")}; use apiFetch so 401/403 are typed`
      );
      assert.ok(
        source.includes("apiFetch"),
        `${page} reads protected data but never imports apiFetch`
      );
    });

    test(`${page}: never swallows a failure into an empty list`, () => {
      // The original defect: catch(() => []) renders an empty dropdown, which
      // is indistinguishable from "no doctors exist".
      assert.ok(
        !/\.catch\(\s*\(\s*\)\s*=>\s*(\[\]|\{\})/.test(source),
        `${page} swallows a load failure into an empty array or object`
      );
      assert.ok(
        !/catch\s*\(\s*\w*\s*\)\s*\{\s*\}/.test(source),
        `${page} has an empty catch block that hides authorization errors`
      );
    });

    test(`${page}: renders a visible error state`, () => {
      assert.ok(
        source.includes("ApiErrorNotice") || source.includes("ApiErrorEmptyState"),
        `${page} loads protected data but renders no error notice`
      );
      assert.ok(
        /import\s+\{[^}]*ApiError[^}]*\}\s+from\s+"@\/components\/ui\/permission-state"/.test(source),
        `${page} must import the shared error surface from @/components/ui/permission-state`
      );
    });

    test(`${page}: does not mutate role data at render time`, () => {
      // Guarding the UI on a permission constant is fine; fabricating a
      // doctor list to keep the dropdown populated is not.
      assert.ok(
        !/setDoctors\(\s*\[\s*\{/.test(source) && !/const\s+fallbackDoctors\s*=/.test(source),
        `${page} injects hardcoded doctors instead of surfacing the authorization failure`
      );
    });
  }

  test("the shared error surface explains 401 and 403 distinctly", () => {
    const notice = fs.readFileSync(
      path.join(process.cwd(), "src", "components", "ui", "permission-state.tsx"),
      "utf8"
    );
    assert.ok(
      notice.includes('"unauthenticated"'),
      "the surface must branch on the unauthenticated discriminator"
    );
    assert.ok(notice.includes('"forbidden"'), "the surface must branch on the forbidden discriminator");
    assert.ok(notice.includes("LogIn"), "401 must offer a sign-in affordance");
    assert.ok(notice.includes("role=\"alert\""), "the notice must be announced to assistive tech");
  });

  test("a forbidden response tells the user how to resolve it", () => {
    const notice = fs.readFileSync(
      path.join(process.cwd(), "src", "components", "ui", "permission-state.tsx"),
      "utf8"
    );
    assert.ok(
      /administrator|permission/i.test(notice),
      "a 403 must explain that an administrator can grant the missing permission"
    );
  });

  test("the api client distinguishes auth failures from other errors", () => {
    const client = fs.readFileSync(path.join(process.cwd(), "src", "lib", "api-client.ts"), "utf8");
    assert.ok(client.includes("ApiError"), "apiFetch must reject with a typed ApiError");
    assert.ok(client.includes("401"), "apiFetch must classify 401 separately");
    assert.ok(client.includes("403"), "apiFetch must classify 403 separately");
  });

  test("the booking form reports the doctor and department loads independently", () => {
    // Both lists load in parallel, so one 403 must not hide the other.
    const booking = readPage("(dashboard)/appointments/book/page.tsx");
    assert.ok(booking.includes("doctorError"), "booking must track a doctor load failure");
    assert.ok(booking.includes("departmentError"), "booking must track a department load failure");
    assert.ok(booking.includes("Promise.allSettled"), "parallel loads must settle independently");
  });

  test("the remaining unconverted pages are still on record", () => {
    // This test fails the moment someone fixes one of these, which is the
    // intended signal to promote it into PAGES and give it full coverage.
    const unconverted = NOT_YET_CONVERTED.filter((page) => {
      const source = readPage(page);
      return readsProtectedDataWithRawFetch(source).length > 0;
    });

    assert.deepEqual(
      unconverted,
      NOT_YET_CONVERTED,
      `these pages now use apiFetch - promote them into PAGES:\n  ${unconverted.join("\n  ")}`
    );
  });

  test("write handlers are out of scope but still surface failures", () => {
    // Mutation paths use template-literal URLs; confirm at least the booking
    // form reports them rather than silently ignoring the response.
    const booking = readPage("(dashboard)/appointments/book/page.tsx");
    assert.ok(booking.includes("toast"), "booking mutations must report failures via toast");
  });

  console.log(`\n=================================================`);
  console.log(`  Frontend Error Surfacing: ${passed}/${total} Passed`);
  console.log(`=================================================\n`);
}

run().catch((err: unknown) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
