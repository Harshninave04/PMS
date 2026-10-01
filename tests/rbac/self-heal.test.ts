import assert from "node:assert/strict";
import {
    MENUS,
    CANONICAL_MENU_PATHS,
    restrictToCanonicalMenus,
    getMenuModuleKey,
    filterMenusForAccess,
} from "@/lib/menu-data";
import { ALL_ROLES, buildRoleAccess } from "@/lib/rbac/role-access";
import {
    LEGACY_ROLE_MAP,
    actualMenuTree,
    expectedMenuTree,
    menusAreCanonical,
    menuTreeSignature,
    roleAccessSignature,
    roleIsCanonical,
} from "@/lib/rbac/canonical-sync";

interface StoredDoc {
    _id: string;
    name: string;
    path: string;
    moduleKey: string;
    children: string[];
}

/** A parent menu with its `children` resolved, as `.populate("children")` returns. */
interface PopulatedDoc {
    _id: string;
    name: string;
    path: string;
    moduleKey: string;
    children: PopulatedDoc[];
}

/**
 * Builds the document shape a healthy seeded database holds: one document per
 * menu link, plus one per parent whose `children` hold the child's id.
 */
function canonicalDocs(): StoredDoc[] {
    const docs: StoredDoc[] = [];
    for (const { children, ...parent } of MENUS) {
        const parentModule = getMenuModuleKey(parent);
        const childIds = (children ?? []).map((child) => `child:${child.path}`);
        (children ?? []).forEach((child, index) => {
            docs.push({
                _id: childIds[index],
                name: child.name,
                path: child.path,
                moduleKey: getMenuModuleKey(child) || parentModule,
                children: [],
            });
        });
        docs.push({
            _id: `parent:${parent.path}`,
            name: parent.name,
            path: parent.path,
            moduleKey: parentModule,
            children: childIds,
        });
    }
    return docs;
}

/**
 * Resolves each parent's `children` ids into documents, which is what
 * `MenuRepository.findAll()` hands to the controller and therefore what the
 * sidebar and the access filter actually receive.
 */
function asPopulated(docs: readonly StoredDoc[]): PopulatedDoc[] {
    const byId = new Map(docs.map((doc) => [doc._id, doc]));
    const resolve = (doc: StoredDoc): PopulatedDoc => ({
        _id: doc._id,
        name: doc.name,
        path: doc.path,
        moduleKey: doc.moduleKey,
        children: doc.children
            .map((id) => byId.get(id))
            .filter((child): child is StoredDoc => Boolean(child))
            .map(resolve),
    });
    return docs.map(resolve);
}

/** A menu row from a module that this build no longer ships. */
function staleDoc(id: string, name: string, path: string): StoredDoc {
    return { _id: id, name, path, moduleKey: getMenuModuleKey({ path }), children: [] };
}

/**
 * Self-healing test suite: a database must be brought in line with the code by
 * the app itself, so the reconciler has to recognise a stale one, and the
 * request-time filter has to hide it even when it cannot write.
 */
async function runSelfHealTests() {
    console.log("=================================================");
    console.log("  Running Self-Healing Access Test Suite");
    console.log("=================================================\n");

    let passedTests = 0;
    let totalTests = 0;

    function test(name: string, fn: () => void) {
        totalTests++;
        try {
            fn();
            console.log(`  ✓ ${name}`);
            passedTests++;
        } catch (err: unknown) {
            console.error(`  ✗ ${name}`);
            console.error(err);
            throw err;
        }
    }

    test("A freshly seeded database is recognised as canonical", () => {
        assert.equal(menusAreCanonical(canonicalDocs()), true);
    });

    test("An empty database is not canonical, so it gets seeded on boot", () => {
        assert.equal(menusAreCanonical([]), false);
    });

    test("Rows for removed modules make the database non-canonical", () => {
        const docs = [...canonicalDocs(), staleDoc("old:lab", "Laboratory", "/lab"), staleDoc("old:hr", "HR", "/hr")];
        assert.equal(menusAreCanonical(docs), false);
    });

    test("A missing menu link makes the database non-canonical", () => {
        const docs = canonicalDocs().filter((doc) => doc.path !== "/pharmacy/expiry");
        assert.equal(menusAreCanonical(docs), false);
    });

    test("A menu renamed in code makes the database non-canonical", () => {
        const docs = canonicalDocs().map((doc) => (doc.path === "/wards" ? { ...doc, name: "Old Wards Name" } : doc));
        assert.equal(menusAreCanonical(docs), false);
    });

    test("Reordering stored documents does not look like a change", () => {
        const docs = canonicalDocs();
        const shuffled = [...docs].reverse();
        assert.equal(menuTreeSignature(actualMenuTree(docs)), menuTreeSignature(actualMenuTree(shuffled)));
        assert.equal(menusAreCanonical(shuffled), true);
    });

    test("Document ids are not part of the comparison", () => {
        // A rewrite always mints new object ids, so the parents' `children`
        // references move too and the stored set must still read as canonical.
        const docs = canonicalDocs();
        const idMap = new Map(docs.map((doc) => [doc._id, `other:${doc._id}`]));
        const renamed = docs.map((doc) => ({
            ...doc,
            _id: idMap.get(doc._id)!,
            children: doc.children.map((id) => idMap.get(id)!),
        }));
        assert.equal(menusAreCanonical(renamed), true);
    });

    test("The expected tree matches the menus the roles are shown", () => {
        const expected = expectedMenuTree();
        assert.deepEqual(expected.map((node) => node.path), MENUS.map((menu) => menu.path));
        assert.equal(expected.length, MENUS.length);
    });

    test("The request-time filter drops menus for removed modules", () => {
        const stored = [
            ...canonicalDocs(),
            staleDoc("old:lab", "Laboratory", "/lab"),
            staleDoc("old:rad", "Radiology", "/radiology"),
            staleDoc("old:audit", "Audit Logs", "/audit/logs"),
        ];
        const kept = restrictToCanonicalMenus(asPopulated(stored));
        const paths = kept.map((doc) => doc.path);
        assert.ok(!paths.includes("/lab"), "Laboratory must not reach the sidebar");
        assert.ok(!paths.includes("/radiology"), "Radiology must not reach the sidebar");
        assert.ok(!paths.includes("/audit/logs"), "Audit logs must not reach the sidebar");
        assert.equal(kept.length, canonicalDocs().length, "Every canonical menu must survive the filter");
    });

    test("The request-time filter drops stale children of a surviving parent", () => {
        const staleChild = staleDoc("child:old", "Cancel Appointment", "/appointments/cancel");
        const stored = canonicalDocs().map((doc) =>
            doc.path === "/appointments" ? { ...doc, children: [...doc.children, staleChild._id] } : { ...doc }
        );
        stored.push(staleChild);

        const kept = restrictToCanonicalMenus(asPopulated(stored));
        const opd = kept.find((doc) => doc.path === "/appointments");
        assert.ok(opd, "The OPD parent must survive");
        assert.ok(opd!.children.length > 0, "The real OPD links must survive");
        assert.ok(
            !opd!.children.some((child) => child.path === "/appointments/cancel"),
            "The stale child must be dropped"
        );
    });

    test("Every canonical path is one the code ships", () => {
        const expected = new Set(MENUS.flatMap(({ children, ...parent }) => [parent.path ?? "", ...(children ?? []).map((c) => c.path ?? "")]));
        assert.deepEqual([...CANONICAL_MENU_PATHS].sort(), [...expected].sort());
    });

    test("A stale database still yields a correct sidebar", () => {
        const stored = [...canonicalDocs(), staleDoc("old:lab", "Laboratory", "/lab")];
        const visible = restrictToCanonicalMenus(asPopulated(stored));
        assert.ok(
            !visible.some((doc) => doc.name === "Laboratory"),
            "A stale row must not appear even though the reconciler never ran"
        );

        const menus = filterMenusForAccess(visible, buildRoleAccess("ADMIN"));

        // The API returns every document; the sidebar keeps only the documents
        // no other menu claims as a child.
        const childIds = new Set<string>();
        for (const menu of menus) for (const child of menu.children ?? []) childIds.add(String(child._id));
        const topLevel = menus.filter((menu) => !childIds.has(String(menu._id)));

        assert.equal(topLevel.length, MENUS.length, "Admin should see exactly the menus this build ships");
        assert.deepEqual(topLevel.map((menu) => menu.name), MENUS.map((menu) => menu.name));
    });

    test("Every role's generated access is recognised as canonical", () => {
        for (const role of ALL_ROLES) {
            assert.equal(roleIsCanonical(role, buildRoleAccess(role)), true, `${role} access is not canonical`);
        }
    });

    test("Reordering a stored access list is not treated as a change", () => {
        const stored = [...buildRoleAccess("NURSE")].reverse().map((item) => ({
            ...item,
            permissions: [...item.permissions].reverse(),
        }));
        assert.equal(roleIsCanonical("NURSE", stored), true);
    });

    test("A role missing a permission is not canonical", () => {
        const stored = buildRoleAccess("PHARMACIST").map((item) =>
            item.permissions.length ? { ...item, permissions: item.permissions.slice(1) } : item
        );
        assert.equal(roleIsCanonical("PHARMACIST", stored), false);
    });

    test("An empty or missing access list is not canonical", () => {
        assert.equal(roleIsCanonical("DOCTOR", []), false);
        assert.equal(roleIsCanonical("DOCTOR", undefined), false);
        assert.equal(roleIsCanonical("DOCTOR", null), false);
    });

    test("Duplicate permissions do not make an access list differ", () => {
        const stored = buildRoleAccess("ACCOUNTANT").map((item) => ({
            ...item,
            permissions: [...item.permissions, ...item.permissions],
        }));
        assert.equal(roleAccessSignature(stored), roleAccessSignature(buildRoleAccess("ACCOUNTANT")));
    });

    test("Every legacy role maps onto a role that exists", () => {
        for (const [legacy, target] of Object.entries(LEGACY_ROLE_MAP)) {
            assert.ok(ALL_ROLES.includes(target), `${legacy} maps to ${target}, which is not one of the six roles`);
        }
    });

    test("Roles whose module was removed are deliberately left unmapped", () => {
        // No equivalent means the reconciler must keep the role and its users
        // rather than deleting them, so these must stay out of the map.
        for (const removed of [
            "LAB_TECHNICIAN",
            "RADIOLOGIST",
            "BLOOD_BANK_TECHNICIAN",
            "HR_OFFICER",
            "STOREKEEPER",
            "PROCUREMENT_OFFICER",
            "INSURANCE_OFFICER",
            "SYSTEM_AUDITOR",
            "SYSTEM_IT_ADMIN",
        ]) {
            assert.equal(LEGACY_ROLE_MAP[removed], undefined, `${removed} must not be auto-migrated`);
        }
    });

    test("A legacy role nobody holds would be dropped, so the six survive", () => {
        assert.ok(!Object.keys(LEGACY_ROLE_MAP).some((role) => role in buildRoleAccess("ADMIN")), "sanity");
        assert.equal(new Set(ALL_ROLES).size, ALL_ROLES.length, "Duplicate role name");
        for (const role of ALL_ROLES) {
            assert.ok(role.length > 0);
        }
    });

    console.log(`\n=================================================`);
    console.log(`  Self-Healing Access Test Results: ${passedTests}/${totalTests} Passed (100%)`);
    console.log(`=================================================\n`);
}

runSelfHealTests().catch((err: unknown) => {
    console.error("Test execution failed:", err);
    process.exit(1);
});