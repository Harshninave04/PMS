"use client";

import React from "react";
import Link from "next/link";
import { CalendarClock, CheckCircle2, Clock3, RefreshCw, Stethoscope } from "lucide-react";
import { ConsultationModal } from "@/components/consultation/consultation-modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import type { ConsultationAppointment } from "@/types/consultation";

interface QueueResponse {
  data: ConsultationAppointment[];
  metrics: { waiting?: number; inConsultation?: number };
}

const PRIORITY_RANK: Record<string, number> = { EMERGENCY: 0, URGENT: 1, VIP: 2, NORMAL: 3 };

export function sortWaitingAppointments(items: ConsultationAppointment[]): ConsultationAppointment[] {
  return [...items].sort((a, b) => {
    const priorityDifference = (PRIORITY_RANK[a.priority ?? ""] ?? PRIORITY_RANK.NORMAL)
      - (PRIORITY_RANK[b.priority ?? ""] ?? PRIORITY_RANK.NORMAL);
    if (priorityDifference !== 0) return priorityDifference;
    return String(a.tokenNumber ?? "").localeCompare(String(b.tokenNumber ?? ""), undefined, { numeric: true });
  });
}

function waitTimeLabel(appointment: ConsultationAppointment): string {
  const startedAt = appointment.checkedInAt || appointment.calledAt || appointment.createdAt;
  if (!startedAt) return "Not checked in";
  const elapsed = Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 60_000));
  if (elapsed < 1) return "Just checked in";
  return `${elapsed} min waiting`;
}

function priorityClass(priority?: string): string {
  if (priority === "EMERGENCY" || priority === "URGENT") return "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300";
  if (priority === "VIP") return "border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-900 dark:bg-purple-950/50 dark:text-purple-300";
  return "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300";
}

export default function DoctorDashboard() {
  const [queue, setQueue] = React.useState<ConsultationAppointment[]>([]);
  const [metrics, setMetrics] = React.useState<{ waiting: number; inConsultation: number; completed: number | null }>({ waiting: 0, inConsultation: 0, completed: null });
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState("");
  const [actionInProgress, setActionInProgress] = React.useState(false);
  const [selectedAppointment, setSelectedAppointment] = React.useState<ConsultationAppointment | null>(null);
  const [modalOpen, setModalOpen] = React.useState(false);
  const { toast } = useToast();

  const fetchQueue = React.useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    try {
      const response = await fetch("/api/appointments/queue");
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || result.message || "Unable to load your queue.");
      const queueResult = result as QueueResponse;
      setQueue(queueResult.data ?? []);
      let completedToday: number | null = null;
      try {
        const completedResponse = await fetch("/api/appointments/completed-today?countOnly=true");
        const completedResult = await completedResponse.json();
        if (completedResponse.ok && completedResult.success && typeof completedResult.count === "number") {
          completedToday = completedResult.count;
        }
      } catch {
        // Leave the completed count unavailable if its scoped request fails.
      }
      setMetrics({
        waiting: queueResult.metrics?.waiting ?? 0,
        inConsultation: queueResult.metrics?.inConsultation ?? 0,
        completed: completedToday,
      });
      setError("");
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : "Unable to load your queue.";
      setError(message);
      if (quiet) toast({ title: "Queue refresh failed", description: message, variant: "destructive" });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [toast]);

  React.useEffect(() => {
    void fetchQueue();
    const interval = window.setInterval(() => void fetchQueue(true), 30_000);
    return () => window.clearInterval(interval);
  }, [fetchQueue]);

  const activeAppointments = queue.filter((item) =>
    item.queueStatus === "IN_CONSULTATION" || item.status === "IN_PROGRESS"
  );
  const calledAppointments = queue.filter((item) => item.queueStatus === "CALLED");
  const waitingAppointments = sortWaitingAppointments(queue.filter((item) =>
    item.queueStatus === "WAITING" || item.queueStatus === "TRIAGE"
  ));
  const currentNextPatient = activeAppointments[0] ?? calledAppointments[0] ?? waitingAppointments[0] ?? null;

  const startConsultation = async () => {
    if (!currentNextPatient) return;
    const needsCall = currentNextPatient.queueStatus === "WAITING";
    const needsStart = needsCall || currentNextPatient.queueStatus === "CALLED" || currentNextPatient.queueStatus === "TRIAGE";
    setActionInProgress(true);
    try {
      let appointment = currentNextPatient;
      if (needsCall) {
        const response = await fetch("/api/appointments/queue", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "CALL_NEXT", appointmentId: appointment._id }),
        });
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error(result.error || "Unable to call this patient.");
        const calledAppointment = result.data as ConsultationAppointment;
        appointment = calledAppointment;
        setQueue((current) => current.map((item) => item._id === calledAppointment._id ? calledAppointment : item));
      }
      if (needsStart) {
        const response = await fetch("/api/appointments/queue", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "START_CONSULTATION", appointmentId: appointment._id }),
        });
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error(result.error || "Unable to start this consultation.");
        const startedAppointment = result.data as ConsultationAppointment;
        appointment = startedAppointment;
        setQueue((current) => current.map((item) => item._id === startedAppointment._id ? startedAppointment : item));
      }
      setSelectedAppointment(appointment);
      setModalOpen(true);
    } catch (startError) {
      toast({
        title: "Unable to start consultation",
        description: startError instanceof Error ? startError.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setActionInProgress(false);
    }
  };

  const metricCards = [
    { label: "Waiting", value: metrics.waiting, icon: Clock3, color: "text-amber-600 bg-amber-50 dark:bg-amber-950/40" },
    { label: "In Consultation", value: metrics.inConsultation, icon: Stethoscope, color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40" },
    { label: "Completed Today", value: metrics.completed, icon: CheckCircle2, color: "text-green-600 bg-green-50 dark:bg-green-950/40" },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Doctor OPD</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Your Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Today’s patients and consultation progress.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void fetchQueue(true)} disabled={refreshing} className="gap-2 self-start sm:self-auto">
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {metricCards.map(({ label, value, icon: Icon, color }) => {
          const card = (
            <Card key={label}>
              <CardContent className="flex items-center gap-4 p-5">
                <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${color}`}><Icon className="h-5 w-5" /></span>
                <div><p className="text-xs font-medium text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">{loading || value === null ? "N/A" : value}</p></div>
              </CardContent>
            </Card>
          );
          return label === "Completed Today" ? (
            <Link key={label} href="/appointments/completed-today" className="block rounded-xl transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600">{card}</Link>
          ) : card;
        })}
      </div>

      {error && (
        <Card><CardContent className="p-5 text-sm text-red-600">{error}</CardContent></Card>
      )}

      <div className="grid gap-5 lg:grid-cols-[1.3fr_0.7fr]">
        <Card className="overflow-hidden border-emerald-200 dark:border-emerald-900">
          <CardHeader className="flex flex-row items-start justify-between gap-4 bg-emerald-50/70 dark:bg-emerald-950/30">
            <div><CardTitle className="text-base">Current / Next Patient</CardTitle><p className="mt-1 text-xs text-slate-500">Your active consultation or the next patient in priority order.</p></div>
            {currentNextPatient && <span className="rounded-full bg-emerald-700 px-2.5 py-1 font-mono text-xs font-bold text-white">{currentNextPatient.tokenNumber || "No token"}</span>}
          </CardHeader>
          <CardContent className="p-5">
            {loading && !currentNextPatient ? (
              <p className="py-8 text-center text-sm text-slate-500">Loading your queue…</p>
            ) : currentNextPatient ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white">{currentNextPatient.patientId?.name || "Patient"}</h2>
                    <p className="mt-1 text-sm text-slate-500">{currentNextPatient.patientId?.age ?? "—"} years · {currentNextPatient.patientId?.gender || "—"}</p>
                  </div>
                  <Badge variant="outline" className={priorityClass(currentNextPatient.priority)}>{currentNextPatient.priority || "NORMAL"}</Badge>
                </div>
                <div className="grid gap-3 rounded-xl bg-slate-50 p-4 text-sm dark:bg-slate-900 sm:grid-cols-2">
                  <div><span className="text-xs text-slate-500">Complaint</span><p className="mt-1 font-medium text-slate-800 dark:text-slate-200">{currentNextPatient.reason || "—"}</p></div>
                  <div><span className="text-xs text-slate-500">Wait time</span><p className="mt-1 flex items-center gap-1.5 font-medium text-slate-800 dark:text-slate-200"><CalendarClock className="h-4 w-4 text-slate-400" />{waitTimeLabel(currentNextPatient)}</p></div>
                </div>
                <Button onClick={startConsultation} disabled={actionInProgress} className="w-full bg-emerald-600 text-white hover:bg-emerald-700 sm:w-auto">
                  {actionInProgress && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}
                  Start Consultation
                </Button>
              </div>
            ) : (
              <div className="py-10 text-center">
                <Clock3 className="mx-auto h-8 w-8 text-slate-300" />
                <p className="mt-3 text-sm font-medium text-slate-700 dark:text-slate-200">No patients waiting</p>
                <p className="mt-1 text-xs text-slate-500">Your OPD queue is clear.</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <div><CardTitle className="text-base">Waiting</CardTitle><p className="mt-1 text-xs text-slate-500">Next five, priority first</p></div>
            <Link href="/appointments/queue" className="text-xs font-semibold text-emerald-700 hover:underline dark:text-emerald-400">View full queue</Link>
          </CardHeader>
          <CardContent className="space-y-2 p-4 pt-0">
            {waitingAppointments.length === 0 ? (
              <p className="rounded-lg bg-slate-50 px-3 py-8 text-center text-sm text-slate-500 dark:bg-slate-900">No patients waiting</p>
            ) : waitingAppointments.slice(0, 5).map((item) => (
              <div key={item._id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 p-3 dark:border-slate-800">
                <div className="min-w-0"><div className="flex items-center gap-2"><span className="font-mono text-xs font-bold text-emerald-700 dark:text-emerald-400">{item.tokenNumber || "—"}</span><span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${priorityClass(item.priority)}`}>{item.priority || "NORMAL"}</span></div><p className="mt-1 truncate text-sm font-semibold text-slate-900 dark:text-white">{item.patientId?.name || "Patient"}</p><p className="truncate text-xs text-slate-500">{item.reason || "—"}</p></div>
                <span className="shrink-0 text-[11px] text-slate-500">{waitTimeLabel(item)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <ConsultationModal
        open={modalOpen}
        appointment={selectedAppointment}
        onOpenChange={(open) => {
          setModalOpen(open);
          if (!open) setSelectedAppointment(null);
        }}
        onSaved={() => fetchQueue(true)}
      />
    </div>
  );
}
