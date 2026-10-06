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
  Droplet,
  FolderOpen,
  RefreshCw,
  Plus,
  Loader2
} from "lucide-react";
import { ModuleNavCards } from "@/components/layout/module-nav-cards";

interface Bucket {
  _id: string | number;
  count: number;
}

interface PatientStats {
  totalPatients: number;
  activePatients: number;
  mergedPatients: number;
  genderStats: Bucket[];
  bloodStats: Bucket[];
  ageStats: Bucket[];
}

export default function PatientRegistryHubPage() {
  const router = useRouter();
  const { toast } = useToast();

  const [stats, setStats] = useState<PatientStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchStats = async () => {
    try {
      const res = await fetch("/api/patient/reports");
      const data = await res.json();
      if (data.success && data.data) {
        setStats(data.data);
      } else {
        toast(data.message || "Failed to load patient statistics", "error");
      }
    } catch {
      toast("Error loading patient metrics", "error");
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

  const mergedInto = stats?.totalPatients ?? 0;
  const mergedPct = mergedInto > 0 ? Math.round(((stats?.mergedPatients ?? 0) / mergedInto) * 100) : 0;

  const maxGender = Math.max(1, ...(stats?.genderStats ?? []).map((g) => g.count));
  const maxAge = Math.max(1, ...(stats?.ageStats ?? []).map((a) => a.count));
  const activePct =
    mergedInto > 0 ? Math.round(((stats?.activePatients ?? 0) / mergedInto) * 100) : 0;

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <Users className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
            Patient Registry Hub
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Registration, demographics, UHID history, and the documents attached to each patient record.
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
            onClick={() => router.push("/patients/register")}
          >
            <Plus className="h-4 w-4" />
            Register Patient
          </Button>
        </div>
      </div>

      {/* Primary KPI Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-xl border bg-white dark:bg-slate-900 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-medium">Total Patients</span>
            <Users className="h-4 w-4 text-blue-500" />
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white mt-2">
            {mergedInto.toLocaleString()}
          </div>
          <div className="text-[10px] text-slate-400 mt-1">Registered in your scope</div>
        </div>

        <div className="p-3.5 rounded-xl border bg-white dark:bg-slate-900 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-medium">Active</span>
            <UserCheck className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-2">
            {(stats?.activePatients ?? 0).toLocaleString()}
          </div>
          <div className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-1">{activePct}% of registry</div>
        </div>

        <div className="p-3.5 rounded-xl border bg-white dark:bg-slate-900 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-medium">Merged</span>
            <FolderOpen className="h-4 w-4 text-amber-500" />
          </div>
          <div className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-2">
            {stats?.mergedPatients ?? 0}
          </div>
          <div className="text-[10px] text-slate-400 mt-1">{mergedPct}% linked duplicates</div>
        </div>

        <div className="p-3.5 rounded-xl border bg-white dark:bg-slate-900 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-medium">Blood Groups</span>
            <Droplet className="h-4 w-4 text-rose-500" />
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white mt-2">
            {stats?.bloodStats?.length ?? 0}
          </div>
          <div className="text-[10px] text-slate-400 mt-1">Distinct groups on record</div>
        </div>
      </div>

      {/* Submodule Navigation */}
      <ModuleNavCards
        modulePath="/patients"
        title="Patient Management Submodules"
        subtitle="Registration, directory lookup, individual profiles, and document storage"
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Gender distribution */}
        <Card className="border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Gender Distribution</CardTitle>
            <CardDescription>Breakdown of the active patient registry.</CardDescription>
          </CardHeader>
          <CardContent>
            {(!stats?.genderStats || stats.genderStats.length === 0) ? (
              <p className="text-center text-slate-500 py-10 text-xs">No patient records found.</p>
            ) : (
              <div className="space-y-3">
                {stats.genderStats.map((g) => (
                  <div key={String(g._id)} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-700 dark:text-slate-300">
                        {g._id ? String(g._id).toUpperCase() : "UNSPECIFIED"}
                      </span>
                      <span className="font-mono text-slate-500">{g.count}</span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                        style={{ width: `${Math.round((g.count / maxGender) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Age distribution */}
        <Card className="border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Age Distribution</CardTitle>
            <CardDescription>Patients grouped into standard age bands.</CardDescription>
          </CardHeader>
          <CardContent>
            {(!stats?.ageStats || stats.ageStats.length === 0) ? (
              <p className="text-center text-slate-500 py-10 text-xs">No patient records found.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Age Band</TableHead>
                    <TableHead className="w-1/2">Patients</TableHead>
                    <TableHead className="text-right">Count</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stats.ageStats.map((band) => (
                    <TableRow key={String(band._id)} className="text-xs hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                      <TableCell className="font-medium text-slate-700 dark:text-slate-300">
                        {typeof band._id === "number" ? `${band._id}+` : String(band._id)}
                      </TableCell>
                      <TableCell>
                        <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full bg-blue-500 transition-all duration-300"
                            style={{ width: `${Math.round((band.count / maxAge) * 100)}%` }}
                          />
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono font-semibold">{band.count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Blood groups */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Blood Group Registry</CardTitle>
          <CardDescription>
            Useful for matching donors and emergency transfusion requirements.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {(!stats?.bloodStats || stats.bloodStats.length === 0) ? (
            <p className="text-center text-slate-500 py-8 text-xs">
              No blood group data recorded yet.
            </p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
              {stats.bloodStats.map((b) => (
                <div
                  key={String(b._id)}
                  className="flex flex-col items-center justify-center rounded-xl border bg-white dark:bg-slate-900 p-3"
                >
                  <span className="text-sm font-bold text-rose-600 dark:text-rose-400">
                    {String(b._id).replace(" ", "")}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-mono">
                    {b.count}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
