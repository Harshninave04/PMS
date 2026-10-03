import React from "react";
import { getServerSession } from "next-auth";
import MasterLayout from "@/components/layout/master-layout";
import {
  PermissionsProvider,
  type PermissionSnapshot,
} from "@/components/permissions/permission-context";
import { authOptions } from "@/lib/auth";
import { resolveRequestIdentity } from "@/lib/rbac/guard";
import { currentPermissionEpoch } from "@/lib/rbac/audit";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // The snapshot is resolved on the server so the sidebar and every `<Can>`
  // render with the right permissions on first paint, with no client fetch and
  // no flash of controls the user is not allowed to use. The API still
  // re-reads the role on every guarded request, so an edit applies immediately.
  const resolved = await resolveRequestIdentity().catch(() => null);
  const identity = resolved && "identity" in resolved ? resolved.identity : null;
  const session = identity ? null : await getServerSession(authOptions);

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