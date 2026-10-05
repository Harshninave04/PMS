import React from "react";
import { getServerSession } from "next-auth";
import { headers } from "next/headers";
import { forbidden } from "next/navigation";
import MasterLayout from "@/components/layout/master-layout";
import {
  PermissionsProvider,
  type PermissionSnapshot,
} from "@/components/permissions/permission-context";
import { authOptions } from "@/lib/auth";
import { resolveRequestIdentity } from "@/lib/rbac/guard";
import { currentPermissionEpoch } from "@/lib/rbac/audit";
import { isPublicPage, permissionsForPage } from "@/lib/rbac/permissions.config";
import { PATHNAME_HEADER, canOpenPage } from "@/lib/rbac/page-guard";

/**
 * Every dashboard page passes through here, so this is where "hidden in the
 * sidebar" becomes "refused at the door".
 *
 * The role is read from the database on each request — never from the session
 * token — so a permission an administrator just saved applies to the very next
 * page load, with no cache to bust and no re-login. A page whose sections the
 * role cannot open answers 403 and renders `forbidden.tsx`; the API routes for
 * those same sections answer 403 independently, so editing the client bundle
 * grants nothing either.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = (await headers()).get(PATHNAME_HEADER) ?? "";
  const required = permissionsForPage(pathname);
  const publicPage = isPublicPage(pathname);
  if (!required.length && !publicPage) forbidden();

  // The snapshot is resolved on the server so the sidebar and every `<Can>`
  // render with the right permissions on first paint, with no client fetch and
  // no flash of controls the user is not allowed to use.
  const resolved = await resolveRequestIdentity().catch(() => null);
  const identity = resolved && "identity" in resolved ? resolved.identity : null;
  const session = identity ? null : await getServerSession(authOptions);

  if (identity && !canOpenPage(required, identity.permissions, publicPage)) forbidden();

  const snapshot: PermissionSnapshot = {
    subItem: identity?.permissions.subItem ?? session?.user?.permissions ?? [],
    legacy: identity?.permissions.legacy ?? [],
    epoch: currentPermissionEpoch(),
  };

  return (
    <PermissionsProvider
      snapshot={snapshot}
      isSuperAdmin={identity?.permissions.isSuperAdmin ?? session?.user?.roleName === "ADMIN"}
      roleName={identity?.roleName ?? session?.user?.roleName ?? null}
    >
      <MasterLayout>{children}</MasterLayout>
    </PermissionsProvider>
  );
}
