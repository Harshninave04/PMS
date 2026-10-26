"use client";

import React, { useCallback, useEffect, useState, Suspense } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import {
  HeartPulse,
  Users,
  Pill,
  FileText,
  RefreshCw,
  Loader2,
  ShieldAlert,
  ArrowRightLeft,
  ClipboardCheck
} from "lucide-react";

interface NursingPatient {
  admissionId: string;
  patientId: string;
  name: string;
  uhid: string;
  bedNumber: string | number;
  wardName?: string;
  allergies?: string[];
  dischargeRequested?: boolean;
}

interface NursingStats {
  pendingMedications?: number;
}

interface HandoverData {
  medications: {
    _id: string;
    medicationName: string;
    dosage: string;
    scheduledTime?: string;
    status: string;
    withheldReason?: string;
  }[];
  vitals: {
    _id: string;
    dateRecorded?: string;
    createdAt?: string;
    bloodPressure?: string;
    heartRate?: number;
    oxygenSaturation?: number;
    respiratoryRate?: number;
    temperature?: number;
  }[];
  notes: {
    _id: string;
    recordType: string;
    title?: string;
    chiefComplaint?: string;
    objectiveFindings?: string;
    assessment?: string;
    plan?: string;
    dateRecorded?: string;
    createdAt?: string;
  }[];
  tasks: {
    _id: string;
    title: string;
    status: string;
  }[];
}

export default function NursingHubPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-[450px] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
        </div>
      }
    >
      <NursingHubContent />
    </Suspense>
  );
}

function NursingHubContent() {
  const router = useRouter();
  const { toast } = useToast();

  const [stats, setStats] = useState<NursingStats | null>(null);
  const [inpatients, setInpatients] = useState<NursingPatient[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [handoverAdmissionId, setHandoverAdmissionId] = useState("");
  const [handoverData, setHandoverData] = useState<HandoverData | null>(null);
  const [handoverLoading, setHandoverLoading] = useState(false);

  const fetchDashboardData = useCallback(async () => {
    const [statsRes, patientsRes] = await Promise.all([
      fetch("/api/nursing/stats"),
      fetch("/api/nursing/my-patients")
    ]);
    if (!statsRes.ok || !patientsRes.ok) throw new Error("Failed to load nursing data");
    const [statsData, patientsData] = await Promise.all([
      statsRes.json(),
      patientsRes.json()
    ]) as [
      { success: boolean; data?: NursingStats },
      { success: boolean; data?: NursingPatient[] }
    ];
    if (!statsData.success || !patientsData.success) throw new Error("Failed to load nursing data");
    return { stats: statsData.data ?? null, patients: patientsData.data ?? [] };
  }, []);

  useEffect(() => {
    let active = true;
    fetchDashboardData()
      .then(({ stats: nextStats, patients }) => {
        if (!active) return;
        setStats(nextStats);
        setInpatients(patients);
      })
      .catch(() => {
        if (active) toast("Failed to load nursing operations data", "error");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [fetchDashboardData, toast]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const { stats: nextStats, patients } = await fetchDashboardData();
      setStats(nextStats);
      setInpatients(patients);
    } catch {
      toast("Failed to refresh nursing operations data", "error");
    } finally {
      setRefreshing(false);
    }
  };

  const loadHandover = async () => {
    const admissionId = handoverAdmissionId || inpatients[0]?.admissionId;
    if (!admissionId) {
      toast("No admitted patient is available for handover", "error");
      return;
    }

    setHandoverLoading(true);
    try {
      const res = await fetch(`/api/care-tasks/timeline?admissionId=${encodeURIComponent(admissionId)}`);
      const result = await res.json() as { success: boolean; data?: HandoverData; message?: string };
      if (!res.ok || !result.success || !result.data) {
        throw new Error(result.message || "Failed to load handover summary");
      }
      setHandoverAdmissionId(admissionId);
      setHandoverData(result.data);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Failed to load handover summary", "error");
      setHandoverData(null);
    } finally {
      setHandoverLoading(false);
    }
  };

  const handoverPatient = inpatients.find((patient) => patient.admissionId === handoverAdmissionId)
    ?? inpatients[0];
  const dischargeFlagCount = inpatients.filter((patient) => patient.dischargeRequested).length;
  const latestVitals = handoverData?.vitals[0];
  const latestNursingNote = handoverData?.notes.find((note) => note.recordType === "Nursing Note");
  const pendingDoses = handoverData?.medications.filter((medication) => medication.status === "PENDING") ?? [];
  const exceptionDoses = handoverData?.medications.filter((medication) =>
    ["WITHHELD", "REFUSED"].includes(medication.status)
  ) ?? [];
  const activeInstructions = handoverData?.tasks.filter((task) =>
    ["NEW", "ACKNOWLEDGED", "IN_PROGRESS"].includes(task.status)
  ) ?? [];

  if (loading) {
    return (
      <div className="flex h-[450px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <HeartPulse className="h-7 w-7 text-rose-600 dark:text-rose-400" />
            Nursing Dashboard
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Your patients and everyday bedside care tasks.
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
            onClick={() => router.push("/nursing/patients")}
          >
            <Users className="h-4 w-4" />
            View patients
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Link href="/nursing/patients" className="rounded-xl border bg-white p-4 shadow-sm transition-colors hover:border-emerald-300 hover:bg-emerald-50/50 dark:bg-slate-900 dark:hover:bg-emerald-950/20">
          <div className="flex items-center gap-3">
            <Users className="h-5 w-5 text-emerald-600" />
            <div>
              <p className="font-semibold text-slate-900 dark:text-white">My patients</p>
              <p className="text-xs text-slate-500">{inpatients.length} currently admitted</p>
            </div>
          </div>
        </Link>
        <Link href="/nursing/patients?flagged=1" className="rounded-xl border bg-white p-4 shadow-sm transition-colors hover:border-amber-300 hover:bg-amber-50/50 dark:bg-slate-900 dark:hover:bg-amber-950/20">
          <div className="flex items-center gap-3">
            <ClipboardCheck className={`h-5 w-5 ${dischargeFlagCount > 0 ? "text-amber-600" : "text-slate-400"}`} />
            <div>
              <p className="font-semibold text-slate-900 dark:text-white">Discharge flags</p>
              <p className="text-xs text-slate-500">
                {dischargeFlagCount > 0
                  ? `${dischargeFlagCount} of ${inpatients.length} flagged for discharge`
                  : "No discharge flags yet"}
              </p>
            </div>
          </div>
        </Link>
        <Link href="/nursing/vitals" className="rounded-xl border bg-white p-4 shadow-sm transition-colors hover:border-rose-300 hover:bg-rose-50/50 dark:bg-slate-900 dark:hover:bg-rose-950/20">
          <div className="flex items-center gap-3">
            <HeartPulse className="h-5 w-5 text-rose-600" />
            <div>
              <p className="font-semibold text-slate-900 dark:text-white">Record vital signs</p>
              <p className="text-xs text-slate-500">Add bedside observations</p>
            </div>
          </div>
        </Link>
        <Link href="/nursing/notes" className="rounded-xl border bg-white p-4 shadow-sm transition-colors hover:border-cyan-300 hover:bg-cyan-50/50 dark:bg-slate-900 dark:hover:bg-cyan-950/20">
          <div className="flex items-center gap-3">
            <FileText className="h-5 w-5 text-cyan-600" />
            <div>
              <p className="font-semibold text-slate-900 dark:text-white">Daily nursing records</p>
              <p className="text-xs text-slate-500">Record, review, and print daily care</p>
            </div>
          </div>
        </Link>
        <Link href="/nursing/medications" className="rounded-xl border bg-white p-4 shadow-sm transition-colors hover:border-purple-300 hover:bg-purple-50/50 dark:bg-slate-900 dark:hover:bg-purple-950/20">
          <div className="flex items-center gap-3">
            <Pill className="h-5 w-5 text-purple-600" />
            <div>
              <p className="font-semibold text-slate-900 dark:text-white">Medication round</p>
              <p className="text-xs text-slate-500">{stats?.pendingMedications || 0} doses need action</p>
            </div>
          </div>
        </Link>
      </div>

      <Card className="border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Shift handover</CardTitle>
          <CardDescription>
            Review the latest bedside notes, vital signs, pending doses, and doctor instructions for one patient.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Select
              value={handoverAdmissionId || inpatients[0]?.admissionId || ""}
              onChange={(event) => {
                setHandoverAdmissionId(event.target.value);
                setHandoverData(null);
              }}
              className="h-10 flex-1"
              disabled={inpatients.length === 0 || handoverLoading}
            >
              {inpatients.length === 0 ? (
                <option value="">No admitted patients</option>
              ) : (
                inpatients.map((patient) => (
                  <option key={patient.admissionId} value={patient.admissionId}>
                    Bed {patient.bedNumber} — {patient.name} ({patient.uhid})
                  </option>
                ))
              )}
            </Select>
            <Button
              onClick={loadHandover}
              disabled={inpatients.length === 0 || handoverLoading}
              className="h-10 bg-cyan-700 text-white hover:bg-cyan-800"
            >
              {handoverLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
              {handoverLoading ? "Loading summary..." : "View handover"}
            </Button>
            <Button
              onClick={() => {
                if (handoverPatient) {
                  router.push(`/nursing/patients?transferAdmissionId=${encodeURIComponent(handoverPatient.admissionId)}`);
                }
              }}
              disabled={!handoverPatient}
              className="h-10 bg-emerald-700 text-white hover:bg-emerald-800"
            >
              <ArrowRightLeft className="mr-2 h-4 w-4" />
              Transfer to another nurse
            </Button>
          </div>

          {handoverData && handoverPatient && (
            <div className="space-y-3 rounded-lg border bg-slate-50/70 p-4 dark:bg-slate-900/50">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="font-semibold text-slate-900 dark:text-white">
                    {handoverPatient.name} · Bed {handoverPatient.bedNumber}
                  </p>
                  <p className="text-xs text-slate-500">
                    {handoverPatient.uhid}{handoverPatient.wardName ? ` · ${handoverPatient.wardName}` : ""}
                  </p>
                </div>
                {handoverPatient.allergies?.length ? (
                  <Badge variant="outline" className="w-fit border-rose-300 text-rose-700">
                    <ShieldAlert className="mr-1 h-3 w-3" />
                    Allergies: {handoverPatient.allergies.join(", ")}
                  </Badge>
                ) : (
                  <span className="text-xs text-slate-500">No allergies listed</span>
                )}
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-md border bg-white p-3 dark:bg-slate-950">
                  <p className="mb-1 text-xs font-semibold">Latest vital signs</p>
                  {latestVitals ? (
                    <>
                      <p className="text-sm text-slate-800 dark:text-slate-200">
                        BP {latestVitals.bloodPressure || "—"} · HR {latestVitals.heartRate ?? "—"} · SpO₂ {latestVitals.oxygenSaturation ?? "—"}%
                      </p>
                      <p className="text-xs text-slate-500">
                        Temp {latestVitals.temperature ?? "—"}°C · RR {latestVitals.respiratoryRate ?? "—"}/min
                        {" · "}{new Date(latestVitals.dateRecorded || latestVitals.createdAt || "").toLocaleString()}
                      </p>
                    </>
                  ) : (
                    <p className="text-xs text-slate-500">No vital signs recorded for this stay.</p>
                  )}
                </div>

                <div className="rounded-md border bg-white p-3 dark:bg-slate-950">
                  <p className="mb-1 text-xs font-semibold">Latest nursing note</p>
                  {latestNursingNote ? (
                    <>
                      <p className="text-sm text-slate-800 dark:text-slate-200">
                        {latestNursingNote.chiefComplaint || latestNursingNote.objectiveFindings || latestNursingNote.assessment || latestNursingNote.plan || latestNursingNote.title || "Note recorded"}
                      </p>
                      <p className="text-xs text-slate-500">
                        {new Date(latestNursingNote.dateRecorded || latestNursingNote.createdAt || "").toLocaleString()}
                      </p>
                    </>
                  ) : (
                    <p className="text-xs text-slate-500">No nursing notes recorded for this stay.</p>
                  )}
                </div>

                <div className="rounded-md border bg-white p-3 dark:bg-slate-950">
                  <p className="mb-1 text-xs font-semibold">Pending medication doses ({pendingDoses.length})</p>
                  {pendingDoses.length ? (
                    <ul className="space-y-1 text-sm text-slate-800 dark:text-slate-200">
                      {pendingDoses.slice(0, 4).map((medication) => (
                        <li key={medication._id}>
                          {medication.medicationName} {medication.dosage}
                          {medication.scheduledTime ? ` · ${new Date(medication.scheduledTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-slate-500">No pending scheduled doses.</p>
                  )}
                  {exceptionDoses.length > 0 && (
                    <div className="mt-2 border-t pt-2">
                      <p className="mb-1 text-xs font-medium text-rose-700 dark:text-rose-300">
                        Withheld or refused
                      </p>
                      <ul className="space-y-1 text-xs text-slate-700 dark:text-slate-300">
                        {exceptionDoses.slice(0, 3).map((medication) => (
                          <li key={medication._id}>
                            {medication.medicationName} · {medication.status.toLowerCase()}
                            {medication.withheldReason ? ` — ${medication.withheldReason}` : ""}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                <div className="rounded-md border bg-white p-3 dark:bg-slate-950">
                  <p className="mb-1 text-xs font-semibold">Doctor instructions to follow ({activeInstructions.length})</p>
                  {activeInstructions.length ? (
                    <ul className="space-y-1 text-sm text-slate-800 dark:text-slate-200">
                      {activeInstructions.slice(0, 4).map((task) => (
                        <li key={task._id}>{task.title} <span className="text-xs text-slate-500">· {task.status.replaceAll("_", " ").toLowerCase()}</span></li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-slate-500">No open doctor instructions.</p>
                  )}
                </div>
              </div>
              <p className="text-[11px] text-slate-500">
                Handover preview only. Confirm the current patient status and medication chart at bedside.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Assigned inpatients */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base font-semibold">My admitted patients</CardTitle>
            <CardDescription>
              Quick access to bedside care for your current patients.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="text-xs"
            onClick={() => router.push("/nursing/patients")}
          >
            View all
          </Button>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Bed</TableHead>
                  <TableHead>Patient</TableHead>
                  <TableHead>Allergies</TableHead>
                  <TableHead className="text-right">Bedside tasks</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {inpatients.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-slate-500 py-12 text-xs">
                      No admitted patients are assigned to you right now.
                    </TableCell>
                  </TableRow>
                ) : (
                  inpatients.slice(0, 8).map((p) => (
                    <TableRow key={p.admissionId} className="text-xs hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                      <TableCell>
                        <div className="font-bold text-slate-900 dark:text-white font-mono text-sm">
                          Bed {p.bedNumber}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {p.wardName}
                        </div>
                      </TableCell>

                      <TableCell>
                        <div className="font-semibold text-slate-900 dark:text-white">
                          {p.name}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          {p.uhid}
                        </div>
                      </TableCell>

                      <TableCell>
                        {p.allergies && p.allergies.length > 0 ? (
                          <Badge variant="outline" className="text-[10px] text-rose-600 border-rose-300">
                            <ShieldAlert className="h-3 w-3 mr-1" />
                            {p.allergies.join(", ")}
                          </Badge>
                        ) : (
                          <span className="text-slate-400 text-[10px]">No known allergies</span>
                        )}
                      </TableCell>

                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs text-rose-600 border-rose-200 hover:bg-rose-50"
                            onClick={() => router.push(`/nursing/vitals?patientId=${p.patientId}&admissionId=${p.admissionId}`)}
                          >
                            <HeartPulse className="h-3.5 w-3.5 mr-1" />
                            Vitals
                          </Button>

                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs text-purple-600 border-purple-200 hover:bg-purple-50"
                            onClick={() => router.push(`/nursing/medications?patientId=${p.patientId}&admissionId=${p.admissionId}`)}
                          >
                            <Pill className="h-3.5 w-3.5 mr-1" />
                            eMAR
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs text-cyan-600 border-cyan-200 hover:bg-cyan-50"
                            onClick={() => router.push(`/nursing/notes?patientId=${p.patientId}&admissionId=${p.admissionId}`)}
                          >
                            <FileText className="h-3.5 w-3.5 mr-1" />
                            Note
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
