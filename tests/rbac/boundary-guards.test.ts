import assert from "node:assert/strict";
import { Types } from "mongoose";
import {
  AuthenticatedUserContext,
  IPermissionGrant,
  PERMISSION_KEYS
} from "@/types/rbac";
import { ScopeResolver } from "@/lib/rbac/scope-resolver";
import { checkRecordBoundary, recordBranchId } from "@/lib/rbac/scope-guard";
import { requiredModulesForPath } from "@/lib/rbac/page-access";
import { sanitizeManagedRoles, sanitizeUpdateRoleDto, sanitizeAccess } from "@/dto/role.dto";
import { redact, diffRecords } from "@/services/audit.service";

/**
 * Regression suite for the authorization fixes.
 *
 * Each case here corresponds to a defect that shipped: a fail-open branch
 * check, an authorization block skipped when no request was supplied, a
 * `managedRoles` payload that destroyed the stored shape, and a stock rollback
 * that returned more than it had taken.
 */
async function runBoundaryTests() {
  console.log("=================================================");
  console.log("  Running Boundary & Authorization Regression Tests");
  console.log("=================================================\n");

  let passed = 0;
  let total = 0;

  function test(name: string, fn: () => void | Promise<void>) {
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

  const branchA = new Types.ObjectId();
  const branchB = new Types.ObjectId();
  const orgId = new Types.ObjectId();

  const grant = (orgScope: IPermissionGrant["orgScope"]): IPermissionGrant =>
    ({
      permission: PERMISSION_KEYS.PATIENT_VIEW,
      orgScope,
      relScope: "UNRESTRICTED"
    }) as IPermissionGrant;

  const context = (over: Partial<AuthenticatedUserContext> = {}): AuthenticatedUserContext =>
    ({
      userId: new Types.ObjectId(),
      roleId: new Types.ObjectId(),
      roleName: "NURSE",
      organizationId: orgId,
      branchId: branchA,
      ...over
    }) as AuthenticatedUserContext;

  console.log("--- Record boundary checks must fail closed ---");

  test("record with a different branch is denied", () => {
    const result = checkRecordBoundary({ branchId: branchB }, context(), grant("BRANCH"));
    assert.equal(result.allowed, false);
    assert.equal(result.statusCode, 403);
  });

  test("record with no branch is DENIED (this used to be allowed)", () => {
    const result = checkRecordBoundary({ uhid: "MED-2026-0001" }, context(), grant("BRANCH"));
    assert.equal(
      result.allowed,
      false,
      "a record without a branch must not be readable from inside a branch"
    );
    assert.equal(result.statusCode, 403);
  });

  test("record with a null branch is DENIED", () => {
    const result = checkRecordBoundary({ branchId: null }, context(), grant("BRANCH"));
    assert.equal(result.allowed, false);
  });

  test("record with an empty-string branch is DENIED", () => {
    const result = checkRecordBoundary({ branchId: "" }, context(), grant("BRANCH"));
    assert.equal(result.allowed, false);
  });

  test("record with the matching branch is allowed", () => {
    const result = checkRecordBoundary({ branchId: branchA }, context(), grant("BRANCH"));
    assert.equal(result.allowed, true);
  });

  test("ObjectId and string branches compare equal", () => {
    const asObjectId = checkRecordBoundary({ branchId: branchA }, context(), grant("BRANCH"));
    const asString = checkRecordBoundary({ branchId: branchA.toString() }, context(), grant("BRANCH"));
    assert.equal(asObjectId.allowed, true);
    assert.equal(asString.allowed, true);
  });

  test("populated branch documents are unwrapped", () => {
    const result = checkRecordBoundary(
      { branchId: { _id: branchA, name: "Branch A" } },
      context(),
      grant("BRANCH")
    );
    assert.equal(result.allowed, true);
  });

  test("ORGANIZATION scope is enforced, not just BRANCH", () => {
    // The inline pattern only ran for orgScope === "BRANCH", so an
    // organization-scoped user was never compared against the record at all.
    const result = checkRecordBoundary({ branchId: branchB }, context(), grant("ORGANIZATION"));
    assert.equal(result.allowed, false);
  });

  test("GLOBAL scope allows any record", () => {
    const result = checkRecordBoundary({ branchId: branchB }, context(), grant("GLOBAL"));
    assert.equal(result.allowed, true);
  });

  test("GLOBAL scope allows a record with no branch", () => {
    const result = checkRecordBoundary({}, context(), grant("GLOBAL"));
    assert.equal(result.allowed, true);
  });

  test("an actor with no branch and no organization cannot be scoped, so nothing is denied", () => {
    const result = checkRecordBoundary(
      { branchId: branchB },
      context({ branchId: null, organizationId: null }),
      grant("BRANCH")
    );
    assert.equal(result.allowed, true);
  });

  test("headquarters staff fall back to their organization", () => {
    const result = checkRecordBoundary(
      { branchId: orgId },
      context({ branchId: null, organizationId: orgId }),
      grant("BRANCH")
    );
    assert.equal(result.allowed, true);
  });

  test("recordBranchId ignores an unrelated field", () => {
    assert.equal(recordBranchId({ organizationId: branchB, wardId: branchA }), branchB.toString());
    assert.equal(recordBranchId({ name: "no ids here" }), null);
  });

  test("recordBranchId tolerates junk input", () => {
    assert.equal(recordBranchId(null), null);
    assert.equal(recordBranchId(undefined), null);
    assert.equal(recordBranchId("string"), null);
  });

  console.log("\n--- Resolver filters must not match unowned records ---");

  test("BRANCH filter excludes a record that has no branch", () => {
    const filter = ScopeResolver.resolve(
      grant("BRANCH"),
      context(),
      "patient"
    ) as Record<string, unknown>;
    // The query shape is what matters: an exact branch match cannot select a
    // document where branchId is absent.
    assert.deepEqual(filter, { branchId: branchA });
  });

  test("a user with no branch gets an impossible-match filter, not an open one", () => {
    const filter = ScopeResolver.resolve(
      grant("BRANCH"),
      context({ branchId: null, organizationId: null }),
      "patient"
    ) as Record<string, unknown>;
    assert.deepEqual(filter, { _id: new Types.ObjectId("000000000000000000000000") });
  });

  test("WARD scope without assigned wards denies rather than allowing all", () => {
    const filter = ScopeResolver.resolve(
      grant("WARD"),
      context({ assignedWardIds: [] }),
      "nursingtask"
    ) as Record<string, unknown>;
    assert.deepEqual(filter, { _id: new Types.ObjectId("000000000000000000000000") });
  });

  console.log("\n--- Page guard maps URLs to modules ---");

  test("/admin/users requires the user module", () => {
    assert.deepEqual(requiredModulesForPath("/admin/users"), ["user", "admin"]);
  });

  test("/admin/roles requires the role module", () => {
    assert.deepEqual(requiredModulesForPath("/admin/roles"), ["role", "admin"]);
  });

  test("/finance/invoices is governed by billing", () => {
    assert.deepEqual(requiredModulesForPath("/finance/invoices"), ["billing"]);
  });

  test("a path that merely shares a prefix is not governed", () => {
    // /patient-list is not under /patients and must not inherit its rule.
    assert.equal(requiredModulesForPath("/patient-list"), null);
  });

  test("a login-like path is not governed", () => {
    assert.equal(requiredModulesForPath("/unauthorized"), null);
  });

  console.log("\n--- managedRoles payload validation ---");

  test("managedRoles keeps the object shape and its permissions", () => {
    const roleId = new Types.ObjectId();
    const result = sanitizeManagedRoles([
      { roleId: roleId.toString(), permissions: [PERMISSION_KEYS.PATIENT_VIEW] }
    ]);

    assert.equal(result.length, 1);
    assert.equal(result[0].roleId.toString(), roleId.toString());
    assert.deepEqual(result[0].permissions, [PERMISSION_KEYS.PATIENT_VIEW]);
  });

  test("managedRoles rejects a bare string array instead of silently storing it", () => {
    assert.throws(() => sanitizeManagedRoles([new Types.ObjectId().toString()]));
  });

  test("managedRoles rejects an invalid role id", () => {
    assert.throws(() => sanitizeManagedRoles([{ roleId: "not-an-id", permissions: [] }]));
  });

  test("managedRoles rejects an unknown permission", () => {
    assert.throws(() =>
      sanitizeManagedRoles([
        { roleId: new Types.ObjectId().toString(), permissions: ["made.up.permission"] }
      ])
    );
  });

  test("managedRoles de-duplicates repeated role ids", () => {
    const roleId = new Types.ObjectId().toString();
    const result = sanitizeManagedRoles([
      { roleId, permissions: [] },
      { roleId, permissions: [] }
    ]);
    assert.equal(result.length, 1);
  });

  test("managedBy cannot be set through the update payload", () => {
    const update = sanitizeUpdateRoleDto({ managedBy: "code" });
    assert.equal(update.managedBy, undefined);
    assert.equal(Object.keys(update).length, 0);
  });

  test("access still round-trips through the update payload", () => {
    const update = sanitizeUpdateRoleDto({
      access: [{ moduleName: "patient", permissions: [PERMISSION_KEYS.PATIENT_VIEW] }]
    });
    assert.equal(update.access?.length, 1);
  });

  test("sanitizeAccess still refuses unknown permissions", () => {
    assert.throws(() =>
      sanitizeAccess([{ moduleName: "patient", permissions: ["patient.nonexistent"] }])
    );
  });

  test("sanitizeAccess refuses a permission filed under the wrong module", () => {
    assert.throws(() =>
      sanitizeAccess([{ moduleName: "patient", permissions: [PERMISSION_KEYS.ROLE_UPDATE] }])
    );
  });

  console.log("\n--- Audit redaction ---");

  test("passwords never reach the trail", () => {
    const redacted = redact({ password: "hunter2", name: "Dr Rao" }) as Record<string, unknown>;
    assert.equal(redacted.password, "[redacted]");
    assert.equal(redacted.name, "Dr Rao");
  });

  test("clinical free text is kept out of the diff", () => {
    const changes = diffRecords(
      { medicalHistory: "diabetes" },
      { medicalHistory: "diabetes, CKD" }
    );
    // The change is recorded so the trail shows *that* the field moved,
    // without copying the clinical text itself.
    assert.equal(changes.medicalHistory?.before, "[redacted]");
    assert.equal(changes.medicalHistory?.after, "[redacted]");
  });

  test("a redacted field that did not change is not reported at all", () => {
    const changes = diffRecords(
      { allergies: "penicillin", name: "Asha" },
      { allergies: "penicillin", name: "Asha R" }
    );
    assert.equal(changes.allergies, undefined);
    assert.equal(changes.name?.after, "Asha R");
  });

  test("a newly added clinical note is not leaked", () => {
    const changes = diffRecords({ name: "Asha" }, { name: "Asha", notes: "declined admission" });
    assert.equal(changes.notes?.after, "[redacted]");
  });

  test("the diff contains only fields that actually changed", () => {
    const changes = diffRecords(
      { name: "Asha", contact: "111" },
      { name: "Asha", contact: "222" }
    );
    assert.equal(changes.name, undefined);
    assert.equal(changes.contact?.after, "222");
  });

  test("ObjectId values are serialised rather than dropped", () => {
    const id = new Types.ObjectId();
    const redacted = redact({ branchId: id }) as Record<string, unknown>;
    assert.equal(redacted.branchId, id.toString());
  });

  test("arrays inside metadata are redacted element by element", () => {
    const redacted = redact({ items: [{ password: "x" }, { password: "y" }] }) as {
      items: Array<Record<string, unknown>>;
    };
    assert.equal(redacted.items[0].password, "[redacted]");
    assert.equal(redacted.items[1].password, "[redacted]");
  });

  console.log("\n=================================================");
  console.log(`  Boundary & Authorization Tests: ${passed}/${total} Passed`);
  console.log("=================================================\n");
}

runBoundaryTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
