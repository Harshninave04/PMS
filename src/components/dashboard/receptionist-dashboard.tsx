"use client";

import React from "react";
import Link from "next/link";
import { CalendarPlus, Search, RefreshCw, FileText } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { usePermissions } from "@/components/permissions/permission-context";
import { formatDoctorName } from "@/lib/name-formatter";
import { fmtMoney } from "@/lib/money";
import { isReadyForDischarge } from "@/lib/discharge-workflow";

interface ReceptionistDashboardData {
  bookedToday: number;
  waiting: number;
  completedToday: number;
  pendingPayment: number;
  appointments: {
    token: string;
    patient: string;
    patientId: string;
    doctor: string;
    time: string;
    status: "Waiting" | "With doctor" | "Completed" | "Cancelled";
  }[];
}

interface PatientSearchResult {
  _id: string;
  name: string;
  contact?: string;
  uhid?: string;
}

interface ReadyForDischargeRow {
  admissionId: string;
  patientName: string;
  patientId: string;
  uhid: string;
  admissionDate?: string;
  admissionType?: string;
  bedNumber?: string;
  roomNumber?: string;
  wardName?: string;
  doctorName?: string;
  assignedDoctorNames?: string[];
  assignedNurseNames?: string[];
  invoice?: {
    invoiceNumber?: string;
    billingStatus?: string;
    status?: string;
    finalAmount?: number;
    balanceAmount?: number;
  };
  status: string;
  dischargeRequested: boolean;
  billingRequested: boolean;
}

const statusClass: Record<ReceptionistDashboardData["appointments"][number]["status"], string> = {
  Waiting: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
  "With doctor": "bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300",
  Completed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300",
  Cancelled: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
};

export default function ReceptionistDashboard() {
  const { can } = usePermissions();
  const [data, setData] = React.useState<ReceptionistDashboardData | null>(null);
  const [dashboardError, setDashboardError] = React.useState("");
  const [searchQuery, setSearchQuery] = React.useState("");
  const [searchResults, setSearchResults] = React.useState<PatientSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = React.useState(false);
  const [searchError, setSearchError] = React.useState("");
  const [readyForDischarge, setReadyForDischarge] = React.useState<ReadyForDischargeRow[]>([]);
  const [dischargeQueueLoading, setDischargeQueueLoading] = React.useState(true);
  const [dischargeQueueError, setDischargeQueueError] = React.useState("");

  const refreshDischargeLists = React.useCallback(async () => {
    setDischargeQueueLoading(true);
    setDischargeQueueError("");
    try {
      const readyResponse = await fetch("/api/admission/billing-queue");
      const readyResult = await readyResponse.json();
      if (!readyResponse.ok || !readyResult.success) {
        throw new Error(readyResult.message || "Unable to load discharge-ready patients.");
      }
      const queue = (readyResult.data ?? []) as ReadyForDischargeRow[];
      // This endpoint already limits rows to active, nurse-handed-off stays.
      // Keep only completed final bills so discharge stays separate from billing.
      setReadyForDischarge(queue.filter((row) => isReadyForDischarge(row, row.invoice)));
    } catch (error) {
      setDischargeQueueError(error instanceof Error ? error.message : "Unable to load discharge status.");
    } finally {
      setDischargeQueueLoading(false);
    }
  }, [can]);

  React.useEffect(() => {
    void refreshDischargeLists();
  }, [refreshDischargeLists]);

  React.useEffect(() => {
    let cancelled = false;
    fetch("/api/dashboard/stats")
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error(result.message || "Unable to load today's appointments.");
        return result.data as ReceptionistDashboardData;
      })
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((error: unknown) => {
        if (!cancelled) setDashboardError(error instanceof Error ? error.message : "Unable to load today's appointments.");
      });

    return () => { cancelled = true; };
  }, []);

  React.useEffect(() => {
    const query = searchQuery.trim();
    if (!query) {
      setSearchResults([]);
      setSearchError("");
      setSearchLoading(false);
      return;
    }

    let cancelled = false;
    const timeout = window.setTimeout(async () => {
      setSearchLoading(true);
      setSearchError("");
      try {
        const response = await fetch(`/api/patient?query=${encodeURIComponent(query)}&status=active`);
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error(result.message || "Unable to search patients.");
        if (!cancelled) setSearchResults(result.data ?? []);
      } catch (error) {
        if (!cancelled) {
          setSearchResults([]);
          setSearchError(error instanceof Error ? error.message : "Unable to search patients.");
        }
      } finally {
        if (!cancelled) setSearchLoading(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [searchQuery]);

  const metrics = [
    { label: "Booked Today", value: data?.bookedToday },
    { label: "Waiting", value: data?.waiting },
    { label: "Completed Today", value: data?.completedToday },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
            Reception
          </span>
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Welcome back</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Todayâ€™s appointments and patient search.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/appointments/book" className={buttonVariants({ className: "gap-2 bg-emerald-600 text-white hover:bg-emerald-700" })}>
            <CalendarPlus className="h-4 w-4" /> Book Appointment
          </Link>
          {can("patients.register:create") && (
            <Link href="/patients/register" className={buttonVariants({ variant: "outline" })}>
              Register Patient
            </Link>
          )}
        </div>
      </header>

      {dashboardError && <p role="alert" className="text-sm text-red-600">{dashboardError}</p>}

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Ready for Discharge ({readyForDischarge.length})</CardTitle>
            <CardDescription>Billing is complete. The patient remains admitted until an authorized staff member finalizes discharge.</CardDescription>
          </div>
          <button type="button" onClick={() => void refreshDischargeLists()} disabled={dischargeQueueLoading} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
            <RefreshCw className={`h-3.5 w-3.5 ${dischargeQueueLoading ? "animate-spin" : ""}`} /> Refresh
          </button>
        </CardHeader>
        <CardContent>
          {dischargeQueueError ? (
            <p role="alert" className="text-sm text-red-600">{dischargeQueueError}</p>
          ) : dischargeQueueLoading ? (
            <p className="py-5 text-center text-sm text-slate-500">Loading discharge statusâ€¦</p>
          ) : readyForDischarge.length === 0 ? (
            <p className="py-5 text-center text-sm text-slate-500">No patients are currently ready for discharge.</p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {readyForDischarge.map((patient) => (
                <li key={patient.admissionId} className="space-y-2 py-4 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold text-slate-900 dark:text-white">{patient.patientName} <span className="font-mono text-xs font-normal text-slate-500">{patient.uhid}</span></p>
                      <p className="text-xs text-slate-500">{[patient.admissionType, patient.wardName, `Room ${patient.roomNumber || "â€”"}`, `Bed ${patient.bedNumber || "â€”"}`].filter(Boolean).join(" Â· ")}{patient.admissionDate ? ` Â· Admitted ${new Date(patient.admissionDate).toLocaleDateString()}` : ""}</p>
                    </div>
                    <Badge className="border-emerald-300 bg-emerald-100 text-emerald-900">Billing Completed â€” Ready for Discharge</Badge>
                  </div>
                  <div className="grid gap-2 text-xs text-slate-600 sm:grid-cols-2 lg:grid-cols-4 dark:text-slate-300">
                    <p><span className="font-medium">Assigned doctor:</span> {(patient.assignedDoctorNames ?? []).map(formatDoctorName).filter(Boolean).join(", ") || formatDoctorName(patient.doctorName) || "â€”"}</p>
                    <p><span className="font-medium">Assigned nurse:</span> {patient.assignedNurseNames?.join(", ") || "â€”"}</p>
                    <p><span className="font-medium">Bill:</span> {patient.invoice?.invoiceNumber || "Final bill"} Â· {patient.invoice?.status || "â€”"}</p>
                    <p><span className="font-medium">Outstanding balance:</span> {fmtMoney(Number(patient.invoice?.balanceAmount ?? 0))}</p>
                  </div>
                  <p className="text-[11px] text-emerald-800 dark:text-emerald-300">Discharge readiness: final bill complete; awaiting authorized discharge.</p>
                  {can("admissions.discharge:discharge") && can("admissions.summary:print") && (
                    <div className="flex justify-end">
                      <Link href={`/admissions/discharge?admissionId=${encodeURIComponent(patient.admissionId)}`} className={buttonVariants({ className: "gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700" })}>
                        <FileText className="h-4 w-4" /> Discharge &amp; Print
                      </Link>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <section aria-label="Today's appointment totals" className="grid gap-4 sm:grid-cols-3">
        {metrics.map(({ label, value }) => (
          <Card key={label}>
            <CardContent className="p-5">
              <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
              <p className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">{value ?? "â€”"}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle className="text-base">Today's appointments</CardTitle>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500">Pending payment: {data?.pendingPayment ?? "â€”"}</span>
            <Link href="/appointments/list" className="text-sm font-semibold text-emerald-700 hover:underline dark:text-emerald-400">View all</Link>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {!data ? (
            <p className="px-5 py-8 text-center text-sm text-slate-500">{dashboardError ? "Today's appointments are unavailable." : "Loading appointmentsâ€¦"}</p>
          ) : data.appointments.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-slate-500">No appointments scheduled for today.</p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.appointments.map((appointment, index) => (
                <li key={`${appointment.token}-${appointment.patientId}-${index}`} className="grid grid-cols-[3.5rem_minmax(0,1fr)_auto] items-center gap-3 px-5 py-3 sm:grid-cols-[4rem_minmax(0,1fr)_minmax(8rem,0.8fr)_5rem_7rem]">
                  <span className="font-mono text-xs font-bold text-emerald-700 dark:text-emerald-400">{appointment.token || "â€”"}</span>
                  <span className="truncate text-sm font-medium text-slate-900 dark:text-white">{appointment.patient || "Patient"}</span>
                  <span className="hidden truncate text-sm text-slate-600 dark:text-slate-300 sm:block">{formatDoctorName(appointment.doctor) || "â€”"}</span>
                  <span className="hidden text-sm text-slate-500 sm:block">{appointment.time || "â€”"}</span>
                  <span className={`justify-self-end rounded-full px-2.5 py-1 text-xs font-medium ${statusClass[appointment.status]}`}>{appointment.status}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Find a patient</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search by name, phone or UHID"
              aria-label="Search patients by name, phone or UHID"
              className="pl-9"
            />
          </div>
          {searchLoading && <p className="text-sm text-slate-500">Searchingâ€¦</p>}
          {searchError && <p role="alert" className="text-sm text-red-600">{searchError}</p>}
          {!searchLoading && !searchError && searchQuery.trim() && searchResults.length === 0 && <p className="text-sm text-slate-500">No patients found.</p>}
          {searchResults.length > 0 && (
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-700">
              {searchResults.slice(0, 8).map((patient) => {
                const patientQuery = patient.uhid || patient.name || searchQuery.trim();
                return (
                  <li key={patient._id}>
                    <Link href={`/patients/list?query=${encodeURIComponent(patientQuery)}`} className="flex flex-wrap items-center justify-between gap-1 px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-900">
                      <span className="text-sm font-medium text-slate-900 dark:text-white">{patient.name}</span>
                      <span className="text-xs text-slate-500">{[patient.contact, patient.uhid].filter(Boolean).join(" Â· ")}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
