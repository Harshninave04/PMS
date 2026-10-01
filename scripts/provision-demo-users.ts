/**
 * Additive demo-user provisioning.
 *
 * `npm run seed` is destructive: it clears every user, role and menu before
 * reseeding. This script provisions the demo logins without touching anything
 * that is already there. It only creates or refreshes the shared-credential
 * `demo.*@medistra.hospital` accounts, one per role.
 *
 * Run `npm run repair:rbac -- --apply` first on an older database so the six
 * roles exist.
 *
 * Usage (from inside the compose network, so the same database is targeted):
 *   SEED_DEMO_USERS=true npm run seed:demo
 */
import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import type { Collection, ObjectId } from "mongodb";
import { DEMO_USERS, demoEmail } from "../src/seed";

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/medistra-hms";
const DEMO_ENABLED = process.env.SEED_DEMO_USERS === "true";
const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD || "Demo@2026";

async function ensureDemoUsers(users: Collection, rolesByName: Map<string, ObjectId>, hospitalId?: ObjectId) {
    const created: string[] = [];
    const refreshed: string[] = [];
    const password = await bcrypt.hash(DEMO_PASSWORD, 10);

    for (const [roleName, displayName] of DEMO_USERS) {
        const roleId = rolesByName.get(roleName);
        if (!roleId) {
            console.warn(`   ! skipping ${roleName}: role not found — run "npm run repair:rbac -- --apply" first`);
            continue;
        }

        const email = demoEmail(roleName);
        const existing = await users.findOne({ email });
        const fields = { name: displayName, password, role: roleId, isActive: true, ...(hospitalId ? { organization: hospitalId } : {}) };

        if (existing) {
            await users.updateOne({ _id: existing._id }, { $set: fields });
            refreshed.push(email);
        } else {
            await users.insertOne({ ...fields, email, gender: "UNSPECIFIED", lastLoginAt: null });
            created.push(email);
        }
        console.log(`   - ${email.padEnd(40)} [${roleName}]`);
    }
    return { created, refreshed };
}

async function provision() {
    if (!DEMO_ENABLED) {
        console.log("SEED_DEMO_USERS is not \"true\" - nothing to do.");
        console.log("Re-run with SEED_DEMO_USERS=true to provision the demo logins.");
        return;
    }

    console.log(`Target database: ${MONGODB_URI.replace(/\/\/([^:]+):([^@]+)@/, "//$1:****@")}`);
    await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
    const db = mongoose.connection.db;
    if (!db) throw new Error("No database selected after connecting.");

    const users = db.collection("users");
    const rolesByName = new Map<string, ObjectId>();
    for (const role of await db.collection("roles").find({}, { projection: { role: 1 } }).toArray()) {
        rolesByName.set(role.role, role._id);
    }
    const mainOrgs = await db.collection("organizations").find({ branchType: "MAIN" }, { projection: { _id: 1 } }).toArray();
    const hospitalId = mainOrgs.length === 1 ? mainOrgs[0]._id : undefined;

    const userCountBefore = await users.countDocuments({});
    console.log(`Provisioning ${DEMO_USERS.length} demo logins (password: ${DEMO_PASSWORD})...`);
    const result = await ensureDemoUsers(users, rolesByName, hospitalId);

    const userCountAfter = await users.countDocuments({});
    console.log(`\nDone. created ${result.created.length}, refreshed ${result.refreshed.length}.`);
    console.log(`User count ${userCountBefore} -> ${userCountAfter} (no records were deleted).`);
}

provision()
    .then(() => mongoose.disconnect())
    .then(() => process.exit(0))
    .catch(async (err) => {
        console.error("Demo provisioning failed:", err);
        await mongoose.disconnect().catch(() => undefined);
        process.exit(1);
    });
