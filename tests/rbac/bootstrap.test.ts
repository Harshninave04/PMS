import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/**
 * First-run bootstrap guards.
 *
 * The app seeds itself on first start against an empty database. These tests
 * assert the safety properties of that path by inspecting the source, because
 * the behaviour depends on code that must NOT run (a destructive wipe) and on
 * demo data that must never be created implicitly.
 */

function read(relative: string): string {
  return fs.readFileSync(path.resolve(process.cwd(), relative), "utf-8");
}

async function runBootstrapTests() {
  console.log("\n=================================================");
  console.log("  First-Run Bootstrap Tests");
  console.log("=================================================\n");

  let totalTests = 0;
  let passedTests = 0;
  const test = (name: string, fn: () => void) => {
    totalTests += 1;
    try {
      fn();
      passedTests += 1;
      console.log(`  PASS  ${name}`);
    } catch (err) {
      console.error(`  FAIL  ${name}`);
      throw err;
    }
  };

  const seed = read("src/seed.ts");
  const firstRun = read("src/lib/bootstrap/first-run.ts");
  const dbConnect = read("src/lib/dbConnect.ts");

  test("src/seed.ts is importable and has no import side effects", () => {
    assert.ok(
      seed.includes("export async function seedDatabase"),
      "seedDatabase must be exported so the app can call it"
    );
    assert.ok(
      !/^\s*seedDatabase\(\);?\s*$/m.test(seed),
      "seedDatabase() must not be invoked at module load - the CLI owns that"
    );
  });

  test("the destructive wipe is gated behind the wipe option", () => {
    assert.ok(seed.includes("const wipe = options.wipe ?? true"), "wipe must default from options");
    assert.ok(
      seed.includes("if (wipe) {") && seed.includes("} // end wipe"),
      "the deleteMany block must sit inside `if (wipe)`"
    );
    const wipeAt = seed.indexOf("if (wipe) {");
    const firstDelete = seed.indexOf("await User.deleteMany({})");
    assert.ok(wipeAt > -1 && firstDelete > wipeAt, "wipe guard must precede the deletes");
  });

  test("bootstrap calls seedDatabase without wiping and without demo data", () => {
    assert.ok(
      firstRun.includes("wipe: false") && firstRun.includes("demo: false"),
      "first-run must seed additively, with demo data disabled"
    );
    assert.ok(
      firstRun.includes("disconnect: false"),
      "first-run must not close the shared mongoose connection"
    );
  });

  test("all demo data regions are gated on the demo option", () => {
    // Each fabricated-data region must be preceded by a `demo` guard.
    const demoRegions = [
      "Seeding Blood Bank reference donors & inventory",
      "const sampleStaffData = [",
      "const existingSessionsCount = demo",
      "const existingAuditCount = demo",
      "const existingSecurityCount = demo",
      "const existingComplianceCount = demo"
    ];
    for (const marker of demoRegions) {
      assert.ok(seed.includes(marker), `Missing demo region marker: ${marker}`);
    }

    // And the guards must actually short-circuit rather than merely being present.
    assert.ok(
      seed.includes("demo ? await AuditLog.countDocuments() : 1"),
      "audit logs must not be created when demo is disabled"
    );
    assert.ok(
      seed.includes("demo ? await SecurityEvent.countDocuments() : 1"),
      "security events must not be created when demo is disabled"
    );
    assert.ok(
      seed.includes("demo ? await ComplianceReport.countDocuments() : 1"),
      "compliance reports must not be created when demo is disabled"
    );
    assert.ok(
      seed.includes("demo ? await UserSession.countDocuments() : 1"),
      "fake sessions must not be created when demo is disabled"
    );
  });

  test("the default demo option stays true so `npm run seed` is unchanged", () => {
    assert.ok(
      seed.includes("const demo = options.demo ?? true"),
      "CLI seeding must keep producing demo data by default"
    );
    assert.ok(
      read("scripts/seed-full.ts").includes("demo: true"),
      "the destructive CLI must explicitly request demo data"
    );
  });

  test("first-run detection uses a sentinel plus a count check", () => {
    assert.ok(
      read("src/lib/bootstrap/constants.ts").includes('"bootstrap.first_run_completed"'),
      "a sentinel key must record that seeding already happened"
    );
    assert.ok(
      firstRun.includes("BOOTSTRAP_SENTINEL_KEY") && firstRun.includes("SystemSetting.findOne({ key: SENTINEL_KEY })"),
      "the sentinel must be defined once and checked before seeding"
    );
    assert.ok(
      firstRun.includes("countDocuments()"),
      "an empty-database count check must guard the seed"
    );
    assert.ok(
      firstRun.includes('"not-empty"') && firstRun.includes('"already-completed"'),
      "both the adopted and already-seeded paths must be handled explicitly"
    );
  });

  test("an existing database is adopted, never re-seeded or wiped", () => {
    assert.ok(
      firstRun.includes("Reference data seeding skipped"),
      "a populated database must skip reference seeding"
    );
    assert.ok(
      !firstRun.includes("wipe: true"),
      "the first-run path must never request a wipe"
    );
  });


  test("bootstrap can be disabled and failures never escape", () => {
    assert.ok(
      firstRun.includes('DISABLE_DEFAULT_BOOTSTRAP === "true"'),
      "an opt-out env flag must be honoured"
    );
    assert.ok(
      firstRun.includes(".catch(") && firstRun.includes("firstRunPromise = null"),
      "failures must be caught and must not be cached"
    );
  });

  test("dbConnect runs the first-run bootstrap", () => {
    assert.ok(
      dbConnect.includes("ensureFirstRunSeed()"),
      "dbConnect must trigger the first-run bootstrap"
    );
    assert.ok(
      dbConnect.includes("await ensureFirstRunSeed()"),
      "the bootstrap must be awaited so seeding finishes before the request"
    );
  });

  // ---------------------------------------------------------------------------
  // Concurrency: Docker replicas or a restart storm can hit an empty database
  // simultaneously, so the bootstrap must take an exclusive lock.
  // ---------------------------------------------------------------------------

  test("the sentinel is claimed atomically before any seeding work", () => {
    assert.ok(
      firstRun.includes("await claimSentinel()"),
      "the claim must happen before the empty-database check and the seed"
    );
    assert.ok(
      firstRun.indexOf("await claimSentinel()") < firstRun.indexOf("countDocuments()"),
      "the claim must precede the count check, otherwise two processes can both decide to seed"
    );
    assert.ok(
      firstRun.includes("SystemSetting.create("),
      "the claim must be an insert that the unique index on SystemSetting.key can reject"
    );
  });

  test("the unique sentinel index is built before the claim is attempted", () => {
    // Mongoose creates indexes asynchronously; without this wait a fresh
    // collection has no unique index yet and both racers would insert.
    assert.ok(
      firstRun.includes("await SystemSetting.init()"),
      "the sentinel index must be materialised before relying on it as a lock"
    );
    // The helper is defined below claimSentinel, so order is asserted on the
    // call, not on the definition.
    assert.ok(
      firstRun.indexOf("await ensureSentinelIndex()") < firstRun.indexOf("await SystemSetting.create("),
      "the index must be awaited before the compare-and-set insert"
    );
    assert.ok(
      firstRun.indexOf("await ensureSentinelIndex()") > firstRun.indexOf("async function claimSentinel"),
      "ensureSentinelIndex must be called from inside claimSentinel"
    );
  });

  test("a duplicate claim is treated as 'held by another process'", () => {
    assert.ok(
      firstRun.includes("DUPLICATE_KEY") && firstRun.includes('return "held-by-other"'),
      "losing the claim race must back off instead of seeding"
    );
    assert.ok(
      firstRun.includes("Another process is seeding this database - skipping"),
      "the losing process must not seed"
    );
  });

  test("an interrupted seed is reclaimed instead of locking the database forever", () => {
    const constants = read("src/lib/bootstrap/constants.ts");
    assert.ok(
      constants.includes('BOOTSTRAP_SENTINEL_IN_PROGRESS = "in_progress"'),
      "a claim must be visibly in-progress while the seed runs"
    );
    assert.ok(
      firstRun.includes("CLAIM_STALE_AFTER_MS"),
      "a stale-claim threshold must exist so a killed container can be recovered from"
    );
    assert.ok(
      firstRun.includes("age < CLAIM_STALE_AFTER_MS") && firstRun.includes('return "stale"'),
      "a fresh claim must be respected while an old one must be taken over"
    );
    assert.ok(
      firstRun.includes("Taking over an abandoned first-run claim"),
      "taking over an abandoned claim must be logged"
    );
  });

  test("the bootstrap runs before the login lookup, not after", () => {
    // A lazily triggered bootstrap is only correct if it completes before the
    // credential check, otherwise the very first login fails against an empty
    // database - which is exactly what the operator would report as "I cannot
    // log in on a fresh install".
    const auth = read("src/lib/auth.ts");
    assert.ok(
      auth.includes("await dbConnect()"),
      "authorize must await the connection (which triggers the bootstrap)"
    );
    const connectAt = auth.indexOf("await dbConnect()");
    const lookupAt = auth.indexOf("userRepository.findByEmail");
    assert.ok(lookupAt > -1, "the credential lookup must be found in the test");
    assert.ok(
      connectAt < lookupAt,
      "dbConnect (which seeds) must be awaited before the user lookup"
    );
  });

  test("role names are unique in the database, not only in application code", () => {
    const roleModel = read("src/models/role.model.ts");
    assert.ok(
      /index\(\{\s*role:\s*1\s*\},\s*\{\s*unique:\s*true\s*\}\)/.test(roleModel),
      "Role.role must carry a unique index as a second line of defence"
    );
  });

  test("the role and hierarchy upserts tolerate a lost race", () => {
    const ensureDefaults = read("src/lib/bootstrap/ensure-defaults.ts");
    assert.ok(
      ensureDefaults.includes("await Role.init()"),
      "the role index must be built before the check-then-insert loop"
    );
    assert.ok(
      ensureDefaults.includes("DUPLICATE_KEY"),
      "a concurrent inserter must be tolerated rather than crashing the bootstrap"
    );
    // Hierarchy must not depend on this process having created the roles,
    // otherwise a process that lost the role race leaves the tree half-built.
    assert.ok(
      !/if \(result\.rolesCreated\.length > 0\)/.test(ensureDefaults),
      "hierarchy repair must not be gated on this process creating roles"
    );
  });

  test("the seed ignores the bootstrap sentinel when deciding whether to configure the system", () => {
    // Regression: the bootstrap writes its lock row into `systemsettings`
    // BEFORE seeding. The seed gated all 117 baseline settings on
    // `countDocuments() === 0`, so the lock's own row made that check pass and
    // the app came up completely unconfigured - with no error anywhere.
    assert.ok(
      seed.includes("BOOTSTRAP_SENTINEL_KEY"),
      "the seed must import the shared sentinel key"
    );
    assert.ok(
      /SystemSetting\.countDocuments\(\{\s*key:\s*\{\s*\$ne:\s*BOOTSTRAP_SENTINEL_KEY\s*\},?\s*\}\)/.test(seed),
      "the baseline-settings count must exclude the bootstrap sentinel"
    );
    assert.ok(
      seed.includes('from "./lib/bootstrap/constants"'),
      "the sentinel key must come from the shared constants module"
    );
    assert.ok(
      read("src/lib/bootstrap/constants.ts").includes("BOOTSTRAP_SENTINEL_KEY"),
      "the shared constants module must define the sentinel key"
    );
  });

  test("Docker builds the runtime image with the seed scripts available", () => {
    const dockerfile = read("Dockerfile");
    assert.ok(
      dockerfile.includes("COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts"),
      "the runner stage must copy ./scripts or `npm run seed` breaks in the container"
    );
  });

  console.log(`\n=================================================`);
  console.log(`  First-Run Bootstrap: ${passedTests}/${totalTests} Passed`);
  console.log(`=================================================\n`);
}

runBootstrapTests().catch((err: unknown) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
