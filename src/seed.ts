import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import Role from "./models/role.model";
import Menu from "./models/menu.model";
import User from "./models/user.model";
import Organization from "./models/organization.model";
import Department from "./models/department.model";
import Designation from "./models/designation.model";
import Doctor from "./models/doctor.model";
import Staff from "./models/staff.model";
import MedicineCategory from "./models/medicine-category.model";
import Medicine from "./models/medicine.model";
import { ADMIN_ROLE, ALL_ROLES, buildRoleAccess } from "./lib/rbac/role-access";
import { defaultPermissionsFor } from "./lib/rbac/default-permissions";
import { MENUS, getMenuModuleKey } from "./lib/menu-data";
import {
    DEPARTMENTS,
    DESIGNATIONS,
    HOSPITAL,
    MEDICINE_CATEGORIES,
    starterMedicines,
} from "./lib/reference-data";
import "dotenv/config";

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/medistra-hms";
const DEFAULT_ADMIN_EMAIL = process.env.DEFAULT_ADMIN_EMAIL || "admin@hospital.com";
const DEFAULT_ADMIN_PASSWORD = process.env.DEFAULT_ADMIN_PASSWORD || "password123";

/**
 * One demo login per role. Only created when SEED_DEMO_USERS=true.
 * Tuple: [roleName, displayName]
 */
export const DEMO_USERS: [string, string][] = [
    ["ADMIN", "Demo Administrator"],
    ["DOCTOR", "Demo Doctor"],
    ["NURSE", "Demo Nurse"],
    ["RECEPTIONIST", "Demo Receptionist"],
    ["PHARMACIST", "Demo Pharmacist"],
    ["ACCOUNTANT", "Demo Accountant"]
];

export function demoEmail(roleName: string): string {
    return `demo.${roleName.toLowerCase()}@medistra.hospital`;
}

async function seedMenus() {
    for (const menuGroup of MENUS) {
        const { children, ...parentData } = menuGroup;
        const parentKey = getMenuModuleKey(parentData);
        const childIds = [];
        for (const child of children ?? []) {
            const childMenu = await Menu.create({ ...child, moduleKey: getMenuModuleKey(child) || parentKey });
            childIds.push(childMenu._id);
        }
        await Menu.create({ ...parentData, moduleKey: parentKey, children: childIds });
    }
    console.log(`✅ Seeded ${MENUS.length} menus.`);
}

async function seedDatabase() {
    try {
        console.log("Connecting to database...");
        await mongoose.connect(MONGODB_URI);
        console.log("Connected successfully!");

        console.log("Clearing existing seed data...");
        await Promise.all([
            User.deleteMany({}),
            Role.deleteMany({}),
            Menu.deleteMany({}),
            Organization.deleteMany({}),
            Department.deleteMany({}),
            Designation.deleteMany({}),
            Doctor.deleteMany({}),
            Staff.deleteMany({}),
            MedicineCategory.deleteMany({}),
            Medicine.deleteMany({})
        ]);

        // 1. Menus
        await seedMenus();

        // 2. Roles
        //    Idempotent: a role that already exists is left alone apart from the
        //    permission list, which is upserted to the shipped defaults. A fresh
        //    database and a re-run of this script end up in the same state.
        const roleDocs: Record<string, mongoose.Document & { _id: mongoose.Types.ObjectId }> = {};
        for (const roleName of ALL_ROLES) {
            const access = buildRoleAccess(roleName);
            const permissions = defaultPermissionsFor(roleName);

            const existing = await Role.findOne({ role: roleName });
            if (existing) {
                existing.access = access;
                existing.permissions = permissions;
                existing.isSystem = true;
                await existing.save();
                roleDocs[roleName] = existing as unknown as (typeof roleDocs)[string];
                continue;
            }

            roleDocs[roleName] = await Role.create({
                role: roleName,
                access,
                permissions,
                isSystem: true,
            });
        }
        console.log(`✅ Seeded ${ALL_ROLES.length} roles: ${ALL_ROLES.join(", ")}.`);

        // 3. Hospital
        const hospital = await Organization.create(HOSPITAL);
        console.log(`✅ Seeded hospital: ${hospital.organizationName}`);

        // 4. Admin user
        const hashedPassword = await bcrypt.hash(DEFAULT_ADMIN_PASSWORD, 10);
        const adminUser = await User.create({
            name: "Administrator",
            email: DEFAULT_ADMIN_EMAIL,
            password: hashedPassword,
            gender: "MALE",
            role: roleDocs[ADMIN_ROLE]._id,
            organization: hospital._id,
            isActive: true
        });
        console.log(`✅ Seeded admin user: ${adminUser.email}`);

        // 5. Departments
        const deptByCode: Record<string, mongoose.Types.ObjectId> = {};
        for (const dept of DEPARTMENTS) {
            const d = await Department.create({ ...dept, organizationId: hospital._id });
            deptByCode[dept.code] = d._id as mongoose.Types.ObjectId;
        }
        console.log(`✅ Seeded ${DEPARTMENTS.length} departments.`);

        // 6. Designations
        const desigByCode: Record<string, mongoose.Types.ObjectId> = {};
        for (const desig of DESIGNATIONS) {
            const d = await Designation.create(desig);
            desigByCode[desig.code] = d._id as mongoose.Types.ObjectId;
        }
        console.log(`✅ Seeded ${DESIGNATIONS.length} designations.`);

        // 7. Pharmacy catalogue
        await MedicineCategory.create(MEDICINE_CATEGORIES);
        await Medicine.create(starterMedicines());
        console.log(`✅ Seeded pharmacy catalogue.`);

        // 8. Demo logins (opt-in, never runs by default)
        if (process.env.SEED_DEMO_USERS === "true") {
            console.log("SEED_DEMO_USERS=true — seeding demo logins...");
            const demoPassword = await bcrypt.hash(process.env.SEED_DEMO_PASSWORD || "Demo@2026", 10);

            for (const [roleName, displayName] of DEMO_USERS) {
                const user = await User.create({
                    name: displayName,
                    email: demoEmail(roleName),
                    password: demoPassword,
                    gender: "UNSPECIFIED",
                    role: roleDocs[roleName]._id,
                    organization: hospital._id,
                    isActive: true
                });

                // Doctors only see their own OPD list, so the demo doctor needs a doctor profile.
                if (roleName === "DOCTOR") {
                    await Doctor.create({
                        userId: user._id,
                        departmentId: deptByCode.GMED,
                        licenseNo: "WBMC-DEMO-001",
                        specialization: "General Medicine",
                        qualification: "MBBS, MD",
                        experienceYears: 8,
                        consultationFee: 500,
                        status: "ACTIVE"
                    });
                } else if (roleName !== ADMIN_ROLE) {
                    const staffDesignation: Record<string, string> = { NURSE: "NURSE", RECEPTIONIST: "RECEP", PHARMACIST: "PHARM", ACCOUNTANT: "ACCT" };
                    await Staff.create({
                        userId: user._id,
                        employeeId: `EMP-DEMO-${roleName}`,
                        departmentId: roleName === "PHARMACIST" ? deptByCode.PHAR : deptByCode.GMED,
                        designationId: desigByCode[staffDesignation[roleName]],
                        role: roleName,
                        shift: "MORNING",
                        status: "ACTIVE"
                    });
                }

                console.log(`   • ${demoEmail(roleName).padEnd(40)} ${displayName} [${roleName}]`);
            }
            console.log(`✅ Seeded ${DEMO_USERS.length} demo logins.`);
        }

        console.log("\n🎉 Database seeding finished successfully!");
    } catch (error) {
        console.error("❌ Error during seeding:", error);
        process.exitCode = 1;
    } finally {
        await mongoose.disconnect();
        console.log("Disconnected from database.");
    }
}

if (require.main === module) {
    seedDatabase();
}
