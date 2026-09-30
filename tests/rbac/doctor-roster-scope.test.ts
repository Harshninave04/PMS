/**
 * Doctor roster authorization test suite.
 *
 * Regression cover for the reported defect: a receptionist received
 * 403 Forbidden on `GET /api/doctor`, so the booking form's doctor dropdown was
 * permanently empty. Two things had to hold for that to work:
 *
 *   1. the role must hold `doctor.doctor.view` (and `department.department.view`),
 *   2. the resulting BRANCH scope must actually match the seeded doctors, which
 *      required `User.branch` and `Doctor.branchId` to be populated - otherwise
 *      the scope resolver emits a deny-all sentinel.
 *
 * Usage: npx tsx tests/rbac/doctor-roster-scope.test.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { Types } from "mongoose";
import {
  DENY_ALL_OBJECT_ID,
  buildScopedQuery,
  documentMatchesScope,
  isDenyAllFilter
} from "@/lib/rbac/scope-filter";
import { ScopeResolver } from "@/lib/rbac/scope-resolver";
import type { AuthenticatedUserContext, IPermissionGrant } from "@/types/rbac";

const DENY_ALL = new Types.ObjectId(DENY_ALL_OBJECT_ID);

function grant(overrides: Partial<IPermissionGrant> = {}): IPermissionGrant {
  return {
    permission: "doctor.doctor.view",
    orgScope: "BRANCH",
    relScope: "UNRESTRICTED",
    ...overrides
  };
}

function context(overrides: Partial<AuthenticatedUserContext> = {}): AuthenticatedUserContext {
  return {
    userId: new Types.ObjectId(),
    email: "actor@medistra.hospital",
    name: "Actor",
    roleId: new Types.ObjectId(),
    roleName: "RECEPTIONIST",
    permissions: new Set(["doctor.doctor.view"]),
    grants: new Map(),
    assignedWardIds: [],
    ...overrides
  } as AuthenticatedUserContext;
}

async function run() {
  console.log("=================================================");
  console.log("  Doctor Roster Scope Test Suite");
  console.log("=================================================\n");

  let passed = 0;
  let total = 0;

  async function test(name: string, fn: () => void | Promise<void>) {
    total++;
    try {
      await fn();
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ ${name}`);
      console.error(err);
      throw err;
    }
  }

  // ---------------------------------------------------------------- deny-all

  await test("deny-all: the sentinel _id is detected", () => {
    assert.equal(isDenyAllFilter({ _id: DENY_ALL }), true);
  });

  await test("deny-all: detected inside an $and combinator", () => {
    assert.equal(isDenyAllFilter({ $and: [{ branchId: new Types.ObjectId() }, { _id: DENY_ALL }] }), true);
  });

  await test("deny-all: detected inside an $or combinator", () => {
    assert.equal(isDenyAllFilter({ $or: [{ organizationId: new Types.ObjectId() }, { _id: DENY_ALL }] }), true);
  });

  await test("deny-all: an ordinary filter is not a deny", () => {
    assert.equal(isDenyAllFilter({ branchId: new Types.ObjectId() }), false);
  });

  await test("deny-all: an $in list is not a deny", () => {
    // A caller may legitimately narrow a list down to a specific set of ids.
    assert.equal(isDenyAllFilter({ doctorId: { $in: [new Types.ObjectId(), DENY_ALL] } }), false);
  });

  await test("deny-all: empty and absent filters are not denials", () => {
    assert.equal(isDenyAllFilter({}), false);
    assert.equal(isDenyAllFilter(null), false);
    assert.equal(isDenyAllFilter(undefined), false);
  });

  // ------------------------------------------------------- buildScopedQuery

  await test("buildScopedQuery: short-circuits to denied rather than dropping the scope", () => {
    const result = buildScopedQuery({ _id: DENY_ALL });
    assert.equal(result.denied, true);
    assert.equal(result.query, null);
  });

  await test("buildScopedQuery: returns the scope alone when there is no caller query", () => {
    const branchId = new Types.ObjectId();
    const result = buildScopedQuery({ branchId });
    assert.equal(result.denied, false);
    assert.deepEqual(result.query, { branchId });
  });

  await test("buildScopedQuery: conjuncts the scope with the caller query", () => {
    const branchId = new Types.ObjectId();
    const departmentId = new Types.ObjectId();
    const result = buildScopedQuery({ branchId }, { departmentId });
    assert.equal(result.denied, false);
    assert.deepEqual(result.query, { $and: [{ branchId }, { departmentId }] });
  });

  await test("buildScopedQuery: returns the caller query alone for an unrestricted scope", () => {
    const departmentId = new Types.ObjectId();
    const result = buildScopedQuery({}, { departmentId });
    assert.equal(result.denied, false);
    assert.deepEqual(result.query, { departmentId });
  });

  // ------------------------------------------------- receptionist behaviour

  const branchId = new Types.ObjectId();
  const otherBranchId = new Types.ObjectId();
  const organizationId = new Types.ObjectId();

  await test("BRANCH scope without a campus yields the deny-all sentinel", () => {
    const filter = ScopeResolver.resolve(grant(), context({ branchId: undefined }), "Doctor");
    assert.equal(isDenyAllFilter(filter), true);
  });

  await test("BRANCH scope matches on branchId for a roster read", () => {
    const filter = ScopeResolver.resolve(grant(), context({ branchId, organizationId }), "Doctor");
    assert.equal(isDenyAllFilter(filter), false);
    assert.deepEqual(filter, { branchId });
  });

  await test("BRANCH scope keeps a receptionist inside their own campus", async () => {
    const filter = ScopeResolver.resolve(grant(), context({ branchId, organizationId }), "Doctor");

    assert.equal(
      await documentMatchesScope({ _id: new Types.ObjectId(), branchId, organizationId }, filter),
      true
    );
    assert.equal(
      await documentMatchesScope({ _id: new Types.ObjectId(), branchId: otherBranchId, organizationId }, filter),
      false
    );
    // A doctor profile with no branch is invisible to a scoped reader.
    assert.equal(await documentMatchesScope({ _id: new Types.ObjectId(), organizationId }, filter), false);
  });

  await test("BRANCH scope does not degrade into a match-everything read", async () => {
    // This is the exact failure mode behind the empty dropdown: an unassigned
    // branch must produce zero rows, not every row.
    const filter = ScopeResolver.resolve(grant(), context({ branchId: undefined }), "Doctor");
    const anyDoctor = { _id: new Types.ObjectId(), branchId: new Types.ObjectId() };

    assert.equal(await documentMatchesScope(anyDoctor, filter), false);
    assert.equal(buildScopedQuery(filter).denied, true);
  });

  await test("ORGANIZATION scope spans every campus in the organization", async () => {
    const filter = ScopeResolver.resolve(
      grant({ orgScope: "ORGANIZATION" }),
      context({ organizationId, branchId }),
      "Doctor"
    );

    assert.equal(
      await documentMatchesScope({ _id: new Types.ObjectId(), branchId, organizationId }, filter),
      true
    );
    assert.equal(
      await documentMatchesScope(
        { _id: new Types.ObjectId(), branchId: otherBranchId, organizationId },
        filter
      ),
      true
    );
    assert.equal(
      await documentMatchesScope(
        { _id: new Types.ObjectId(), branchId: otherBranchId, organizationId: new Types.ObjectId() },
        filter
      ),
      false
    );
  });

  await test("SYSTEM_SUPER_ADMIN short-circuits to GLOBAL scope", () => {
    const filter = ScopeResolver.resolve(
      grant(),
      context({ roleName: "SYSTEM_SUPER_ADMIN", branchId: undefined }),
      "Doctor"
    );
    assert.deepEqual(filter, {});
  });

  await test("DEPARTMENT scope without a department yields deny-all", () => {
    const filter = ScopeResolver.resolve(
      grant({ orgScope: "DEPARTMENT" }),
      context({ branchId, departmentId: undefined }),
      "Doctor"
    );
    assert.equal(isDenyAllFilter(filter), true);
  });

  // ----------------------------------------------------------- seed matrix

  const seedSource = fs.readFileSync(path.join(process.cwd(), "src", "seed.ts"), "utf8");

  /** Collects the permission strings declared inside a shared access group. */
  function permissionsInGroup(groupName: string, seen = new Set<string>()): Set<string> {
    const permissions = new Set<string>();
    if (seen.has(groupName)) return permissions;
    seen.add(groupName);

    // An access group is an array literal...
    const arrayBody = seedSource.match(new RegExp(`const ${groupName} = \\[([\\s\\S]*?)\\n\\];`))?.[1];
    // ...while a reusable grant (DOCTOR_ROSTER_READ) is an object literal.
    const objectBody = seedSource.match(new RegExp(`const ${groupName} = \\{([\\s\\S]*?)\\n\\};`))?.[1];
    const body = arrayBody ?? objectBody;
    if (!body) return permissions;

    for (const match of body.matchAll(/"([a-z-]+\.[a-z]+\.[a-z]+)"/g)) {
      permissions.add(match[1]);
    }

    // Groups reference other constants both by spread (...LAB_TECHNICIAN_ACCESS)
    // and bare (DOCTOR_ROSTER_READ), so follow every uppercase identifier that
    // resolves to a known grant/array constant.
    for (const nested of body.matchAll(/\.\.\.([A-Z][A-Z_0-9]*)/g)) {
      for (const inherited of permissionsInGroup(nested[1], seen)) {
        permissions.add(inherited);
      }
    }
    for (const referenced of body.matchAll(/(^|[\s,\[])([A-Z][A-Z_0-9]{2,})/g)) {
      for (const inherited of permissionsInGroup(referenced[2], seen)) {
        permissions.add(inherited);
      }
    }

    return permissions;
  }

  /** Resolves the full permission set a role is seeded with. */
  function seededPermissionsFor(roleName: string): Set<string> {
    const roleLine = seedSource.split("\n").find((line) => line.includes(`role: "${roleName}"`));
    assert.ok(roleLine, `role ${roleName} is not defined in src/seed.ts`);

    const accessExpression = roleLine.slice(roleLine.indexOf("access:") + "access:".length);
    const permissions = new Set<string>();

    // Inline module literals on the role line.
    for (const match of accessExpression.matchAll(/permissions:\s*\[([^\]]*)\]/g)) {
      for (const perm of match[1].matchAll(/"([a-z-]+\.[a-z]+\.[a-z]+)"/g)) {
        permissions.add(perm[1]);
      }
    }

    // Referenced shared access groups and reusable grant constants.
    for (const groupName of accessExpression.matchAll(/(^|[\s,{\[])([A-Z][A-Z_0-9]{2,})/g)) {
      for (const inherited of permissionsInGroup(groupName[2])) {
        permissions.add(inherited);
      }
    }

    return permissions;
  }

  const ROSTER_ROLES = [
    "RECEPTIONIST",
    "FRONT_DESK_MANAGER",
    "DOCTOR",
    "CONSULTANT",
    "NURSE",
    "NURSE_MANAGER",
    "LAB_TECHNICIAN",
    "LAB_SUPERVISOR",
    "RADIOLOGY_TECHNICIAN",
    "RADIOLOGIST",
    "EMERGENCY_DOCTOR",
    "EMERGENCY_NURSE",
    "OT_NURSE",
    "BRANCH_MANAGER",
    "HOSPITAL_ADMIN",
    "ORGANIZATION_ADMIN"
  ];

  for (const role of ROSTER_ROLES) {
    await test(`seed grants ${role} the doctor roster read`, () => {
      assert.ok(
        seededPermissionsFor(role).has("doctor.doctor.view"),
        `${role} must hold doctor.doctor.view or the doctor dropdown returns 403`
      );
    });

    await test(`seed grants ${role} the department reference read`, () => {
      assert.ok(
        seededPermissionsFor(role).has("department.department.view"),
        `${role} must hold department.department.view to book against a department`
      );
    });
  }

  await test("seed grants the admin and HR roles the staff dossier permissions", () => {
    for (const role of ["BRANCH_MANAGER", "HOSPITAL_ADMIN", "ORGANIZATION_ADMIN", "HR_OFFICER", "HR_MANAGER"]) {
      assert.ok(
        seededPermissionsFor(role).has("staff.staff.view"),
        `${role} must hold staff.staff.view`
      );
    }
  });

  await test("a receptionist cannot register or delete doctors", () => {
    const permissions = seededPermissionsFor("RECEPTIONIST");
    assert.equal(permissions.has("doctor.doctor.create"), false);
    assert.equal(permissions.has("doctor.doctor.delete"), false);
  });

  await test("a receptionist cannot read the staff or HR dossiers", () => {
    const permissions = seededPermissionsFor("RECEPTIONIST");
    assert.equal(permissions.has("staff.staff.view"), false);
    assert.equal(permissions.has("staff.staff.create"), false);
  });

  await test("a receptionist cannot administer departments", () => {
    const permissions = seededPermissionsFor("RECEPTIONIST");
    assert.equal(permissions.has("department.department.update"), false);
    assert.equal(permissions.has("department.department.delete"), false);
  });

  await test("seed binds a campus to every user it creates", () => {
    // Without these, BRANCH-scoped roles resolve to deny-all everywhere and the
    // doctor dropdown silently renders empty.
    const organizationBindings = seedSource.match(/^\s*organization:\s*\S+/gm) ?? [];
    const branchBindings = seedSource.match(/^\s*branch:\s*\S+/gm) ?? [];

    assert.ok(organizationBindings.length >= 2, "sample staff and demo logins must both bind an organization");
    assert.ok(branchBindings.length >= 2, "sample staff and demo logins must both bind a branch");
    assert.ok(
      seedSource.includes("branchForRole(roleName)"),
      "demo logins must resolve a real campus id"
    );
  });

  await test("seed backfills tenant scope onto profiles it creates", () => {
    // Sample staff and doctor profiles are written before the campus helpers
    // exist, so the backfill pass is what makes their rows visible.
    assert.ok(
      seedSource.includes("backfillProfileBranchScope()"),
      "seed must backfill profile tenant scope at the end of the run"
    );
  });

  await test("seed creates the satellite campuses before the branch helpers use them", () => {
    const satelliteIndex = seedSource.indexOf("5.1 Seed Satellite Campuses");
    const helperIndex = seedSource.indexOf("const branchForRole");
    assert.ok(satelliteIndex > 0, "seed must create the satellite campuses");
    assert.ok(helperIndex > 0, "seed must define branchForRole");
    assert.ok(
      satelliteIndex < helperIndex,
      "campuses must exist before branchForRole resolves a real campus id"
    );
  });

  await test("the Doctor and Staff models carry tenant fields", () => {
    const doctorModel = fs.readFileSync(path.join(process.cwd(), "src", "models", "doctor.model.ts"), "utf8");
    const staffModel = fs.readFileSync(path.join(process.cwd(), "src", "models", "staff.model.ts"), "utf8");

    for (const [name, source] of [["doctor", doctorModel], ["staff", staffModel]] as const) {
      assert.ok(source.includes("organizationId"), `${name} model must declare organizationId`);
      assert.ok(source.includes("branchId"), `${name} model must declare branchId`);
    }
  });

  console.log(`\n=================================================`);
  console.log(`  Doctor Roster Scope Results: ${passed}/${total} Passed`);
  console.log(`=================================================\n`);
}

run().catch((err: unknown) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
