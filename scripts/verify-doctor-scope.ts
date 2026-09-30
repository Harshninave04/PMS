/**
 * Read-only verification of the doctor-roster authorization chain.
 * Confirms that a receptionist's scope filter matches the seeded doctors,
 * mirroring exactly what ScopeResolver produces for a BRANCH-scoped
 * `doctor.doctor.view` grant.
 *
 * Usage: npx tsx scripts/verify-doctor-scope.ts
 */
import "dotenv/config";
import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/medistra-hms";

async function verify() {
    await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
    const db = mongoose.connection.db!;

    const roles = db.collection("roles");
    const users = db.collection("users");
    const doctors = db.collection("doctors");
    const departments = db.collection("departments");

    const rosterRoles = [
        "RECEPTIONIST", "FRONT_DESK_MANAGER", "DOCTOR", "CONSULTANT",
        "NURSE", "LAB_TECHNICIAN", "RADIOLOGIST", "BRANCH_MANAGER",
        "ORGANIZATION_ADMIN", "HR_OFFICER"
    ];

    console.log("ROLE GRANT MATRIX");
    console.log("=".repeat(96));
    console.log(
        "role".padEnd(22) +
        "doctor.view".padEnd(13) +
        "dept.view".padEnd(11) +
        "staff.view".padEnd(12) +
        "orgScope"
    );
    console.log("-".repeat(96));

    for (const roleName of rosterRoles) {
        const role = await roles.findOne({ role: roleName });
        if (!role) {
            console.log(`${roleName} -> ROLE MISSING`);
            continue;
        }
        const has = (perm: string) =>
            (role.access ?? []).some(
                (item: any) => Array.isArray(item.permissions) && item.permissions.includes(perm)
            );
        const scopeOf = (perm: string) => {
            for (const item of role.access ?? []) {
                for (const g of item.grants ?? []) {
                    if (g.permission === perm) return g.orgScope;
                }
            }
            return "(fallback)";
        };

        console.log(
            roleName.padEnd(22) +
            (has("doctor.doctor.view") ? "yes" : "NO").padEnd(13) +
            (has("department.department.view") ? "yes" : "NO").padEnd(11) +
            (has("staff.staff.view") ? "yes" : "NO").padEnd(12) +
            scopeOf("doctor.doctor.view")
        );
    }

    console.log("\nBRANCH SCOPE MATCH (the receptionist bug)");
    console.log("=".repeat(96));

    const receptionists = await users.find({}).toArray();
    for (const user of receptionists) {
        const role = await roles.findOne({ _id: user.role });
        if (!role) continue;

        const roleName: string = role.role;
        const canViewDoctors = (role.access ?? []).some(
            (item: any) => Array.isArray(item.permissions) && item.permissions.includes("doctor.doctor.view")
        );

        // Same BRANCH branch the ScopeResolver would emit, or deny-all.
        if (roleName !== "SYSTEM_SUPER_ADMIN" && !canViewDoctors) continue;

        const scopeIsGlobal = roleName === "SYSTEM_SUPER_ADMIN";
        const branch = user.branch?.toString();
        const query = scopeIsGlobal ? {} : { branchId: user.branch };

        const visible = await doctors.countDocuments(query);
        const visibleDepts = scopeIsGlobal
            ? await departments.countDocuments({})
            : await departments.countDocuments({ organizationId: user.branch });

        console.log(
            `${(user.email + "").padEnd(34)} ${roleName.padEnd(20)} ` +
            `branch=${branch ? branch.slice(-6) : "MISSING"}  ` +
            `doctors=${visible}  departments=${visibleDepts}`
        );
    }

    console.log("\nDoctor branch distribution:");
    const pipeline = [
        { $group: { _id: "$branchId", count: { $sum: 1 } } },
        { $sort: { count: -1 } }
    ];
    for (const row of await doctors.aggregate(pipeline).toArray()) {
        const id = row._id ? row._id.toString() : "(none)";
        console.log(`  ${id.slice(-8).padEnd(12)} ${row.count}`);
    }

    console.log("\nOrphan check (doctors/staff with no branchId):");
    console.log(
        `  doctors: ${await doctors.countDocuments({ $or: [{ branchId: { $exists: false } }, { branchId: null }] })}`
    );

    await mongoose.disconnect();
}

verify().catch(async (error) => {
    console.error("Verification failed:", error);
    await mongoose.disconnect();
    process.exit(1);
});
