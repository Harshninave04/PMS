/**
 * Patient documents going private.
 *
 * Documents must stop being readable through their permanent public URLs:
 * read links come from GET /api/patient/documents/<id>/url, which is guarded
 * by patients.documents:view plus branch scope, returns a five-minute signed
 * URL for migrated records and still returns the legacy URL for records that
 * have not been migrated. Like the other suites in this folder, the logic is
 * exercised through the same pure functions and filter objects the endpoint
 * and the migration construct — no database required.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { Types } from "mongoose";
import { deriveStorageKeyFromUrl, documentOpenLink, SIGNED_URL_TTL_SECONDS } from "@/lib/document-url";
import { withBranchScope } from "@/lib/rbac/branch-scope";
import { findRouteRule, resolveRoutePath, routeRuleAllows } from "@/lib/rbac/route-permissions";

interface FixtureContext {
    userId: Types.ObjectId;
    email: string;
    name: string;
    roleId: Types.ObjectId;
    roleName: string;
    organizationId?: Types.ObjectId;
    branchId?: Types.ObjectId;
    permissions: Set<string>;
    grants: Map<string, unknown>;
}

interface FixtureGrant {
    permission: string;
    orgScope: "ORGANIZATION" | "BRANCH" | "GLOBAL";
    relScope: "UNRESTRICTED" | "OWN";
}

function actor(options: {
    roleName?: string;
    branchId?: string;
    grants: FixtureGrant[];
}): { context: FixtureContext; grant: FixtureGrant } {
    const grants = new Map<string, unknown>();
    options.grants.forEach((grant) => grants.set(grant.permission, grant));
    const context: FixtureContext = {
        userId: new Types.ObjectId(),
        email: options.roleName ? `${options.roleName.toLowerCase()}@medistra.test` : "user@medistra.test",
        name: options.roleName ?? "User",
        roleId: new Types.ObjectId(),
        roleName: options.roleName ?? "RECEPTIONIST",
        organizationId: new Types.ObjectId(),
        branchId: options.branchId ? new Types.ObjectId(options.branchId) : undefined,
        permissions: new Set(options.grants.map((grant) => grant.permission)),
        grants
    };
    return { context, grant: options.grants[0] };
}

/** Mirrors AuthorizationSuccess enough for the scope helpers. */
function scoped(auth: { context: FixtureContext; grant: FixtureGrant }): {
    context: FixtureContext;
    grant: FixtureGrant;
    filter: Record<string, unknown>;
    isAuthorized: true;
} {
    return { context: auth.context, grant: auth.grant, filter: {}, isAuthorized: true };
}

/** Collects candidate values along a dotted path, fanning out over arrays. */
function valuesAt(record: unknown, segments: string[]): unknown[] {
    if (!segments.length) return [record];
    if (Array.isArray(record)) return record.flatMap((item) => valuesAt(item, segments));
    if (record && typeof record === "object") {
        return valuesAt((record as Record<string, unknown>)[segments[0]], segments.slice(1));
    }
    return [];
}

function equalsCondition(value: unknown, condition: unknown): boolean {
    if (condition instanceof Types.ObjectId) {
        return value instanceof Types.ObjectId ? value.equals(condition) : String(value) === String(condition);
    }
    if (condition === null || typeof condition === "object") {
        if (value === null || typeof value !== "object") return false;
        return value instanceof Types.ObjectId
            ? value.equals(condition as unknown as Types.ObjectId)
            : value === condition;
    }
    return value === condition;
}

/** Minimal in-memory `matchesFilter` for the exact filter objects in play. */
function matchesFilter(record: Record<string, unknown>, filter: Record<string, unknown>): boolean {
    return Object.entries(filter).every(([key, condition]) =>
        valuesAt(record, key.split(".")).some((candidate) => equalsCondition(candidate, condition))
    );
}

const DOC_A_ID = new Types.ObjectId();
const DOC_B_ID = new Types.ObjectId();
const BRANCH_A = new Types.ObjectId();
const BRANCH_B = new Types.ObjectId();

const patientBranchA = {
    _id: new Types.ObjectId(),
    branchId: BRANCH_A,
    documents: [{
        _id: DOC_A_ID,
        title: "Lab",
        fileUrl: "https://legacy.test/a.pdf",
        storageKey: "documents/1_lab.pdf"
    }]
};
const patientBranchB = {
    _id: new Types.ObjectId(),
    branchId: BRANCH_B,
    documents: [{
        _id: DOC_B_ID,
        title: "Scan",
        fileUrl: "https://legacy.test/b.pdf"
    }]
};

function runPatientDocumentUrlTests() {
    console.log("=================================================");
    console.log("  Running Patient Document Private-URL Test Suite");
    console.log("=================================================\n");
    let passed = 0;
    const test = (name: string, body: () => void) => {
        try {
            body();
            passed += 1;
            console.log(`  ✓ ${name}`);
        } catch (error) {
            console.error(`  ✕ ${name}`);
            throw error;
        }
    };

    // ---------------------------------------------------------- key derivation
    test("Key derivation: a Supabase public URL maps to its object key (query string dropped)", () => {
        assert.equal(
            deriveStorageKeyFromUrl("https://db.ref.supabase.co/storage/v1/object/public/medistra-documents/documents/17000000_ct_scan.pdf?token=abc"),
            "documents/17000000_ct_scan.pdf"
        );
    });
    test("Key derivation: signed/authenticated Supabase style also maps", () => {
        assert.equal(
            deriveStorageKeyFromUrl("https://db.ref.supabase.co/storage/v1/object/sign/medistra-documents/documents/report.pdf#fragment"),
            "documents/report.pdf"
        );
    });
    test("Key derivation: virtual-host S3 URLs drop the bucket from the host", () => {
        assert.equal(
            deriveStorageKeyFromUrl("https://medistra-documents.s3.us-east-1.amazonaws.com/patients/99_xray.pdf"),
            "patients/99_xray.pdf"
        );
    });
    test("Key derivation: path-style URLs under the configured bucket map to the remainder", () => {
        assert.equal(
            deriveStorageKeyFromUrl("https://s3.medistra.storage/medistra-documents/patients/42_blood.jpg"),
            "patients/42_blood.jpg"
        );
        assert.equal(
            deriveStorageKeyFromUrl("https://storage.medistra.hospital/medistra-documents/documents/7_discharge.pdf"),
            "documents/7_discharge.pdf"
        );
    });
    test("Key derivation: unknown buckets, junk, and empty input resolve to nothing", () => {
        assert.equal(deriveStorageKeyFromUrl("https://other.example.com/not-our-bucket/a.pdf"), null);
        assert.equal(deriveStorageKeyFromUrl("not a url"), null);
        assert.equal(deriveStorageKeyFromUrl("  "), null);
        assert.equal(deriveStorageKeyFromUrl("https://"), null);
    });

    // ------------------------------------------------------------ open links
    test("A migrated document (storageKey) opens through a short-lived signed link", () => {
        const link = documentOpenLink({ fileUrl: "https://legacy.test/a.pdf", storageKey: " documents/1_lab.pdf " });
        assert.deepEqual(link, { kind: "signed", storageKey: "documents/1_lab.pdf", expiresIn: SIGNED_URL_TTL_SECONDS });
        assert.equal(SIGNED_URL_TTL_SECONDS, 300);
    });
    test("A migrated document honours a custom TTL", () => {
        const link = documentOpenLink({ fileUrl: "https://legacy.test/a.pdf", storageKey: "documents/1_lab.pdf" }, 60);
        assert.deepEqual(link, { kind: "signed", storageKey: "documents/1_lab.pdf", expiresIn: 60 });
    });
    test("A legacy record with only a public URL returns that URL unchanged", () => {
        const link = documentOpenLink({ fileUrl: "https://legacy.test/old-report.pdf" });
        assert.deepEqual(link, { kind: "legacy", url: "https://legacy.test/old-report.pdf" });
    });
    test("A whitespace-only storageKey counts as legacy, not signed", () => {
        const link = documentOpenLink({ fileUrl: "https://legacy.test/b.pdf", storageKey: "   " });
        assert.deepEqual(link, { kind: "legacy", url: "https://legacy.test/b.pdf" });
    });

    // ------------------------------------------------- endpoint authorization
    test("The signed-URL endpoint has an authoritative manifest rule", () => {
        const resolved = resolveRoutePath("/api/patient/documents/65f1c2a3b4c5d6e7f8091234/url");
        assert.equal(resolved, "/patient/documents/[id]/url");
        const rule = findRouteRule(new Request("http://localhost/api/patient/documents/65f1c2a3b4c5d6e7f8091234/url"));
        assert.ok(rule, "GET /patient/documents/[id]/url has no route rule");
        assert.equal(rule.permission, "patients.documents:view");
    });
    test("Without the documents view permission the endpoint denies (403 semantics)", () => {
        const rule = findRouteRule(new Request("http://localhost/api/patient/documents/65f1c2a3b4c5d6e7f8091234/url"));
        assert.ok(rule);
        assert.equal(routeRuleAllows(rule, new Set<string>()), false);
    });
    test("Holding patients.documents:view allows the endpoint read", () => {
        const rule = findRouteRule(new Request("http://localhost/api/patient/documents/65f1c2a3b4c5d6e7f8091234/url"))!;
        assert.equal(routeRuleAllows(rule, new Set(["patients.documents:view"])), true);
    });
    test("Only GET is governed; a POST on the same path has no rule at all", () => {
        const post = findRouteRule(new Request("http://localhost/api/patient/documents/65f1c2a3b4c5d6e7f8091234/url", { method: "POST" }));
        assert.equal(post, null);
    });

    // ------------------------------------------------------- branch scoping
    const receptionistA = actor({
        roleName: "RECEPTIONIST",
        branchId: BRANCH_A.toString(),
        grants: [{ permission: "patients.documents:view", orgScope: "BRANCH", relScope: "UNRESTRICTED" }]
    });
    const managerGlobal = actor({
        roleName: "MANAGER",
        grants: [{ permission: "patients.documents:view", orgScope: "GLOBAL", relScope: "UNRESTRICTED" }]
    });

    test("A branch-confined caller's lookup is scoped by branch inside the query", () => {
        const filter = withBranchScope(scoped(receptionistA), { "documents._id": DOC_A_ID });
        assert.ok(Object.hasOwn(filter, "documents._id"), "the document condition is kept");
        assert.equal(matchesFilter(patientBranchA, filter), true);
    });
    test("A Branch A caller discovers nothing when asking for a Branch B document (404)", () => {
        const filter = withBranchScope(scoped(receptionistA), { "documents._id": DOC_B_ID });
        assert.equal(matchesFilter(patientBranchB, filter), false);
    });
    test("An organization-scope actor keeps the query unconfined and finds both branches", () => {
        const filter = withBranchScope(scoped(managerGlobal), { "documents._id": DOC_B_ID });
        assert.ok(Object.hasOwn(filter, "documents._id"), "organization-scope actor keeps the document condition");
        assert.ok(!Object.hasOwn(filter, "branchId"), "organization-scope actor must not gain a branch key");
        assert.equal(matchesFilter(patientBranchB, filter), true);
    });

    // ---------------------------------------------------------------- wiring
    test("The signed-URL route guards itself with patients.documents:view", () => {
        const source = fs.readFileSync(path.resolve(process.cwd(), "src/app/api/patient/documents/[id]/url/route.ts"), "utf8");
        assert.match(source, /requirePermission\(request,\s*"patients\.documents:view"\)/);
    });
    test("New uploads persist the object-storage key on the document record", () => {
        const uploadRoute = fs.readFileSync(path.resolve(process.cwd(), "src/app/api/upload/route.ts"), "utf8");
        assert.match(uploadRoute, /storageKey:\s*uploadResult\.key/);
        const dto = fs.readFileSync(path.resolve(process.cwd(), "src/dto/patient.dto.ts"), "utf8");
        assert.match(dto, /storageKey\?:\s*string/);
        const patientInterface = fs.readFileSync(path.resolve(process.cwd(), "src/interfaces/patient.interface.ts"), "utf8");
        assert.match(patientInterface, /storageKey\?:\s*string/);
        const model = fs.readFileSync(path.resolve(process.cwd(), "src/models/patient.model.ts"), "utf8");
        assert.match(model, /storageKey:\s*\{\s*type:\s*String\s*\}/);
    });
    test("Buckets are created private and objects are no longer public-read", () => {
        const storage = fs.readFileSync(path.resolve(process.cwd(), "src/lib/storage.ts"), "utf8");
        assert.match(storage, /public:\s*false/);
        assert.doesNotMatch(storage, /ACL:\s*"public-read"/);
    });
    test("The endpoint signs migrated records and passes legacy URLs through unchanged", () => {
        const controller = fs.readFileSync(path.resolve(process.cwd(), "src/controllers/patient.controller.ts"), "utf8");
        assert.match(controller, /storage\.createSignedUrl\(link\.storageKey,\s*link\.expiresIn\)/);
        assert.match(controller, /Legacy document URL returned unchanged until migration/);
        assert.match(controller, /withBranchScope\(auth,\s*\{\s*"documents\._id":\s*docId\s*\}\)/);
    });
    test("The migration script is dry-run by default and only writes with --apply", () => {
        const script = fs.readFileSync(path.resolve(process.cwd(), "scripts/migrate-documents-private.ts"), "utf8");
        assert.match(script, /import\s+\{\s*deriveStorageKeyFromUrl\s*\}\s+from\s+"@\/lib\/document-url"/);
        assert.match(script, /--apply/);
        assert.match(script, /"documents\.\$\.storageKey"/);
        assert.match(script, /DRY RUN/);
        assert.match(script, /APPLY run/);
    });

    console.log("\n=================================================");
    console.log(`  Patient Document Private-URL Tests: ${passed}/21 Passed`);
    console.log("=================================================");
}

runPatientDocumentUrlTests();
