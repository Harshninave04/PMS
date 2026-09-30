/**
 * Non-destructive role bootstrap.
 *
 * Inserts any of the 39 default roles that are missing, wires the default
 * role hierarchy, and creates the bootstrap super admin if nobody holds that
 * role yet. Existing roles, users, and hierarchy rows are never modified.
 *
 * Usage:
 *   npm run seed:roles
 *
 * This is the safe alternative to `npm run seed`, which wipes 18 collections.
 */
import mongoose from "mongoose";
import "dotenv/config";
import { ensureDefaults } from "../src/lib/bootstrap/ensure-defaults";
import Role from "../src/models/role.model";
import User from "../src/models/user.model";

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/medistra-hms";

async function main() {
    console.log(`Connecting to ${MONGODB_URI.replace(/\/\/([^:]+):([^@]+)@/, "//$1:****@")}...`);
    await mongoose.connect(MONGODB_URI);

    const result = await ensureDefaults();

    const [roleTotal, userTotal] = await Promise.all([Role.countDocuments(), User.countDocuments()]);

    console.log("");
    console.log("Role bootstrap summary");
    console.log("-----------------------");
    console.log(`  roles created        : ${result.rolesCreated.length}`);
    console.log(`  roles present        : ${roleTotal}`);
    console.log(`  hierarchy rows added : ${result.hierarchyCreated}`);
    console.log(`  bootstrap admin      : ${result.adminCreated ? "created" : "not needed"}`);
    console.log(`  totals in db         : ${roleTotal} roles, ${userTotal} users`);
    if (result.skipped) {
        console.log("  (skipped - DISABLE_DEFAULT_BOOTSTRAP=true)");
    }
    if (result.rolesCreated.length > 0) {
        console.log("");
        console.log(`  created: ${result.rolesCreated.join(", ")}`);
    }
    console.log("");
    console.log("Open /admin/users/create to provision an account.");
}

main()
    .catch((error) => {
        console.error("Role bootstrap failed:", error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await mongoose.disconnect();
    });
