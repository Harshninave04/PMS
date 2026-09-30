"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { ApiErrorNotice } from "@/components/ui/permission-state";
import { apiFetch } from "@/lib/api-client";
import {
  Activity,
  Stethoscope,
  FileText,
  HeartPulse,
  AlertOctagon,
  ClipboardList,
  ShoppingBag,
  RefreshCw,
  Plus,
  ArrowUpRight,
  Loader2,
  Pill
} from "lucide-react";

interface ClinicalStats {
  consultationsCount?: number;
  diagnosesCount?: number;
  vitalsCount?: number;
  allergiesCount?: number;
  ordersCount?: number;
  plansCount?: number;
}

interface VitalSummary {
  _id: string;
  patient?: { name?: string };
  bloodPressure?: string;
  heartRate?: number;
  oxygenSaturation?: number;
  temperature?: number;
  dateRecorded?: string;
  createdAt?: string;
}

interface AllergySummary {
  _id: string;
  patient?: { name?: string };
  title?: string;
  details?: string;
  reaction?: string;
  severity?: string;
}

interface QueuePatient {
  _id: string;
  name?: string;
  uhid?: string;
  allergies?: string[];
}

interface QueueAppointment {
  _id: string;
  patientId?: QueuePatient | string;
  appointmentTime?: string;
  tokenNumber?: string;
  status?: string;
  queueStatus?: string;
}

interface QueueMetrics {
  totalToday?: number;
  pending?: number;
  inConsultation?: number;
  completed?: number;
}

interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  metrics?: QueueMetrics;
}

export default function ClinicalDashboardPage() {
  const router = useRouter();
  const { toast } = useToast();

  const [stats, setStats] = useState<ClinicalStats | null>(null);
  const [vitals, setVitals] = useState<VitalSummary[]>([]);
  const [allergies, setAllergies] = useState<AllergySummary[]>([]);
  const [queue, setQueue] = useState<QueueAppointment[]>([]);
  const [queueMetrics, setQueueMetrics] = useState<QueueMetrics | null>(null);
  const [loadErrors, setLoadErrors] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async () => {
    const results = await Promise.allSettled([
      apiFetch<ApiEnvelope<ClinicalStats>>("/api/clinical/stats"),
      apiFetch<ApiEnvelope<VitalSummary[]>>("/api/clinical/vitals"),
      apiFetch<ApiEnvelope<AllergySummary[]>>("/api/clinical/records?recordType=Allergy"),
      apiFetch<ApiEnvelope<QueueAppointment[]>>("/api/appointments/queue")
    ]);
    const nextErrors: Record<string, unknown> = {};
    const [statsResult, vitalsResult, allergyResult, queueResult] = results;

    if (statsResult.status === "fulfilled" && statsResult.value.success) setStats(statsResult.value.data || null);
    else nextErrors.stats = statsResult.status === "rejected" ? statsResult.reason : new Error("Clinical summary could not be loaded.");

    if (vitalsResult.status === "fulfilled" && vitalsResult.value.success) setVitals((vitalsResult.value.data || []).slice(0, 5));
    else nextErrors.vitals = vitalsResult.status === "rejected" ? vitalsResult.reason : new Error("Recent vital signs could not be loaded.");

    if (allergyResult.status === "fulfilled" && allergyResult.value.success) setAllergies((allergyResult.value.data || []).slice(0, 5));
    else nextErrors.allergies = allergyResult.status === "rejected" ? allergyResult.reason : new Error("Allergy alerts could not be loaded.");

    if (queueResult.status === "fulfilled" && queueResult.value.success) {
      setQueue(queueResult.value.data || []);
      setQueueMetrics(queueResult.value.metrics || null);
    } else nextErrors.queue = queueResult.status === "rejected" ? queueResult.reason : new Error("Today's appointment queue could not be loaded.");

    setLoadErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) toast("Some clinical dashboard information could not be loaded", "error");
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => {
    // The state updates happen after asynchronous API responses resolve.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData();
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  if (loading) {
    return (
      <div className="flex h-[450px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {loadErrors.stats ? <ApiErrorNotice error={loadErrors.stats} context="the clinical summary" /> : null}
      {loadErrors.vitals ? <ApiErrorNotice error={loadErrors.vitals} context="recent vital signs" /> : null}
      {loadErrors.allergies ? <ApiErrorNotice error={loadErrors.allergies} context="allergy alerts" /> : null}
      {loadErrors.queue ? <ApiErrorNotice error={loadErrors.queue} context="today's appointment queue" /> : null}
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <Activity className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
            Clinical Dashboard & Analytics
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Strategic EMR overview, clinical encounter metrics, vital signs alert warnings, and diagnostic breakdown.
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
            onClick={() => router.push("/clinical/consultations")}
          >
            <Plus className="h-4 w-4" />
            New Consultation
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="p-3.5 rounded-xl border bg-white dark:bg-slate-900 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-medium">Consultations</span>
            <Stethoscope className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-2">
            {stats?.consultationsCount || 0}
          </div>
          <div className="text-[10px] text-slate-400 mt-1">Encounters logged</div>
        </div>

        <div className="p-3.5 rounded-xl border bg-white dark:bg-slate-900 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-medium">Active Diagnoses</span>
            <ClipboardList className="h-4 w-4 text-amber-500" />
          </div>
          <div className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-2">
            {stats?.diagnosesCount || 0}
          </div>
          <div className="text-[10px] text-slate-400 mt-1">ICD classifications</div>
        </div>

        <div className="p-3.5 rounded-xl border bg-white dark:bg-slate-900 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-medium">Vitals Recorded</span>
            <HeartPulse className="h-4 w-4 text-rose-500" />
          </div>
          <div className="text-2xl font-bold text-rose-600 dark:text-rose-400 mt-2">
            {stats?.vitalsCount || 0}
          </div>
          <div className="text-[10px] text-slate-400 mt-1">Physiological logs</div>
        </div>

        <div className="p-3.5 rounded-xl border bg-white dark:bg-slate-900 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-medium">Allergy Flags</span>
            <AlertOctagon className="h-4 w-4 text-purple-500" />
          </div>
          <div className="text-2xl font-bold text-purple-600 dark:text-purple-400 mt-2">
            {stats?.allergiesCount || 0}
          </div>
          <div className="text-[10px] text-slate-400 mt-1">Patient safety alerts</div>
        </div>

        <div className="p-3.5 rounded-xl border bg-white dark:bg-slate-900 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-medium">Clinical Orders</span>
            <ShoppingBag className="h-4 w-4 text-blue-500" />
          </div>
          <div className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-2">
            {stats?.ordersCount || 0}
          </div>
          <div className="text-[10px] text-slate-400 mt-1">Diagnostic orders</div>
        </div>

        <div className="p-3.5 rounded-xl border bg-white dark:bg-slate-900 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-medium">Treatment Plans</span>
            <FileText className="h-4 w-4 text-teal-500" />
          </div>
          <div className="text-2xl font-bold text-teal-600 dark:text-teal-400 mt-2">
            {stats?.plansCount || 0}
          </div>
          <div className="text-[10px] text-slate-400 mt-1">Active regimens</div>
        </div>
      </div>

      <Card className="border shadow-sm">
        <CardHeader className="pb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-base font-semibold">Today’s Patient Queue</CardTitle>
            <CardDescription>Appointments scheduled for today, with direct access to each patient’s record.</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => router.push("/appointments/queue")}>
            Open full queue
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Today", value: queueMetrics?.totalToday ?? queue.length },
              { label: "Pending / Waiting", value: queueMetrics?.pending ?? queue.filter((item) => ["SCHEDULED", "CHECKED_IN"].includes(item.status || "")).length },
              { label: "In consultation", value: queueMetrics?.inConsultation ?? queue.filter((item) => item.status === "IN_PROGRESS").length },
              { label: "Completed", value: queueMetrics?.completed ?? queue.filter((item) => item.status === "COMPLETED").length }
            ].map((metric) => (
              <div key={metric.label} className="rounded-lg border bg-slate-50/70 dark:bg-slate-900/60 px-3 py-2.5">
                <div className="text-[11px] text-slate-500">{metric.label}</div>
                <div className="mt-1 text-xl font-bold text-slate-900 dark:text-white">{metric.value}</div>
              </div>
            ))}
          </div>

          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Patient</TableHead>
                  <TableHead>Appointment</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Allergy alerts</TableHead>
                  <TableHead className="text-right">Patient record</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {queue.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-xs text-slate-500">
                      {loadErrors.queue ? "Today's queue is unavailable. See the access message above." : "No appointments are scheduled for today."}
                    </TableCell>
                  </TableRow>
                ) : queue.slice(0, 8).map((item) => {
                  const patient = item.patientId && typeof item.patientId === "object" ? item.patientId : undefined;
                  const patientId = patient?._id || (typeof item.patientId === "string" ? item.patientId : "");
                  const allergyList = patient?.allergies || [];
                  return (
                    <TableRow key={item._id}>
                      <TableCell>
                        <div className="font-semibold text-slate-900 dark:text-white">{patient?.name || "Patient"}</div>
                        <div className="text-[10px] text-slate-500">{patient?.uhid || "UHID unavailable"}</div>
                      </TableCell>
                      <TableCell className="text-xs">
                        <div>{item.appointmentTime || "Time not set"}</div>
                        <div className="text-[10px] text-slate-500">Token {item.tokenNumber || "—"}</div>
                      </TableCell>
                      <TableCell><Badge variant={item.status === "IN_PROGRESS" ? "default" : "outline"}>{(item.queueStatus || item.status || "SCHEDULED").replaceAll("_", " ")}</Badge></TableCell>
                      <TableCell>
                        {allergyList.length ? (
                          <div className="flex flex-wrap gap-1">
                            {allergyList.slice(0, 2).map((allergy) => <Badge key={allergy} variant="destructive" className="text-[10px]">{allergy}</Badge>)}
                            {allergyList.length > 2 ? <Badge variant="outline" className="text-[10px]">+{allergyList.length - 2}</Badge> : null}
                          </div>
                        ) : <span className="text-[11px] text-slate-400">No profile allergies recorded</span>}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" disabled={!patientId} onClick={() => router.push(`/patients/profile?id=${patientId}`)}>Patient 360°</Button>
                          <Button size="sm" className="h-7 px-2 text-[11px]" disabled={!patientId} onClick={() => router.push(`/clinical/consultations?patientId=${patientId}`)}>Consult</Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {[
          ["Medical history", "/clinical/history"],
          ["Prescriptions", "/clinical/prescriptions"],
          ["Lab orders", "/lab/orders"],
          ["Radiology orders", "/radiology/orders"],
          ["Follow-up", "/clinical/follow-up"],
          ["Clinical alerts", "/clinical/allergies"]
        ].map(([label, href]) => (
          <Button key={href} variant="outline" className="h-10 text-xs" onClick={() => router.push(href)}>{label}</Button>
        ))}
      </div>

      {/* Main Grid: Left Column Recent Vitals & Critical Flags; Right Column Quick Operations */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Recent Vitals & Clinical Events */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="border shadow-sm">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base font-semibold">Latest Vital Signs Monitoring</CardTitle>
                <CardDescription>Most recently recorded patient physiological metrics</CardDescription>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-emerald-600"
                onClick={() => router.push("/clinical/vitals")}
              >
                All Vitals →
              </Button>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Patient</TableHead>
                      <TableHead>BP (mmHg)</TableHead>
                      <TableHead>Heart Rate</TableHead>
                      <TableHead>SpO2</TableHead>
                      <TableHead>Temp (°C)</TableHead>
                      <TableHead>Date Recorded</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {vitals.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-slate-500 py-6 text-xs">
                          No vital sign entries recorded yet.
                        </TableCell>
                      </TableRow>
                    ) : (
                      vitals.map((v) => (
                        <TableRow key={v._id} className="text-xs">
                          <TableCell className="font-semibold">
                            {v.patient?.name || "Patient"}
                          </TableCell>
                          <TableCell className="font-mono">
                            {v.bloodPressure || "N/A"}
                          </TableCell>
                          <TableCell className="font-mono">
                            {v.heartRate ? `${v.heartRate} bpm` : "N/A"}
                          </TableCell>
                          <TableCell className="font-mono font-semibold text-emerald-600">
                            {v.oxygenSaturation ? `${v.oxygenSaturation}%` : "N/A"}
                          </TableCell>
                          <TableCell className="font-mono">
                            {v.temperature ? `${v.temperature}°` : "N/A"}
                          </TableCell>
                          <TableCell className="text-slate-500 text-[11px]">
                            {v.dateRecorded || v.createdAt ? new Date(v.dateRecorded || v.createdAt || "").toLocaleDateString() : "—"}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Active Allergy Safety Flags */}
          <Card className="border shadow-sm">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base font-semibold">Active Allergy Warnings</CardTitle>
                <CardDescription>Critical patient adverse reactions and contraindications</CardDescription>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-rose-600"
                onClick={() => router.push("/clinical/allergies")}
              >
                Allergy Registry →
              </Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {allergies.length === 0 ? (
                  <p className="text-xs text-slate-400 py-4 text-center">No allergy flags recorded.</p>
                ) : (
                  allergies.map((a) => (
                    <div
                      key={a._id}
                      className="p-3 rounded-lg bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/50 flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-2.5">
                        <AlertOctagon className="h-4 w-4 text-rose-600 shrink-0" />
                        <div>
                          <span className="font-bold text-slate-900 dark:text-white">
                            {a.patient?.name}:{" "}
                          </span>
                          <span className="text-rose-700 dark:text-rose-300 font-semibold">
                            {a.title || a.details || "Allergy"}
                          </span>
                          {a.reaction && (
                            <span className="text-slate-500 text-[11px]"> ({a.reaction})</span>
                          )}
                        </div>
                      </div>
                      <Badge variant="outline" className="text-[10px] text-rose-700 border-rose-300">
                        {a.severity || "Severe"}
                      </Badge>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right 1 Col: Quick Launch Shortcuts */}
        <div className="space-y-6">
          <Card className="border shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">Clinical Actions</CardTitle>
              <CardDescription>Direct shortcuts to EMR workflows</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button
                variant="outline"
                className="w-full justify-between h-10 text-xs font-medium hover:border-emerald-400"
                onClick={() => router.push("/clinical/consultations")}
              >
                <div className="flex items-center gap-2">
                  <Stethoscope className="h-4 w-4 text-emerald-600" />
                  <span>Start Consultation</span>
                </div>
                <ArrowUpRight className="h-3.5 w-3.5 text-slate-400" />
              </Button>

              <Button
                variant="outline"
                className="w-full justify-between h-10 text-xs font-medium hover:border-rose-400"
                onClick={() => router.push("/clinical/vitals")}
              >
                <div className="flex items-center gap-2">
                  <HeartPulse className="h-4 w-4 text-rose-600" />
                  <span>Log Vital Signs</span>
                </div>
                <ArrowUpRight className="h-3.5 w-3.5 text-slate-400" />
              </Button>

              <Button
                variant="outline"
                className="w-full justify-between h-10 text-xs font-medium hover:border-amber-400"
                onClick={() => router.push("/clinical/diagnoses")}
              >
                <div className="flex items-center gap-2">
                  <ClipboardList className="h-4 w-4 text-amber-600" />
                  <span>Record Diagnosis</span>
                </div>
                <ArrowUpRight className="h-3.5 w-3.5 text-slate-400" />
              </Button>

              <Button
                variant="outline"
                className="w-full justify-between h-10 text-xs font-medium hover:border-sky-400"
                onClick={() => router.push("/clinical/prescriptions")}
              >
                <div className="flex items-center gap-2">
                  <Pill className="h-4 w-4 text-sky-600" />
                  <span>Write Prescription</span>
                </div>
                <ArrowUpRight className="h-3.5 w-3.5 text-slate-400" />
              </Button>

              <Button
                variant="outline"
                className="w-full justify-between h-10 text-xs font-medium hover:border-blue-400"
                onClick={() => router.push("/clinical/orders")}
              >
                <div className="flex items-center gap-2">
                  <ShoppingBag className="h-4 w-4 text-blue-600" />
                  <span>Place Clinical Order</span>
                </div>
                <ArrowUpRight className="h-3.5 w-3.5 text-slate-400" />
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
