"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { usePermissions } from "@/components/permissions/permission-context";
import { Lock, Pencil, Search, Shield, Users } from "lucide-react";
import { ALL_ROLES } from "@/lib/rbac/roles";

/**
 * Settings -> Roles & Permissions.
 *
 * One card per role, and nothing else. An administrator opening this page wants
 * to answer two questions — "who can do what?" and "who do I change to widen
 * it?" — so each card carries the role name, one sentence in plain words, how
 * many people hold it, and how much of the system that role can reach.
 *
 * Only the six roles this system ships are listed. The lock badge appears on
 * the Super Admin and nowhere else: every other role, however it was created,
 * is editable by an administrator.
 */

const UPDATE_PERMISSION = "admin.roles:update";

interface RoleCard {
  _id: string;
  role: string;
  label?: string;
  description?: string;
  isSuperAdmin?: boolean;
  canEdit?: boolean;
  lockReason?: string;
  lockMessage?: string;
  userCount: number;
  sectionsAllowed: number;
  sectionsTotal: number;
}

function ProgressBar({ allowed, total }: { allowed: number; total: number }) {
  const pct = total > 0 ? Math.round((allowed / total) * 100) : 0;
  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"
      role="progressbar"
      aria-valuenow={allowed}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-label={`${allowed} of ${total} sections allowed`}
    >
      <div
        className={`h-full rounded-full transition-all ${allowed === 0 ? "bg-slate-300 dark:bg-slate-700" : "bg-emerald-500"}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export default function ManageRolesPage() {
  const { toast } = useToast();
  const { can } = usePermissions();

  const [roles, setRoles] = useState<RoleCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const mayUpdate = can(UPDATE_PERMISSION);

  useEffect(() => {
    // State is set from the response, not from the effect body, so a slow request
    // cannot paint over a newer one.
    let current = true;

    fetch("/api/role/admin")
      .then((res) => res.json())
      .then((json: { success?: boolean; message?: string; data?: RoleCard[] }) => {
        if (!current) return;
        if (json.success) setRoles(json.data || []);
        else toast(json.message || "Could not load roles", "error");
      })
      .catch(() => {
        if (current) toast("Could not load roles", "error");
      })
      .finally(() => {
        if (current) setLoading(false);
      });

    return () => {
      current = false;
    };
  }, [toast]);

  const visible = useMemo(() => {
    const scoped = roles.filter((role) => ALL_ROLES.includes(role.role));
    const needle = search.trim().toLowerCase();
    if (!needle) return scoped;
    return scoped.filter(
      (role) =>
        role.role.toLowerCase().includes(needle) ||
        (role.label ?? "").toLowerCase().includes(needle) ||
        (role.description ?? "").toLowerCase().includes(needle)
    );
  }, [roles, search]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          Roles &amp; Permissions
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Choose what each job in the hospital can see and do. Changes apply as soon as you
          save them — nobody has to log out.
        </p>
      </div>

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search roles"
          aria-label="Search roles"
          className="h-10 pl-9"
        />
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5, 6].map((index) => (
            <div
              key={index}
              className="h-24 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800/50"
            />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 py-16 text-center dark:border-slate-800">
          <Shield className="mx-auto mb-3 h-10 w-10 text-slate-300 dark:text-slate-600" />
          <p className="text-sm text-slate-500">No role matches that search.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((role) => {
            const locked = role.isSuperAdmin === true || role.canEdit === false;
            const selfLocked = locked && role.lockReason === "OWN_ROLE";
            const accessLabel = `${
              role.sectionsAllowed
            } of ${role.sectionsTotal} section${role.sectionsTotal === 1 ? "" : "s"} allowed`;

            return (
              <div
                key={role._id}
                className="rounded-xl border border-slate-200 bg-white p-4 transition-shadow hover:shadow-sm dark:border-slate-800 dark:bg-slate-950"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                        {role.label ?? role.role}
                      </h2>
                      {role.isSuperAdmin ? (
                        <Badge variant="outline" className="gap-1">
                          <Lock className="h-3 w-3" /> Always full access
                        </Badge>
                      ) : null}
                      {selfLocked ? (
                        // Not a lock: this role is editable, just not by you.
                        <Badge variant="outline">Your role</Badge>
                      ) : null}
                    </div>

                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                      {role.description}
                    </p>

                    <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
                      <span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                        <Users className="h-4 w-4 text-slate-400" />
                        {role.userCount} user{role.userCount === 1 ? "" : "s"}
                      </span>
                      <span className="min-w-[10rem] flex-1 text-xs font-medium text-slate-500 dark:text-slate-400">
                        {accessLabel}
                        <span className="mt-1.5 block">
                          <ProgressBar allowed={role.sectionsAllowed} total={role.sectionsTotal} />
                        </span>
                      </span>
                    </div>

                    {locked && role.lockMessage ? (
                      <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                        {role.lockMessage}
                      </p>
                    ) : null}
                  </div>

                  <div className="shrink-0">
                    {role.isSuperAdmin ? (
                      <span className="text-xs text-slate-400">
                        Cannot be changed
                      </span>
                    ) : mayUpdate && !selfLocked ? (
                      <Link href={`/admin/roles/${role._id}/permissions`}>
                        <Button className="gap-2">
                          <Pencil className="h-4 w-4" /> Edit access
                        </Button>
                      </Link>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}