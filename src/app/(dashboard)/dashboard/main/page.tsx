"use client";

import React from "react";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { ArrowUpRight, LayoutDashboard, ShieldCheck, TrendingUp } from "lucide-react";
import Link from "next/link";
import {
  DashboardStat,
  resolveDashboardProfile
} from "@/lib/rbac/dashboard-profiles";

interface DashboardStats {
  totalPatients?: number;
  totalDoctors?: number;
  totalAppointments?: number;
  todayAppointments?: number;
  occupiedBeds?: number;
  totalBeds?: number;
  recentPatients?: {
    name: string;
    id: string;
    doctor: string;
    status: string;
    time: string;
  }[];
}

type LoadState = "loading" | "ready" | "error";

function formatStatValue(stat: DashboardStat, data: DashboardStats): string {
  if (stat.kind === "metric") {
    const value = data[stat.metric];
    return typeof value === "number" ? value.toString() : "0";
  }

  const left = data[stat.left] ?? 0;
  const right = data[stat.right] ?? 0;
  return `${left}${stat.leftSuffix ?? ""}${stat.rightPrefix ?? " / "}${right}`;
}

function formatStatHint(stat: DashboardStat, data: DashboardStats): string {
  if (stat.kind === "composite") {
    const total = data[stat.right] ?? 0;
    const occupied = data[stat.left] ?? 0;
    if (total > 0) {
      return `${Math.round((occupied / total) * 100)}% capacity`;
    }
  }
  return stat.hint;
}

export default function DashboardPage() {
  const { data: session, status: sessionStatus } = useSession();
  const roleName = session?.user?.roleName ?? null;
  const profile = React.useMemo(() => resolveDashboardProfile(roleName), [roleName]);

  const [liveData, setLiveData] = React.useState<DashboardStats | null>(null);
  const [loadState, setLoadState] = React.useState<LoadState>("loading");

  React.useEffect(() => {
    if (sessionStatus !== "authenticated") return;

    let cancelled = false;

    fetch("/api/dashboard/stats")
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok || !json.success) {
          throw new Error(json?.message || `Request failed with status ${res.status}`);
        }
        return json;
      })
      .then((json) => {
        if (cancelled) return;
        setLiveData(json.data);
        setLoadState("ready");
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("Failed to load dashboard stats", err);
        setLoadState("error");
      });

    return () => {
      cancelled = true;
    };
  }, [sessionStatus]);

  const effectiveState: LoadState =
    sessionStatus === "unauthenticated" ? "error" : loadState;
  const isLoading = effectiveState === "loading";
  const data = liveData ?? {};
  const recentPatients = liveData?.recentPatients ?? [];

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-6 sm:p-8 shadow-sm">
        <div className="absolute top-0 right-0 -mr-16 -mt-16 h-64 w-64 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200/70 dark:border-emerald-500/20 mb-3">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              {profile.label}
              {roleName ? ` · ${roleName.replace(/_/g, " ")}` : ""}
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              Welcome back,{" "}
              <span className="text-emerald-600 dark:text-emerald-400">
                {session?.user?.name || "User"}
              </span>
            </h1>
            <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400 max-w-xl">
              {profile.subtitle}
            </p>
            {effectiveState === "error" && (
              <p className="mt-2 text-xs font-medium text-amber-600 dark:text-amber-400">
                Live metrics are unavailable for your role. Values shown are placeholders.
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            {profile.moduleDashboard && (
              <Link
                href={profile.moduleDashboard}
                className={buttonVariants({
                  className:
                    "bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-700 dark:hover:bg-slate-600 font-medium shadow-sm gap-2"
                })}
              >
                <LayoutDashboard className="h-4 w-4" />
                Open {profile.label} Board
              </Link>
            )}
            <Button className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium shadow-sm gap-2">
              <TrendingUp className="h-4 w-4" />
              System Status: Active
            </Button>
          </div>
        </div>
      </div>

      {/* Role-specific KPI Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {profile.stats.map((stat, idx) => {
          const Icon = stat.icon;
          return (
            <Card key={idx} className="border-slate-200/80 dark:border-slate-800 transition-all hover:shadow-lg">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    {stat.title}
                  </span>
                  <div className={`flex h-10 w-10 items-center justify-center rounded-xl border ${stat.color}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                </div>
                <div className="mt-3 flex items-baseline justify-between">
                  <span className="text-2xl font-bold text-slate-900 dark:text-white">
                    {isLoading ? (
                      <span className="animate-pulse bg-slate-200 dark:bg-slate-700 h-8 w-16 rounded inline-block" />
                    ) : (
                      formatStatValue(stat, data)
                    )}
                  </span>
                  <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-0.5">
                    <TrendingUp className="h-3 w-3" />
                    {isLoading ? "Loading" : formatStatHint(stat, data)}
                  </span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Role-specific Quick Actions */}
      <div>
        <h2 className="text-base font-bold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
          Quick Actions
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {profile.quickActions.map((action, idx) => {
            const Icon = action.icon;
            return (
              <Link key={idx} href={action.href}>
                <div className={`flex items-center justify-between p-4 rounded-xl font-medium text-sm transition-all shadow-md hover:scale-[1.01] ${action.color}`}>
                  <div className="flex items-center gap-3">
                    <Icon className="h-5 w-5" />
                    <span>{action.title}</span>
                  </div>
                  <ArrowUpRight className="h-4 w-4 opacity-70" />
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Role-specific Recent Activity Table */}
      {profile.showRecentPatients && (
        <Card className="border-slate-200/80 dark:border-slate-800">
          <CardHeader className="flex flex-row items-center justify-between pb-4">
            <div>
              <CardTitle className="text-lg font-bold">Recent Patient Admissions</CardTitle>
              <CardDescription>Live updates from the admission desk</CardDescription>
            </div>
            <Link
              href="/admissions/current"
              className={buttonVariants({ variant: "outline", size: "sm", className: "text-xs" })}
            >
              View All
            </Link>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              {isLoading ? (
                <div className="space-y-2 py-4">
                  {Array.from({ length: 4 }).map((_, idx) => (
                    <div
                      key={idx}
                      className="animate-pulse bg-slate-200 dark:bg-slate-700 h-9 w-full rounded"
                    />
                  ))}
                </div>
              ) : recentPatients.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">
                  No recent admissions to display.
                </p>
              ) : (
                <table className="w-full text-left text-sm text-slate-600 dark:text-slate-400">
                  <thead className="border-b border-slate-200 text-xs uppercase font-semibold text-slate-400 dark:border-slate-800">
                    <tr>
                      <th className="py-3 px-4">Patient Name</th>
                      <th className="py-3 px-4">Patient ID</th>
                      <th className="py-3 px-4">Assigned Doctor</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {recentPatients.map((patient, idx) => (
                      <tr
                        key={idx}
                        className="hover:bg-slate-50/50 dark:hover:bg-slate-900/50 transition-colors"
                      >
                        <td className="py-3 px-4 font-semibold text-slate-900 dark:text-slate-100">
                          {patient.name}
                        </td>
                        <td className="py-3 px-4 font-mono text-xs text-slate-500">
                          {patient.id}
                        </td>
                        <td className="py-3 px-4">{patient.doctor}</td>
                        <td className="py-3 px-4">
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                              patient.status === "ICU"
                                ? "bg-red-500/10 text-red-600 dark:text-red-400"
                                : patient.status === "Admitted"
                                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                  : patient.status === "Outpatient"
                                    ? "bg-teal-500/10 text-teal-600 dark:text-teal-400"
                                    : "bg-slate-500/10 text-slate-600 dark:text-slate-400"
                            }`}
                          >
                            {patient.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right text-xs text-slate-400">
                          {patient.time}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
