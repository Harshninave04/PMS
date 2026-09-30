/**
 * Destructive full database seed.
 *
 *   npm run seed
 *
 * Wipes 18 collections and re-seeds everything, including demo/operational data
 * (sample staff logins, blood bank donors, sessions, audit logs, security
 * events, compliance reports).
 *
 * The app does NOT need this: on first start against an empty database the
 * bootstrap in src/lib/bootstrap/first-run.ts seeds all required reference data
 * automatically and never deletes anything.
 */
import { seedDatabase } from "../src/seed";

seedDatabase({ wipe: true, demo: true })
    .then(() => {
        console.log("");
        console.log("Full destructive seed complete.");
    })
    .catch((error: unknown) => {
        console.error("Seed failed:", error);
        process.exitCode = 1;
    });
