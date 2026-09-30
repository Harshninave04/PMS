/**
 * RBAC test runner.
 *
 * The suites are plain tsx scripts (no test runner dependency) that report
 * their own pass counts and exit non-zero on failure. This runner discovers
 * every `tests/rbac/*.test.ts` file and aggregates the result, so a single
 * `npm test` gates the authorization invariants.
 *
 * Kept separate from the glob form because npm executes scripts through cmd on
 * Windows, which does not expand `*`.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const TEST_DIR = path.join(process.cwd(), "tests", "rbac");

if (!fs.existsSync(TEST_DIR)) {
  console.error(`No test directory at ${TEST_DIR}`);
  process.exit(1);
}

const suites = fs
  .readdirSync(TEST_DIR)
  .filter((file) => file.endsWith(".test.ts"))
  .sort();

if (suites.length === 0) {
  console.error("No suites found in tests/rbac");
  process.exit(1);
}

console.log("Running RBAC suites");
console.log("=".repeat(50));

let failedSuites = 0;
let totalAssertions = 0;

for (const suite of suites) {
  const result = spawnSync("npx", ["tsx", path.join("tests", "rbac", suite)], {
    stdio: "pipe",
    encoding: "utf8",
    shell: true
  });

  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  const counts = [...output.matchAll(/(\d+)\/(\d+)\s+Passed/g)].pop();
  const passed = counts ? Number(counts[1]) : 0;
  const total = counts ? Number(counts[2]) : 0;

  const ok = result.status === 0;
  if (!ok) failedSuites++;
  totalAssertions += passed;

  console.log(`${ok ? "PASS" : "FAIL"}  ${suite}${total ? `  (${passed}/${total})` : ""}`);

  if (!ok) {
    // Surface the failure in full - a swallowed error makes CI useless.
    const failureLines = output
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .slice(-25);
    for (const line of failureLines) console.log(`      ${line}`);
  }
}

console.log("=".repeat(50));
console.log(
  failedSuites === 0
    ? `All ${suites.length} suites passed (${totalAssertions} checks)`
    : `${failedSuites} of ${suites.length} suites failed`
);

process.exit(failedSuites === 0 ? 0 : 1);
