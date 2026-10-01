import assert from "node:assert/strict";
import { planAdmin, shouldSeedReferenceData } from "@/lib/bootstrap-plan";
import {
    DEPARTMENTS,
    DESIGNATIONS,
    HOSPITAL,
    MEDICINE_CATEGORIES,
    starterMedicines,
} from "@/lib/reference-data";

let passed = 0;
function check(name: string, fn: () => void) {
    try {
        fn();
        passed++;
        console.log(`  ✓ ${name}`);
    } catch (error) {
        console.error(`  ✗ ${name}`);
        console.error(`    ${error instanceof Error ? error.message : String(error)}`);
        process.exitCode = 1;
    }
}

console.log("bootstrap reference data");

check("reference data is only created from nothing", () => {
    assert.equal(shouldSeedReferenceData(0), true, "an empty database should be filled");
    assert.equal(shouldSeedReferenceData(1), false, "a single existing document means the hospital has its own arrangement");
    assert.equal(shouldSeedReferenceData(12), false);
    assert.equal(shouldSeedReferenceData(14), false);
});

console.log("bootstrap administrator plan");

const base = { email: "admin@hospital.com", roleExists: true, emailTaken: false, existingAdminHolders: 0 };

check("a first install creates the administrator", () => {
    assert.deepEqual(planAdmin({ ...base, password: "LongEnough1" }), {
        action: "create",
        email: "admin@hospital.com",
    });
});

check("the email is normalised", () => {
    const plan = planAdmin({ ...base, email: "  Admin@Hospital.COM ", password: "LongEnough1" });
    assert.equal(plan.action === "create" && plan.email, "admin@hospital.com");
});

check("an existing account is never overwritten", () => {
    const plan = planAdmin({ ...base, emailTaken: true, password: "LongEnough1" });
    assert.equal(plan.action, "skip");
    assert.match(plan.action === "skip" ? plan.reason : "", /left untouched/);
});

check("an existing admin is not replaced when no password is given", () => {
    const plan = planAdmin({ ...base, existingAdminHolders: 2 });
    assert.equal(plan.action, "skip", "a second admin is optional, not mandatory");
    assert.match(plan.action === "skip" ? plan.reason : "", /already exists/);
});

check("a short password is rejected", () => {
    assert.throws(() => planAdmin({ ...base, password: "short" }), /at least 8 characters/);
});

check("a missing ADMIN role is a clear error", () => {
    assert.throws(() => planAdmin({ ...base, roleExists: false, password: "LongEnough1" }), /ADMIN role/);
});

console.log("bootstrap reference dataset");

check("the sample data is internally consistent", () => {
    assert.equal(HOSPITAL.organizationId, "MEDISTRA-MAIN");
    assert.equal(HOSPITAL.branchType, "MAIN");

    const codes = DEPARTMENTS.map((d) => d.code);
    assert.equal(new Set(codes).size, codes.length, "department codes must be unique");
    const desigCodes = DESIGNATIONS.map((d) => d.code);
    assert.equal(new Set(desigCodes).size, desigCodes.length, "designation codes must be unique");

    const categoryNames = new Set<string>(MEDICINE_CATEGORIES.map((c) => c.name));
    for (const medicine of starterMedicines()) {
        assert.ok(
            categoryNames.has(medicine.category as string),
            `${medicine.name} references unknown category ${medicine.category}`
        );
    }
});

check("sample medicines expire in the future", () => {
    for (const medicine of starterMedicines()) {
        const expiry = medicine.expiryDate as Date;
        assert.ok(expiry instanceof Date && expiry.getTime() > Date.now(), `${medicine.name} is already expired`);
    }
});

console.log(`\n${passed} passed`);