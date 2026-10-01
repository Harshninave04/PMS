/**
 * Runs once when the Next.js server starts, before it takes traffic.
 *
 * The database is installed once and outlives any single build, so it can hold
 * roles and menus that this build no longer ships. Reconciling here means a new
 * install — or an upgrade over an old one — needs no migration command: the app
 * brings its own access data up to date on the way up.
 *
 * See `src/lib/rbac/canonical-sync.ts`; it never deletes a user, only writes
 * when the database disagrees with the code, and swallows its own failures so a
 * slow or read-only database cannot stop the server booting.
 */
export async function register() {
    if (process.env.NEXT_RUNTIME !== "nodejs") return;

    const { reconcileCanonicalAccess } = await import("@/lib/rbac/canonical-sync");
    const report = await reconcileCanonicalAccess({
        log: (message) => console.log(`[access] ${message}`),
    });

    const changed =
        report.menus !== "unchanged" ||
        report.rolesCreated.length > 0 ||
        report.rolesRefreshed.length > 0 ||
        report.legacyRolesDeleted.length > 0 ||
        report.usersMoved > 0 ||
        report.usersAttachedToHospital > 0;

    console.log(
        changed
            ? `[access] roles and menus reconciled with the database in ${report.durationMs}ms`
            : `[access] roles and menus already up to date (${report.durationMs}ms)`
    );
}