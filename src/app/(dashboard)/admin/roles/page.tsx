"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { Can } from "@/components/permissions/can";
import { Shield, Pencil, Check, Lock, Users } from "lucide-react";
import Link from "next/link";
import { ALL_ROLES, ROLE_LABELS } from "@/lib/rbac/roles";

interface SummaryModule {
  key: string;
  label: string;
  subItems: { key: string; label: string; actions: string[] }[];
}

interface RoleItem {
  _id: string;
  role: string;
  description: string;
  isSystem: boolean;
  isSuperAdmin: boolean;
  canEdit?: boolean;
  userCount: number;
  permissionCount: number;
  summary: { modules: SummaryModule[]; permissionCount: number; moduleCount: number };
}

const UPDATE_PERMISSION = "admin.roles:update";

export default function ManageRolesPage() {
  const { toast } = useToast();
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const fetchRoles = useCallback(async () => {
    try {
      const res = await fetch("/api/role/admin");
      const json = await res.json();
      if (json.success) setRoles(json.data || []);
      else toast(json.message || "Failed to load roles", "error");
    } catch {
      toast("Failed to load roles", "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchRoles();
  }, [fetchRoles]);

  // Only the six roles this system supports are shown. Roles left over from
  // earlier versions still exist in the database and may still be held by staff,
  // but they are out of scope here: they are neither listed nor editable, and
  // their rows are left exactly as they are.
  const scoped = roles.filter((role) => ALL_ROLES.includes(role.role));

  const visible = scoped.filter((role) => {
    if (!search.trim()) return true;
    const needle = search.trim().toLowerCase();
    return (
      role.role.toLowerCase().includes(needle) ||
      (ROLE_LABELS[role.role] ?? "").toLowerCase().includes(needle) ||
      role.description.toLowerCase().includes(needle)
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Roles &amp; Permissions
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Each staff login has one role. Permissions are granted per sidebar sub-item and enforced by
            the API, not just the menu.
          </p>
        </div>
      </div>

      <Card className="border-slate-200/80 dark:border-slate-800 shadow-xl">
        <CardHeader className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                <Shield className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-base">Roles</CardTitle>
                <CardDescription>
                  {scoped.length} role{scoped.length !== 1 ? "s" : ""}
                </CardDescription>
              </div>
            </div>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search roles…"
              className="h-9 w-full sm:w-64"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-3 p-8">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-12 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800/50" />
              ))}
            </div>
          ) : visible.length === 0 ? (
            <div className="p-12 text-center">
              <Shield className="mx-auto mb-3 h-10 w-10 text-slate-300 dark:text-slate-600" />
              <p className="text-sm text-slate-500">No roles match that search</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Role</TableHead>
                  <TableHead className="text-center">Users</TableHead>
                  <TableHead>Sub-items granted</TableHead>
                  <TableHead className="text-right">Edit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((role) => {
                  const isExpanded = expanded === role._id;
                  return (
                    <>
                      <TableRow key={role._id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-900 dark:text-white">
                              {ROLE_LABELS[role.role] ?? role.role}
                            </span>
                            {role.isSystem && (
                              <Badge variant="outline" className="gap-1 text-[10px]">
                                <Lock className="h-2.5 w-2.5" /> System
                              </Badge>
                            )}
                          </div>
                          {role.description && (
                            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                              {role.description}
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="inline-flex items-center gap-1 text-sm">
                            <Users className="h-3.5 w-3.5 text-slate-400" />
                            {role.userCount}
                          </span>
                        </TableCell>
                        <TableCell>
                          {role.isSuperAdmin ? (
                            <Badge className="gap-1 text-[10px]">
                              <Check className="h-3 w-3" /> Everything
                            </Badge>
                          ) : (
                            <button
                              onClick={() => setExpanded(isExpanded ? null : role._id)}
                              className="flex flex-wrap items-center gap-1 text-left"
                            >
                              <Badge
                                variant="outline"
                                className="bg-slate-50 text-[10px] dark:bg-slate-900"
                              >
                                {role.summary.moduleCount} modules
                              </Badge>
                              <Badge
                                variant="outline"
                                className="bg-slate-50 text-[10px] dark:bg-slate-900"
                              >
                                {role.permissionCount} permissions
                              </Badge>
                              <span className="text-[10px] text-slate-400">
                                {isExpanded ? "hide" : "details"}
                              </span>
                            </button>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {!role.isSuperAdmin && (
                            <Can permission={UPDATE_PERMISSION}>
                              <Link
                                href={`/admin/roles/${role._id}/permissions`}
                                title={
                                  role.canEdit === false
                                    ? "You cannot edit your own role"
                                    : "Edit Permissions"
                                }
                              >
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-slate-500 hover:text-emerald-600"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                              </Link>
                            </Can>
                          )}
                        </TableCell>
                      </TableRow>
                      {isExpanded && !role.isSuperAdmin && (
                        <TableRow key={`${role._id}-detail`}>
                          <TableCell colSpan={4} className="bg-slate-50/60 dark:bg-slate-900/40">
                            <div className="grid gap-4 py-2 md:grid-cols-2 xl:grid-cols-3">
                              {role.summary.modules.map((module) => (
                                <div key={module.key}>
                                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                                    {module.label}
                                  </p>
                                  <ul className="space-y-0.5">
                                    {module.subItems.map((subItem) => (
                                      <li
                                        key={subItem.key}
                                        className="flex items-center justify-between gap-2 text-xs"
                                      >
                                        <span className="text-slate-700 dark:text-slate-300">
                                          {subItem.label}
                                        </span>
                                        <span className="text-[10px] text-slate-400">
                                          {subItem.actions.join(", ")}
                                        </span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              ))}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}