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
import { MENUS, getMenuModuleKey } from "./lib/menu-data";
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
        const roleDocs: Record<string, mongoose.Document & { _id: mongoose.Types.ObjectId }> = {};
        for (const roleName of ALL_ROLES) {
            roleDocs[roleName] = await Role.create({ role: roleName, access: buildRoleAccess(roleName) });
        }
        console.log(`✅ Seeded ${ALL_ROLES.length} roles: ${ALL_ROLES.join(", ")}.`);

        // 3. Hospital
        const hospital = await Organization.create({
            organizationName: "Medistra Hospital",
            organizationId: "MEDISTRA-MAIN",
            organizationType: "HOSPITAL",
            branchType: "MAIN",
            email: "info@medistra.hospital",
            phone: "+91 33 2345 6789",
            address: "12 Medical Enclave, Central Avenue, Kolkata",
            city: "Kolkata",
            state: "West Bengal",
            pincode: "700001",
            country: "India",
            capacity: 60,
            isActive: true
        });
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
        const departments = [
            { name: "General Medicine", code: "GMED", location: "Ground Floor", phoneExtension: "101", description: "Adult general health and chronic disease care" },
            { name: "General Surgery", code: "GSUR", location: "First Floor", phoneExtension: "102", description: "General surgical care" },
            { name: "Pediatrics", code: "PEDI", location: "Ground Floor", phoneExtension: "103", description: "Child health and vaccinations" },
            { name: "Obstetrics & Gynecology", code: "OBGY", location: "First Floor", phoneExtension: "104", description: "Maternity and women's health" },
            { name: "Orthopedics", code: "ORTH", location: "First Floor", phoneExtension: "105", description: "Bones, joints and fractures" },
            { name: "Casualty", code: "CASU", location: "Ground Floor", phoneExtension: "100", description: "Walk-in emergencies and first aid" },
            { name: "Pharmacy", code: "PHAR", location: "Ground Floor - Lobby", phoneExtension: "106", description: "Outpatient and inpatient dispensing" }
        ];
        const deptByCode: Record<string, mongoose.Types.ObjectId> = {};
        for (const dept of departments) {
            const d = await Department.create({ ...dept, organizationId: hospital._id });
            deptByCode[dept.code] = d._id as mongoose.Types.ObjectId;
        }
        console.log(`✅ Seeded ${departments.length} departments.`);

        // 6. Designations
        const designations = [
            { name: "Consultant", code: "CONS", department: "Medical", level: "Senior", description: "Consultant doctor" },
            { name: "Medical Officer", code: "MO", department: "Medical", level: "Junior", description: "Duty doctor" },
            { name: "Staff Nurse", code: "NURSE", department: "Nursing", level: "Mid-Level", description: "Ward nurse" },
            { name: "Pharmacist", code: "PHARM", department: "Pharmacy", level: "Mid-Level", description: "Dispensing pharmacist" },
            { name: "Receptionist", code: "RECEP", department: "Administration", level: "Junior", description: "Front desk" },
            { name: "Accountant", code: "ACCT", department: "Finance", level: "Mid-Level", description: "Billing and accounts" }
        ];
        const desigByCode: Record<string, mongoose.Types.ObjectId> = {};
        for (const desig of designations) {
            const d = await Designation.create(desig);
            desigByCode[desig.code] = d._id as mongoose.Types.ObjectId;
        }
        console.log(`✅ Seeded ${designations.length} designations.`);

        // 7. Pharmacy catalogue
        const categories = [
            { name: "Antibiotics", code: "ABX", description: "Antimicrobials", storageCondition: "COOL_DRY" as const, requiresPrescription: true },
            { name: "Analgesics & Antipyretics", code: "ANALG", description: "Pain and fever", storageCondition: "ROOM_TEMPERATURE" as const, requiresPrescription: false },
            { name: "Cardiovascular", code: "CARD", description: "Blood pressure and heart", storageCondition: "ROOM_TEMPERATURE" as const, requiresPrescription: true },
            { name: "Gastrointestinal", code: "GI", description: "Antacids and PPIs", storageCondition: "ROOM_TEMPERATURE" as const, requiresPrescription: false },
            { name: "Antidiabetic", code: "DIAB", description: "Oral hypoglycemics and insulin", storageCondition: "ROOM_TEMPERATURE" as const, requiresPrescription: true }
        ];
        await MedicineCategory.create(categories);

        const inDays = (days: number) => new Date(Date.now() + days * 24 * 60 * 60 * 1000);
        await Medicine.create([
            { name: "Paracetamol 500mg", category: "Analgesics & Antipyretics", genericName: "Acetaminophen", dosageForm: "TABLET", manufacturer: "GlaxoSmithKline", batchNumber: "PCM-2026-01", unitPrice: 2.5, stockQuantity: 2500, expiryDate: inDays(365) },
            { name: "Amoxicillin 500mg", category: "Antibiotics", genericName: "Amoxicillin Trihydrate", dosageForm: "CAPSULE", manufacturer: "Cipla Ltd", batchNumber: "AMX-2026-04", unitPrice: 8.0, stockQuantity: 1200, expiryDate: inDays(300) },
            { name: "Metformin 500mg", category: "Antidiabetic", genericName: "Metformin Hydrochloride", dosageForm: "TABLET", manufacturer: "Sun Pharma", batchNumber: "MET-2026-02", unitPrice: 4.0, stockQuantity: 1800, expiryDate: inDays(400) },
            { name: "Atorvastatin 20mg", category: "Cardiovascular", genericName: "Atorvastatin Calcium", dosageForm: "TABLET", manufacturer: "Torrent Pharma", batchNumber: "ATV-2026-07", unitPrice: 12.5, stockQuantity: 950, expiryDate: inDays(350) },
            { name: "Pantoprazole 40mg", category: "Gastrointestinal", genericName: "Pantoprazole Sodium", dosageForm: "TABLET", manufacturer: "Alkem Labs", batchNumber: "PAN-2026-03", unitPrice: 9.0, stockQuantity: 1400, expiryDate: inDays(380) }
        ]);
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
