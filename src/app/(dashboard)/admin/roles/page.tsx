"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { Shield, Pencil, Check } from "lucide-react";
import Link from "next/link";
import { ADMIN_ROLE, ROLE_LABELS } from "@/lib/rbac/roles";

interface ModuleAccess {
  moduleName: string;
  permissions: string[];
}

interface RoleItem {
  _id: string;
  role: string;
  access: ModuleAccess[];
}

/** Modules that are pure data lookups and never shown as a menu. */
const HIDDEN_MODULES = new Set(["reference-data", "dashboard"]);

export default function ManageRolesPage() {
  const { toast } = useToast();
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRoles = useCallback(async () => {
    try {
      const res = await fetch("/api/role");
      const json = await res.json();
      if (json.success) setRoles(json.data || []);
    } catch { toast("Failed to load roles", "error"); } finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { fetchRoles(); }, [fetchRoles]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Roles & Permissions</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">Each staff login has one of these roles. Edit a role to change what it can access.</p>
      </div>

      <Card className="border-slate-200/80 dark:border-slate-800 shadow-xl">
        <CardHeader className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"><Shield className="h-5 w-5" /></div>
            <div><CardTitle className="text-base">Roles</CardTitle><CardDescription>{roles.length} role{roles.length !== 1 ? "s" : ""}</CardDescription></div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-12 rounded-lg bg-slate-100 dark:bg-slate-800/50 animate-pulse" />)}</div>
          ) : roles.length === 0 ? (
            <div className="p-12 text-center"><Shield className="h-10 w-10 mx-auto text-slate-300 dark:text-slate-600 mb-3" /><p className="text-sm text-slate-500">No roles found</p></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Role</TableHead>
                  <TableHead>Can Access</TableHead>
                  <TableHead className="text-right">Edit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {roles.map((role) => {
                  const isAdmin = role.role === ADMIN_ROLE;
                  const modules = (role.access ?? []).filter(a => !HIDDEN_MODULES.has(a.moduleName));
                  return (
                    <TableRow key={role._id}>
                      <TableCell className="font-semibold text-slate-900 dark:text-white">{ROLE_LABELS[role.role] ?? role.role}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {isAdmin ? (
                            <Badge variant="default" className="text-[10px]"><Check className="h-3 w-3 mr-1" />Everything</Badge>
                          ) : (
                            modules.map((a) => (
                              <Badge key={a.moduleName} variant="outline" className="text-[10px] bg-slate-50 dark:bg-slate-900">{a.moduleName}</Badge>
                            ))
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        {!isAdmin && (
                          <Link href={`/admin/roles/${role._id}/permissions`}>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-500 hover:text-emerald-600" title="Edit Permissions"><Pencil className="h-3.5 w-3.5" /></Button>
                          </Link>
                        )}
                      </TableCell>
                    </TableRow>
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
