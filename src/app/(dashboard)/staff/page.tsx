"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import {
  Users,
  UserCheck,
  Stethoscope,
  Building2,
  RefreshCw,
  Plus,
  Loader2
} from "lucide-react";
import { ModuleNavCards } from "@/components/layout/module-nav-cards";

interface DepartmentRow {
  departmentId: string;
  departmentName: string;
  staffCount: number;
}

interface StaffStats {
  totalStaff: number;
  activeStaff: number;
  onLeave: number;
  inactive: number;
  totalDoctors: number;
  totalDesignations: number;
  totalDepartments: number;
  departmentBreakdown: DepartmentRow[];
  isUnrestricted: boolean;
}

export default function StaffDirectoryHubPage() {
  const router = useRouter();
  const { toast } = useToast();

  const [stats, setStats] = useState<StaffStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchStats = async () => {
    try {
      const res = await fetch("/api/staff/stats");
      const data = await res.json();
      if (data.success && data.data) {
        setStats(data.data);
      } else {
        toast(data.message || "Failed to load staff statistics", "error");
      }
    } catch {
      toast("Error loading staff metrics", "error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchStats();
  };

  if (loading) {
    return (
      <div className="flex h-[450px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  const activePct =
    stats && stats.totalStaff > 0
      ? Math.round((stats.activeStaff / stats.totalStaff) * 100)
      : 0;

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <Users className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
            Staff &amp; Workforce Hub
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Headcount, department distribution, and the people directory for your hospital.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-1.5"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>

          <Button
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5"
            onClick={() => router.push("/staff/list")}
          >
            <Plus className="h-4 w-4" />
            Manage Staff
          </Button>
        </div>
      </div>

      {/* Primary KPI Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="p-3.5 rounded-xl border bg-white dark:bg-slate-900 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-medium">Total Staff</span>
            <Users className="h-4 w-4 text-blue-500" />
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white mt-2">
            {stats?.totalStaff ?? 0}
          </div>
          <div className="text-[10px] text-slate-400 mt-1">Non-clinical workforce</div>
        </div>

        <div className="p-3.5 rounded-xl border bg-white dark:bg-slate-900 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-medium">Active</span>
            <UserCheck className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-2">
            {stats?.activeStaff ?? 0}
          </div>
          <div className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-1">{activePct}% on duty</div>
        </div>

        <div className="p-3.5 rounded-xl border bg-white dark:bg-slate-900 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-medium">On Leave</span>
            <Users className="h-4 w-4 text-amber-500" />
          </div>
          <div className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-2">
            {stats?.onLeave ?? 0}
          </div>
          <div className="text-[10px] text-slate-400 mt-1">Temporarily absent</div>
        </div>

        <div className="p-3.5 rounded-xl border bg-white dark:bg-slate-900 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-medium">Inactive</span>
            <Users className="h-4 w-4 text-rose-500" />
          </div>
          <div className="text-2xl font-bold text-rose-600 dark:text-rose-400 mt-2">
            {stats?.inactive ?? 0}
          </div>
          <div className="text-[10px] text-slate-400 mt-1">No longer employed</div>
        </div>

        <div className="p-3.5 rounded-xl border bg-white dark:bg-slate-900 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-medium">Doctors</span>
            <Stethoscope className="h-4 w-4 text-purple-500" />
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white mt-2">
            {stats?.totalDoctors ?? 0}
          </div>
          <div className="text-[10px] text-slate-400 mt-1">Separate from staff records</div>
        </div>

        <div className="p-3.5 rounded-xl border bg-white dark:bg-slate-900 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-medium">Departments</span>
            <Building2 className="h-4 w-4 text-indigo-500" />
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white mt-2">
            {stats?.totalDepartments ?? 0}
          </div>
          <div className="text-[10px] text-slate-400 mt-1">{stats?.totalDesignations ?? 0} designations</div>
        </div>
      </div>

      {/* Submodule Navigation */}
      <ModuleNavCards
        modulePath="/staff"
        title="Workforce Submodules"
        subtitle="Doctor and staff registers, departmental structure, and duty scheduling"
      />

      {/* Department distribution */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <CardTitle className="text-base font-semibold">Headcount by Department</CardTitle>
            <CardDescription>
              {stats?.isUnrestricted
                ? "Staff distribution across every department in the hospital."
                : "Staff distribution limited to the departments you have access to."}
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="text-xs text-emerald-600 hover:text-emerald-700"
            onClick={() => router.push("/staff/departments")}
          >
            Manage Departments &rarr;
          </Button>
        </CardHeader>
        <CardContent>
          {!stats?.departmentBreakdown?.length ? (
            <p className="text-center text-slate-500 py-12 text-xs">
              No departments are available to you yet.
            </p>
          ) : (
            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Department</TableHead>
                    <TableHead className="w-1/2">Share of Headcount</TableHead>
                    <TableHead className="text-right">Staff</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stats.departmentBreakdown.map((row) => {
                    const max = Math.max(
                      1,
                      ...stats.departmentBreakdown.map((d) => d.staffCount)
                    );
                    const pct = stats.totalStaff > 0
                      ? Math.round((row.staffCount / stats.totalStaff) * 100)
                      : 0;
                    return (
                      <TableRow
                        key={row.departmentId}
                        className="text-xs hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                      >
                        <TableCell className="font-semibold text-slate-900 dark:text-white">
                          {row.departmentName}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 flex-1 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                                style={{ width: `${Math.round((row.staffCount / max) * 100)}%` }}
                              />
                            </div>
                            <span className="w-10 text-right font-mono text-[11px] text-slate-400">
                              {pct}%
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-mono font-semibold">
                          {row.staffCount}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
