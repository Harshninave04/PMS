/**
 * Prepares a database so a colleague can log in — without destroying anything.
 *
 * Roles and menus need no work here: the app reconciles those on every start.
 * This covers what the app deliberately does *not* do at runtime — creating the
 * first administrator and the reference data a hospital needs — because
 * minting credentials automatically is not something a web request should do.
 *
 * Unlike `npm run seed`, nothing is ever deleted. Every step is idempotent, so
 * it is safe to run on an existing installation: it fills gaps and leaves
 * everything else alone.
 *
 * Usage:
 *   npm run bootstrap
 *   npm run bootstrap -- --admin-email you@hospital.com --admin-password 'S3cret!'
 *
 * The password comes from DEFAULT_ADMIN_PASSWORD unless --admin-password is
 * given. An existing administrator is never overwritten.
 */
import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import User from "../src/models/user.model";
import Role from "../src/models/role.model";
import Organization from "../src/models/organization.model";
import Department from "../src/models/department.model";
import Designation from "../src/models/designation.model";
import Medicine from "../src/models/medicine.model";
import MedicineCategory from "../src/models/medicine-category.model";
import { ADMIN_ROLE } from "../src/lib/rbac/role-access";
import { reconcileCanonicalAccess, reportHasChanges } from "../src/lib/rbac/canonical-sync";
import { planAdmin, shouldSeedReferenceData } from "../src/lib/bootstrap-plan";
import {
    DEPARTMENTS,
    DESIGNATIONS,
    HOSPITAL,
    MEDICINE_CATEGORIES,
    starterMedicines,
} from "../src/lib/reference-data";

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/medistra-hms";

function flag(name: string): string | undefined {
    const index = process.argv.indexOf(`--${name}`);
    if (index === -1) return undefined;
    const value = process.argv[index + 1];
    return value && !value.startsWith("--") ? value : undefined;
}

const adminEmail = (flag("admin-email") || process.env.DEFAULT_ADMIN_EMAIL || "admin@hospital.com").trim();
const adminPassword = flag("admin-password") || process.env.DEFAULT_ADMIN_PASSWORD || "";

interface Step {
    name: string;
    created: number;
    detail?: string;
}

async function ensureHospital(): Promise<{ id: mongoose.Types.ObjectId; created: boolean; name: string }> {
    const existing = await Organization.findOne({ organizationId: HOSPITAL.organizationId }).lean();
    if (existing) return { id: existing._id as mongoose.Types.ObjectId, created: false, name: existing.organizationName };

    const hospital = await Organization.create(HOSPITAL);
    return { id: hospital._id as mongoose.Types.ObjectId, created: true, name: hospital.organizationName };
}

/**
 * Departments and job titles describe how a particular hospital actually
 * operates. A hospital that already has them has made its own choices, so we
 * only supply the sample set when there is nothing at all — never merge our
 * opinion into an existing setup.
 */
async function ensureDepartments(hospitalId: mongoose.Types.ObjectId): Promise<{ created: number; existing: number }> {
    const existing = await Department.countDocuments({ organizationId: hospitalId });
    if (!shouldSeedReferenceData(existing)) return { created: 0, existing };
    await Department.insertMany(DEPARTMENTS.map((dept) => ({ ...dept, organizationId: hospitalId })));
    return { created: DEPARTMENTS.length, existing };
}

async function ensureDesignations(): Promise<{ created: number; existing: number }> {
    const existing = await Designation.countDocuments({});
    if (!shouldSeedReferenceData(existing)) return { created: 0, existing };
    await Designation.insertMany([...DESIGNATIONS]);
    return { created: DESIGNATIONS.length, existing };
}

async function ensurePharmacyCatalogue(): Promise<{ categories: number; medicines: number }> {
    const categories = await MedicineCategory.distinct("code", {});
    const missingCategories = MEDICINE_CATEGORIES.filter((cat) => !categories.includes(cat.code));
    if (missingCategories.length) await MedicineCategory.insertMany([...missingCategories]);

    // Only fill an empty catalogue. A stocked pharmacy is real inventory and
    // re-adding the sample medicines to it would corrupt the stock counts.
    const medicines = await Medicine.countDocuments({});
    if (!shouldSeedReferenceData(medicines)) return { categories: missingCategories.length, medicines: 0 };
    const starter = starterMedicines();
    await Medicine.insertMany(starter);
    return { categories: missingCategories.length, medicines: starter.length };
}

async function ensureAdmin(hospitalId: mongoose.Types.ObjectId): Promise<Step> {
    const adminRole = await Role.findOne({ role: ADMIN_ROLE }).lean();
    const emailTaken = (await User.findOne({ email: adminEmail.toLowerCase() }).lean()) !== null;

    const plan = planAdmin({
        email: adminEmail,
        roleExists: !!adminRole,
        emailTaken,
        existingAdminHolders: adminRole ? await User.countDocuments({ role: adminRole._id }) : 0,
        password: adminPassword || undefined,
    });

    if (plan.action === "skip") return { name: "Administrator", created: 0, detail: plan.reason };
    if (!adminPassword) {
        throw new Error(
            "No administrator password. Set DEFAULT_ADMIN_PASSWORD or pass --admin-password '<password>'."
        );
    }

    const user = await User.create({
        name: "Administrator",
        email: plan.email,
        password: await bcrypt.hash(adminPassword, 10),
        gender: "UNSPECIFIED",
        role: adminRole!._id,
        organization: hospitalId,
        isActive: true,
    });
    return { name: "Administrator", created: 1, detail: user.email };
}

async function bootstrap() {
    console.log(`Target database: ${MONGODB_URI.replace(/\/\/([^:]+):([^@]+)@/, "//$1:****@")}\n`);

    await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
    const steps: Step[] = [];

    try {
        // Roles and menus are the app's own job, but running it here means a
        // freshly bootstrapped database is complete before the first request.
        const access = await reconcileCanonicalAccess({ apply: true, log: (message) => console.log(`   ${message}`) });
        steps.push({
            name: "Roles and menus",
            created: access.menus === "created" ? 1 : 0,
            detail: reportHasChanges(access) ? `reconciled, menus ${access.menus}` : "already up to date",
        });

        const hospital = await ensureHospital();
        steps.push({
            name: "Hospital",
            created: hospital.created ? 1 : 0,
            detail: hospital.created ? `${hospital.name} created` : `${hospital.name} already present`,
        });

        const departments = await ensureDepartments(hospital.id);
        steps.push({
            name: "Departments",
            created: departments.created,
            detail: departments.existing
                ? `${departments.existing} already defined, left as they are`
                : `none found, added ${departments.created}`,
        });

        const designations = await ensureDesignations();
        steps.push({
            name: "Designations",
            created: designations.created,
            detail: designations.existing
                ? `${designations.existing} already defined, left as they are`
                : `none found, added ${designations.created}`,
        });

        const pharmacy = await ensurePharmacyCatalogue();
        steps.push({
            name: "Pharmacy catalogue",
            created: pharmacy.categories + pharmacy.medicines,
            detail: pharmacy.medicines
                ? `${pharmacy.categories} categor(y/ies), ${pharmacy.medicines} medicine(s)`
                : "stock is not empty, nothing added",
        });

        const admin = await ensureAdmin(hospital.id);
        steps.push({ name: admin.name, created: admin.created, detail: admin.detail });

        console.log("Summary");
        for (const step of steps) {
            const mark = step.created ? `+${step.created}` : "  -";
            console.log(`   ${mark.padEnd(5)} ${step.name.padEnd(20)} ${step.detail ?? ""}`);
        }

        const createdAdmin = steps.find((step) => step.name === "Administrator")?.created === 1;
        if (createdAdmin) {
            console.log(`\nSign in with ${adminEmail} and the password you supplied.`);
            if (!flag("admin-password")) {
                console.log("That password came from DEFAULT_ADMIN_PASSWORD — change it in Settings > Users now.");
            }
        }
        console.log("\nBootstrap finished. Nothing was deleted.");
        console.log("Optional demo logins: npm run seed:demo");
    } catch (error) {
        console.error("\nBootstrap failed:", error instanceof Error ? error.message : error);
        process.exitCode = 1;
    } finally {
        await mongoose.disconnect();
    }
}

if (require.main === module) {
    bootstrap();
}