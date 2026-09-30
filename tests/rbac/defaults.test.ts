import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  DEFAULT_ROLE_DEFINITIONS,
  DEFAULT_ROLE_HIERARCHY,
  buildRoleAccess
} from "@/lib/rbac/default-roles";
import { listRoleProfileAssignments } from "@/lib/rbac/dashboard-profiles";
import { PERMISSION_KEYS } from "@/types/rbac";

/**
 * The auto-bootstrap in src/lib/bootstrap/ensure-defaults.ts and the
 * destructive `npm run seed` path maintain two role catalogs. These tests keep
 * them honest so an account provisioned through the UI always resolves to a
 * real role with a real dashboard.
 */

const KNOWN_PERMISSIONS = new Set<string>(Object.values(PERMISSION_KEYS));

function readSeedRoleNames(): string[] {
  const seedContent = fs.readFileSync(path.resolve(process.cwd(), "src/seed.ts"), "utf-8");
  const start = seedContent.indexOf("const roleDefinitions = [");
  const end = seedContent.indexOf("\n];", start);
  assert.ok(start > -1 && end > start, "Could not locate roleDefinitions in src/seed.ts");
  const block = seedContent.slice(start, end);
  return Array.from(block.matchAll(/\{\s*role:\s*"([A-Z_]+)"/g)).map((m) => m[1]);
}

async function runDefaultRoleTests() {
  console.log("\n=================================================");
  console.log("  Default Role Bootstrap Tests");
  console.log("=================================================\n");

  let totalTests = 0;
  let passedTests = 0;
  const test = (name: string, fn: () => void | Promise<void>) => {
    totalTests += 1;
    return Promise.resolve(fn()).then(
      () => {
        passedTests += 1;
        console.log(`  PASS  ${name}`);
      },
      (err: unknown) => {
        console.error(`  FAIL  ${name}`);
        throw err;
      }
    );
  };

  await test("seeds 39 default roles with no duplicates", () => {
    const names = DEFAULT_ROLE_DEFINITIONS.map((d) => d.role);
    assert.equal(names.length, 39, `Expected 39 default roles, found ${names.length}`);
    assert.equal(new Set(names).size, names.length, "Duplicate role name in default catalog");
  });

  await test("bootstrap catalog matches the npm run seed catalog", () => {
    const seedNames = readSeedRoleNames();
    const bootstrapNames = DEFAULT_ROLE_DEFINITIONS.map((d) => d.role);
    assert.deepEqual(
      [...bootstrapNames].sort(),
      [...seedNames].sort(),
      "src/lib/rbac/default-roles.ts and src/seed.ts define different roles"
    );
  });

  await test("every default role resolves to a dashboard profile", () => {
    const mapped = new Set(listRoleProfileAssignments().map((a) => a.role));
    const unmapped = DEFAULT_ROLE_DEFINITIONS.map((d) => d.role).filter((r) => !mapped.has(r));
    assert.deepEqual(unmapped, [], "Default roles with no dashboard profile mapping");
  });

  await test("every default role gets a usable, non-empty access list", () => {
    for (const definition of DEFAULT_ROLE_DEFINITIONS) {
      const access = buildRoleAccess(definition.role, definition.access);
      assert.ok(access.length > 0, `${definition.role} has no access entries`);

      const modules = access.map((a) => a.moduleName);
      assert.ok(modules.includes("dashboard"), `${definition.role} cannot view its dashboard`);

      for (const entry of access) {
        assert.ok(entry.permissions.length > 0, `${definition.role}/${entry.moduleName} grants nothing`);
        for (const perm of entry.permissions) {
          assert.ok(
            KNOWN_PERMISSIONS.has(perm),
            `${definition.role}/${entry.moduleName} uses unknown permission "${perm}"`
          );
        }
      }
    }
  });

  await test("every permission carries an explicit org and rel scope grant", () => {
    for (const definition of DEFAULT_ROLE_DEFINITIONS) {
      for (const entry of buildRoleAccess(definition.role, definition.access)) {
        assert.equal(entry.grants?.length, entry.permissions.length, `${definition.role}/${entry.moduleName} grant mismatch`);
        for (const grant of entry.grants ?? []) {
          assert.ok(["GLOBAL", "ORGANIZATION", "BRANCH", "DEPARTMENT", "WARD"].includes(grant.orgScope));
          assert.ok(["UNRESTRICTED", "ASSIGNED", "OWN"].includes(grant.relScope));
        }
      }
    }
  });

  await test("SYSTEM_IT_ADMIN can create and assign users", () => {
    const itAdmin = DEFAULT_ROLE_DEFINITIONS.find((d) => d.role === "SYSTEM_IT_ADMIN");
    assert.ok(itAdmin, "SYSTEM_IT_ADMIN missing from the default catalog");

    const granted = new Set(itAdmin.access.flatMap((a) => a.permissions));
    for (const required of [
      PERMISSION_KEYS.USER_VIEW,
      PERMISSION_KEYS.USER_CREATE,
      PERMISSION_KEYS.USER_UPDATE,
      PERMISSION_KEYS.USER_DISABLE,
      PERMISSION_KEYS.ROLE_VIEW,
      PERMISSION_KEYS.ROLE_CREATE,
      PERMISSION_KEYS.ROLE_UPDATE,
      PERMISSION_KEYS.ROLE_ASSIGN
    ]) {
      assert.ok(granted.has(required), `SYSTEM_IT_ADMIN is missing ${required}`);
    }
  });

  await test("SYSTEM_IT_ADMIN cannot outrank SYSTEM_SUPER_ADMIN", () => {
    const itAdmin = DEFAULT_ROLE_DEFINITIONS.find((d) => d.role === "SYSTEM_IT_ADMIN");
    const superAdmin = DEFAULT_ROLE_DEFINITIONS.find((d) => d.role === "SYSTEM_SUPER_ADMIN");
    const itAdminGrants = new Set(itAdmin!.access.flatMap((a) => a.permissions));
    const superAdminGrants = new Set(superAdmin!.access.flatMap((a) => a.permissions));

    assert.ok(!itAdminGrants.has(PERMISSION_KEYS.ROLE_DELETE), "IT admin must not be able to delete roles");
    assert.ok(!itAdminGrants.has(PERMISSION_KEYS.ORGANIZATION_DELETE), "IT admin must not delete organizations");
    assert.ok(!itAdminGrants.has(PERMISSION_KEYS.PATIENT_VIEW), "IT admin must not reach clinical data");

    const extra = [...itAdminGrants].filter((p) => !superAdminGrants.has(p));
    assert.deepEqual(extra, [], "IT admin holds permissions the super admin lacks");
  });

  await test("default hierarchy only references roles that exist", () => {
    const names = new Set(DEFAULT_ROLE_DEFINITIONS.map((d) => d.role));
    for (const link of DEFAULT_ROLE_HIERARCHY) {
      assert.ok(names.has(link.parent), `Unknown parent role: ${link.parent}`);
      assert.ok(names.has(link.target), `Unknown target role: ${link.target}`);
      assert.notEqual(link.parent, link.target, `Self-referencing hierarchy: ${link.parent}`);
    }
  });

  console.log(`\n=================================================`);
  console.log(`  Default Role Bootstrap: ${passedTests}/${totalTests} Passed`);
  console.log(`=================================================\n`);
}

runDefaultRoleTests().catch((err: unknown) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
