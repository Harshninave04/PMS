"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import {
  CalendarDays,
  Users,
  Hourglass,
  Stethoscope,
  CheckCircle2,
  RefreshCw,
  Plus,
  Loader2
} from "lucide-react";
import { ModuleNavCards } from "@/components/layout/module-nav-cards";

interface QueuePatient {
  _id: string;
  appointmentId?: string;
  tokenNumber?: number | string;
  status?: string;
  scheduledTime?: string;
  patientId?: { name?: string; uhid?: string };
  doctorId?: { name?: string };
}

interface QueueResponse {
  success: boolean;
  error?: string;
  data?: QueuePatient[];
  metrics?: {
    totalToday: number;
    waiting: number;
    inConsultation: number;
    completed: number;
    estimatedWaitTimeMins: number;
  };
}

export default function AppointmentSchedulingHubPage() {
  const router = useRouter();
  const { toast } = useToast();

  const [queue, setQueue] = useState<QueueResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchQueue = async () => {
    try {
      const res = await fetch("/api/appointments/queue");
      const data: QueueResponse = await res.json();
      if (data.success) {
        setQueue(data);
      } else {
        toast(data.error || "Failed to load today's queue", "error");
      }
    } catch {
      toast("Error loading appointment queue", "error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchQueue();
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchQueue();
  };

  if (loading) {
    return (
      <div className="flex h-[450px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  const metrics = queue?.metrics;
  const rows = queue?.data ?? [];
  const seen = new Set<string>();

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <CalendarDays className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
            Appointment Scheduling Hub
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Today's outpatient queue, waiting time, and consultation progress across your clinics.
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
            onClick={() => router.push("/appointments/book")}
          >
            <Plus className="h-4 w-4" />
            Book Appointment
          </Button>
        </div>
      </div>

      {/* Primary KPI Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="p-3.5 rounded-xl border bg-white dark:bg-slate-900 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-medium">Today</span>
            <CalendarDays className="h-4 w-4 text-blue-500" />
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white mt-2">
            {metrics?.totalToday ?? 0}
          </div>
          <div className="text-[10px] text-slate-400 mt-1">Non-cancelled appointments</div>
        </div>

        <div className="p-3.5 rounded-xl border bg-white dark:bg-slate-900 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-medium">Waiting</span>
            <Hourglass className="h-4 w-4 text-amber-500" />
          </div>
          <div className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-2">
            {metrics?.waiting ?? 0}
          </div>
          <div className="text-[10px] text-slate-400 mt-1">Awaiting consultation</div>
        </div>

        <div className="p-3.5 rounded-xl border bg-white dark:bg-slate-900 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-medium">In Consultation</span>
            <Stethoscope className="h-4 w-4 text-purple-500" />
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white mt-2">
            {metrics?.inConsultation ?? 0}
          </div>
          <div className="text-[10px] text-slate-400 mt-1">With a doctor now</div>
        </div>

        <div className="p-3.5 rounded-xl border bg-white dark:bg-slate-900 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-medium">Completed</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-2">
            {metrics?.completed ?? 0}
          </div>
          <div className="text-[10px] text-slate-400 mt-1">Seen so far today</div>
        </div>

        <div className="p-3.5 rounded-xl border bg-white dark:bg-slate-900 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-medium">Est. Wait</span>
            <Users className="h-4 w-4 text-indigo-500" />
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white mt-2">
            {metrics?.estimatedWaitTimeMins ?? 0}
            <span className="text-sm font-medium text-slate-400 ml-1">min</span>
          </div>
          <div className="text-[10px] text-slate-400 mt-1">Current average</div>
        </div>
      </div>

      {/* Submodule Navigation */}
      <ModuleNavCards
        modulePath="/appointments"
        title="Scheduling Submodules"
        subtitle="Book new visits, work the live queue, and review the full appointment register"
      />

      {/* Live queue */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <CardTitle className="text-base font-semibold">Live Queue</CardTitle>
            <CardDescription>
              Patients in your scope, in scheduled order. Cancelled visits are excluded.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="text-xs text-emerald-600 hover:text-emerald-700"
            onClick={() => router.push("/appointments/queue")}
          >
            Full queue &rarr;
          </Button>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-center text-slate-500 py-12 text-xs">
              No appointments scheduled for today.
            </p>
          ) : (
            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">Token</TableHead>
                    <TableHead>Patient</TableHead>
                    <TableHead>Doctor</TableHead>
                    <TableHead>Scheduled</TableHead>
                    <TableHead className="text-right">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => {
                    const key = row.appointmentId || row._id;
                    if (seen.has(key)) return null;
                    seen.add(key);
                    return (
                      <TableRow
                        key={key}
                        className="text-xs hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                      >
                        <TableCell className="font-mono font-semibold">
                          {row.tokenNumber ?? "—"}
                        </TableCell>
                        <TableCell>
                          <div className="font-semibold text-slate-900 dark:text-white">
                            {row.patientId?.name ?? "Unknown patient"}
                          </div>
                          {row.patientId?.uhid && (
                            <div className="text-[10px] font-mono text-slate-500">
                              {row.patientId.uhid}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-slate-700 dark:text-slate-300">
                          {row.doctorId?.name ?? "—"}
                        </TableCell>
                        <TableCell className="font-mono text-slate-500">
                          {row.scheduledTime ?? "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant="outline" className="text-[10px]">
                            {row.status ?? "SCHEDULED"}
                          </Badge>
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
