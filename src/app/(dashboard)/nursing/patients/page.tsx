"use client";

import React, { useEffect, useState, useMemo, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import {
  Users,
  Search,
  RefreshCw,
  Download,
  HeartPulse,
  Pill,
  FileText,
  Eye,
  ShieldAlert,
  Loader2,
  BedDouble,
  ClipboardList,
  CheckCircle2,
  Play,
  Ban
} from "lucide-react";

export default function MyInpatientsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-[450px] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
        </div>
      }
    >
      <MyInpatientsContent />
    </Suspense>
  );
}

function MyInpatientsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const [inpatients, setInpatients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Doctor instructions for my allotted patients
  const [tasks, setTasks] = useState<any[]>([]);
  const [tasksLoading, setTasksLoading] = useState(true);

  // Shared stay timeline (instructions + meds + vitals + notes)
  const [timeline, setTimeline] = useState<any>(null);
  const [timelineLoading, setTimelineLoading] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [wardFilter, setWardFilter] = useState("ALL");

  // Selected Inpatient Modal
  const [selectedPatient, setSelectedPatient] = useState<any>(null);

  const loadData = async () => {
    try {
      const [rosterRes, tasksRes] = await Promise.all([
        fetch("/api/nursing/my-patients"),
        fetch("/api/care-tasks"),
      ]);
      const data = await rosterRes.json();
      if (data.success) {
        setInpatients(data.data || []);
      } else {
        toast("Failed to load inpatients", "error");
      }
      try {
        const tasksData = await tasksRes.json();
        if (tasksRes.ok && tasksData.success) setTasks(tasksData.data || []);
      } catch {
        // Tasks are supplementary; roster is primary.
      } finally {
        setTasksLoading(false);
      }
    } catch (err) {
      toast("An error occurred while loading patient roster", "error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    setTasksLoading(true);
    loadData();
  };

  const openTimeline = async (patient: any) => {
    setSelectedPatient(patient);
    setTimeline(null);
    setTimelineLoading(true);
    try {
      const res = await fetch(
        `/api/care-tasks/timeline?admissionId=${patient.admissionId}`
      );
      const data = await res.json();
      if (res.ok && data.success) setTimeline(data.data);
    } catch {
      // Timeline is supplementary.
    } finally {
      setTimelineLoading(false);
    }
  };

  const actOnTask = async (task: any, status: string) => {
    try {
      const res = await fetch(`/api/care-tasks/${task._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast(`Instruction ${status.toLowerCase()}`, "success");
        setTasks((prev) =>
          prev.map((t) => (t._id === task._id ? data.data : t))
        );
        if (selectedPatient) openTimeline(selectedPatient);
      } else {
        toast(data.message || "Failed to update instruction", "error");
      }
    } catch {
      toast("Error updating instruction", "error");
    }
  };

  const openTasks = useMemo(
    () => tasks.filter((t) => ["NEW", "ACKNOWLEDGED", "IN_PROGRESS"].includes(t.status)),
    [tasks]
  );
  const doneTasks = useMemo(
    () => tasks.filter((t) => ["COMPLETED", "CANCELLED"].includes(t.status)),
    [tasks]
  );

  // Distinct Wards
  const availableWards = useMemo(() => {
    const set = new Set<string>();
    inpatients.forEach((p) => {
      if (p.wardName) set.add(p.wardName);
    });
    return Array.from(set);
  }, [inpatients]);

  const filteredInpatients = useMemo(() => {
    return inpatients.filter((p) => {
      const q = searchQuery.toLowerCase().trim();
      const patName = (p.name || "").toLowerCase();
      const uhid = (p.uhid || "").toLowerCase();
      const bed = (p.bedNumber || "").toLowerCase();
      const ward = (p.wardName || "").toLowerCase();
      const doc = (p.doctorName || "").toLowerCase();
      const diag = (p.diagnosis || "").toLowerCase();

      const matchesSearch =
        !q ||
        patName.includes(q) ||
        uhid.includes(q) ||
        bed.includes(q) ||
        ward.includes(q) ||
        doc.includes(q) ||
        diag.includes(q);

      let matchesWard = true;
      if (wardFilter !== "ALL") {
        matchesWard = p.wardName === wardFilter;
      }

      return matchesSearch && matchesWard;
    });
  }, [inpatients, searchQuery, wardFilter]);

  const exportCSV = () => {
    if (filteredInpatients.length === 0) {
      toast("No inpatients to export", "error");
      return;
    }

    const headers = [
      "Bed Number",
      "Ward",
      "Room",
      "Patient Name",
      "UHID",
      "Age/Gender",
      "Admitting Doctor",
      "Diagnosis",
      "Admission Date"
    ];

    const rows = filteredInpatients.map((p) => [
      `"${p.bedNumber || ""}"`,
      `"${p.wardName || ""}"`,
      `"${p.roomNumber || ""}"`,
      `"${p.name || ""}"`,
      `"${p.uhid || ""}"`,
      `"${p.gender || ""}, ${p.age || ""}y"`,
      `"${p.doctorName || ""}"`,
      `"${(p.diagnosis || "").replace(/"/g, '""')}"`,
      `"${p.admissionDate ? new Date(p.admissionDate).toLocaleDateString() : ""}"`
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Ward_Inpatients_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast("Inpatients roster exported successfully", "success");
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
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <Users className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
            My Allotted Patients
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Only patients allotted to you by the care-team desk. Doctor
            instructions for these patients appear in your inbox below.
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
            variant="outline"
            size="sm"
            onClick={exportCSV}
            className="flex items-center gap-1.5"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </Button>

          <Button
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5"
            onClick={() => router.push("/admissions/new")}
          >
            <BedDouble className="h-4 w-4" />
            Admit Patient
          </Button>
        </div>
      </div>

      {/* Doctor-instructions inbox */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-emerald-600" />
            Doctor Instructions
            {openTasks.length > 0 && (
              <Badge className="bg-amber-100 text-amber-800 border-amber-300">
                {openTasks.length} open
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            New instructions from doctors for your allotted patients. Acknowledge,
            start and complete each one here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {tasksLoading ? (
            <div className="flex items-center gap-2 text-xs text-slate-500 py-4">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading instructions…
            </div>
          ) : tasks.length === 0 ? (
            <p className="text-xs text-slate-500 py-4">
              No instructions yet. When a doctor leaves a note for your patient,
              it appears here — not in the general roster.
            </p>
          ) : (
            <div className="space-y-2">
              {openTasks.length === 0 && (
                <p className="text-xs text-emerald-600 font-medium py-1">
                  All caught up — {doneTasks.length} completed.
                </p>
              )}
              {openTasks.slice(0, 10).map((t) => (
                <div
                  key={t._id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-lg border p-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-xs text-slate-900 dark:text-white">
                        {t.title}
                      </span>
                      <Badge
                        variant="outline"
                        className={
                          t.priority === "STAT"
                            ? "text-[10px] text-rose-600 border-rose-300"
                            : t.priority === "Urgent"
                              ? "text-[10px] text-amber-600 border-amber-300"
                              : "text-[10px] text-slate-500"
                        }
                      >
                        {t.priority}
                      </Badge>
                      <Badge variant="outline" className="text-[10px]">
                        {t.status}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1 truncate">
                      {t.patientId?.name ?? "Patient"} • by{" "}
                      {t.authorId?.name ?? "Doctor"} •{" "}
                      {t.createdAt ? new Date(t.createdAt).toLocaleString() : ""}
                      {t.detail ? ` — ${t.detail}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {t.status === "NEW" && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => actOnTask(t, "ACKNOWLEDGED")}
                      >
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Acknowledge
                      </Button>
                    )}
                    {(t.status === "NEW" || t.status === "ACKNOWLEDGED") && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => actOnTask(t, "IN_PROGRESS")}
                      >
                        <Play className="h-3 w-3 mr-1" />
                        Start
                      </Button>
                    )}
                    {(t.status === "ACKNOWLEDGED" || t.status === "IN_PROGRESS") && (
                      <Button
                        size="sm"
                        className="h-7 px-2 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                        onClick={() => actOnTask(t, "COMPLETED")}
                      >
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Done
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs text-slate-400"
                      title="Cancel instruction"
                      onClick={() => actOnTask(t, "CANCELLED")}
                    >
                      <Ban className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Filter Bar */}
      <Card className="border shadow-sm">
        <CardContent className="p-3">
          <div className="flex flex-col sm:flex-row items-center gap-3">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search patient, UHID, bed, room, ward, doctor, diagnosis..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9 text-xs"
              />
            </div>

            <div className="w-full sm:w-56">
              <Select
                value={wardFilter}
                onChange={(e) => setWardFilter(e.target.value)}
                className="h-9 text-xs"
              >
                <option value="ALL">All Wards</option>
                {availableWards.map((w) => (
                  <option key={w} value={w}>
                    {w}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Inpatients Table */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">My Allotted Inpatients</CardTitle>
          <CardDescription>
            Showing {filteredInpatients.length} of {inpatients.length} patients allotted to you
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Bed & Room</TableHead>
                  <TableHead>Ward Location</TableHead>
                  <TableHead>Patient Particulars</TableHead>
                  <TableHead>Admitting Diagnosis</TableHead>
                  <TableHead>Attending Doctor</TableHead>
                  <TableHead>Allergies</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredInpatients.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-slate-500 py-12 text-xs">
                      No patients allotted to you yet. The care-team desk (admissions)
                      allots nurses to each stay — ask them to add you.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredInpatients.map((p) => (
                    <TableRow key={p.admissionId} className="text-xs hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                      <TableCell>
                        <div className="font-bold text-slate-900 dark:text-white font-mono text-sm">
                          Bed {p.bedNumber}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          Room {p.roomNumber}
                        </div>
                      </TableCell>

                      <TableCell>
                        <div className="font-medium text-slate-900 dark:text-white">
                          {p.wardName}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          Floor {p.floor} • {p.wardType}
                        </div>
                      </TableCell>

                      <TableCell>
                        <div className="font-semibold text-slate-900 dark:text-white">
                          {p.name}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          {p.uhid} • {p.gender}, {p.age}y
                        </div>
                      </TableCell>

                      <TableCell className="font-medium text-slate-800 dark:text-slate-200 max-w-xs truncate">
                        {p.diagnosis}
                      </TableCell>

                      <TableCell className="font-medium">
                        {p.doctorName}
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
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-xs flex items-center gap-1 text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                            onClick={() => openTimeline(p)}
                          >
                            <Eye className="h-3 w-3" />
                            Card
                          </Button>

                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-xs flex items-center gap-1 text-rose-600 border-rose-200 hover:bg-rose-50"
                            onClick={() => router.push(`/nursing/vitals?patientId=${p.patientId}&admissionId=${p.admissionId}`)}
                          >
                            <HeartPulse className="h-3 w-3" />
                            Vitals
                          </Button>

                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-xs flex items-center gap-1 text-purple-600 border-purple-200 hover:bg-purple-50"
                            onClick={() => router.push(`/nursing/medications?patientId=${p.patientId}&admissionId=${p.admissionId}`)}
                          >
                            <Pill className="h-3 w-3" />
                            Meds
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

      {/* Patient Clinical Care Card Modal */}
      <Dialog open={!!selectedPatient} onOpenChange={() => setSelectedPatient(null)}>
        <DialogContent className="max-w-xl">
          {selectedPatient && (
            <div className="space-y-4 text-xs">
              <DialogHeader>
                <div className="flex items-center justify-between border-b pb-3">
                  <div>
                    <DialogTitle className="text-base font-bold flex items-center gap-2">
                      <Users className="h-5 w-5 text-emerald-600" />
                      {selectedPatient.name}
                    </DialogTitle>
                    <DialogDescription>
                      UHID: {selectedPatient.uhid} • Admission ID: #{selectedPatient.admissionId?.slice(-6).toUpperCase()}
                    </DialogDescription>
                  </div>
                  <Badge className="bg-emerald-100 text-emerald-800 text-xs">
                    Bed {selectedPatient.bedNumber}
                  </Badge>
                </div>
              </DialogHeader>

              {/* Demographics & Admission details */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3 bg-slate-50 dark:bg-slate-800/40 rounded-lg">
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-semibold block">Ward & Room</span>
                  <div className="font-bold text-slate-900 dark:text-white mt-0.5">
                    {selectedPatient.wardName}
                  </div>
                  <div className="text-slate-500 text-[11px]">Room {selectedPatient.roomNumber} (Fl {selectedPatient.floor})</div>
                </div>

                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-semibold block">Attending Doctor</span>
                  <div className="font-bold text-slate-900 dark:text-white mt-0.5">
                    {selectedPatient.doctorName}
                  </div>
                  <div className="text-slate-500 text-[11px]">{selectedPatient.insurance}</div>
                </div>

                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-semibold block">Patient Demographics</span>
                  <div className="font-bold text-slate-900 dark:text-white mt-0.5">
                    {selectedPatient.gender}, {selectedPatient.age} years
                  </div>
                  <div className="text-slate-500 text-[11px]">Blood: {selectedPatient.bloodGroup || "Unknown"}</div>
                </div>
              </div>

              {/* Diagnosis */}
              <div className="p-3 border rounded-lg space-y-1">
                <span className="text-[10px] text-slate-400 uppercase font-semibold block">Admitting Diagnosis & Notes</span>
                <p className="font-medium text-slate-900 dark:text-white text-xs">
                  {selectedPatient.diagnosis}
                </p>
                <div className="text-[11px] text-slate-500">
                  Admitted on {new Date(selectedPatient.admissionDate).toLocaleString([], { dateStyle: "long", timeStyle: "short" })}
                </div>
              </div>

              {/* Allergy Warning */}
              {selectedPatient.allergies && selectedPatient.allergies.length > 0 && (
                <div className="p-3 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 rounded-lg flex items-center gap-2 text-rose-700 dark:text-rose-300">
                  <ShieldAlert className="h-5 w-5 shrink-0" />
                  <div>
                    <span className="font-bold block">Patient Allergy Alert:</span>
                    <span>Contraindications: {selectedPatient.allergies.join(", ")}</span>
                  </div>
                </div>
              )}

              {/* Clinical Action Navigation */}
              <div className="pt-2">
                <span className="text-[11px] font-semibold text-slate-500 block mb-2">Direct Bedside Workstations:</span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs text-rose-600 border-rose-200 hover:bg-rose-50 justify-start"
                    onClick={() => {
                      setSelectedPatient(null);
                      router.push(`/nursing/vitals?patientId=${selectedPatient.patientId}&admissionId=${selectedPatient.admissionId}`);
                    }}
                  >
                    <HeartPulse className="h-3.5 w-3.5 mr-1.5" />
                    Log Vitals
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs text-purple-600 border-purple-200 hover:bg-purple-50 justify-start"
                    onClick={() => {
                      setSelectedPatient(null);
                      router.push(`/nursing/medications?patientId=${selectedPatient.patientId}&admissionId=${selectedPatient.admissionId}`);
                    }}
                  >
                    <Pill className="h-3.5 w-3.5 mr-1.5" />
                    eMAR Meds
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs text-cyan-600 border-cyan-200 hover:bg-cyan-50 justify-start"
                    onClick={() => {
                      setSelectedPatient(null);
                      router.push(`/nursing/notes?patientId=${selectedPatient.patientId}&admissionId=${selectedPatient.admissionId}`);
                    }}
                  >
                    <FileText className="h-3.5 w-3.5 mr-1.5" />
                    Nurse Note
                  </Button>
                </div>
              </div>

              {/* Shared stay timeline: doctor sees what nurse did and vice versa */}
              <div className="p-3 border rounded-lg space-y-2">
                <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                  Stay Timeline — instructions, meds given, vitals
                </span>
                {timelineLoading ? (
                  <div className="flex items-center gap-2 text-[11px] text-slate-500 py-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading timeline…
                  </div>
                ) : !timeline ? (
                  <p className="text-[11px] text-slate-500">Timeline unavailable.</p>
                ) : (
                  <div className="space-y-2">
                    {(timeline.tasks ?? []).length > 0 && (
                      <div>
                        <span className="text-[11px] font-semibold block mb-1">
                          Doctor instructions ({timeline.tasks.length})
                        </span>
                        {(timeline.tasks ?? []).slice(0, 5).map((t: any) => (
                          <div key={t._id} className="text-[11px] flex items-center justify-between gap-2 py-1 border-b last:border-0">
                            <span className="truncate">
                              {t.title} <span className="text-slate-400">• {t.status} • {t.authorId?.name ?? "Doctor"}</span>
                            </span>
                            {["NEW", "ACKNOWLEDGED", "IN_PROGRESS"].includes(t.status) && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-6 px-2 text-[10px] shrink-0"
                                onClick={() =>
                                  actOnTask(
                                    t,
                                    t.status === "NEW"
                                      ? "ACKNOWLEDGED"
                                      : t.status === "ACKNOWLEDGED"
                                        ? "IN_PROGRESS"
                                        : "COMPLETED"
                                  )
                                }
                              >
                                {t.status === "NEW" ? "Ack" : t.status === "ACKNOWLEDGED" ? "Start" : "Done"}
                              </Button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {(timeline.medications ?? []).length > 0 && (
                      <div>
                        <span className="text-[11px] font-semibold block mb-1">
                          Meds — at x time patient got y ({timeline.medications.length})
                        </span>
                        {(timeline.medications ?? []).slice(0, 5).map((m: any) => (
                          <div key={m._id} className="text-[11px] py-1 border-b last:border-0">
                            <span className="font-medium">{m.medicationName}</span> {m.dosage}
                            <span className="text-slate-400">
                              {" "}• {m.status}
                              {m.administeredTime ? ` at ${new Date(m.administeredTime).toLocaleString()}` : ""}
                              {m.administeredBy?.name ? ` by ${m.administeredBy.name}` : ""}
                              {m.withheldReason ? ` (${m.withheldReason})` : ""}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                    {(timeline.vitals ?? []).length > 0 && (
                      <div>
                        <span className="text-[11px] font-semibold block mb-1">
                          Latest vitals ({timeline.vitals.length})
                        </span>
                        {(timeline.vitals ?? []).slice(0, 3).map((v: any) => (
                          <div key={v._id} className="text-[11px] text-slate-600 py-0.5">
                            {v.dateRecorded ? new Date(v.dateRecorded).toLocaleString() : ""} — BP{" "}
                            {v.bloodPressure ?? "—"}, HR {v.heartRate ?? "—"}, SpO2{" "}
                            {v.oxygenSaturation ?? "—"}
                            {v.recordedBy?.name ? ` (by ${v.recordedBy.name})` : ""}
                          </div>
                        ))}
                      </div>
                    )}
                    {(timeline.visits ?? []).length > 0 && (
                      <div>
                        <span className="text-[11px] font-semibold block mb-1">
                          Doctor visits ({timeline.visits.length})
                        </span>
                        {(timeline.visits ?? []).slice(0, 3).map((v: any) => (
                          <div key={v._id} className="text-[11px] text-slate-600 py-0.5">
                            {v.dateRecorded ? new Date(v.dateRecorded).toLocaleString() : ""} — {v.visitType ?? "Round"}
                            {v.condition ? ` • ${v.condition}` : ""}
                            {v.painScore !== undefined && v.painScore !== null ? ` • pain ${v.painScore}/10` : ""}
                            {v.doctor?.name ? ` (Dr. ${v.doctor.name})` : ""}
                            {v.assessment ? ` — ${v.assessment}` : ""}
                          </div>
                        ))}
                      </div>
                    )}
                    {(timeline.orders ?? []).length > 0 && (
                      <div>
                        <span className="text-[11px] font-semibold block mb-1">
                          Timed medication orders ({timeline.orders.length})
                        </span>
                        {(timeline.orders ?? []).slice(0, 4).map((o: any) => (
                          <div key={o._id} className="text-[11px] text-slate-600 py-0.5">
                            {o.medicationName} {o.dosage} • {o.frequency}
                            {o.timesOfDay?.length > 0 ? ` at ${o.timesOfDay.join(", ")}` : ""} • {o.status}
                            {o.doseCounts && ` (given ${o.doseCounts.GIVEN ?? 0}, pending ${o.doseCounts.PENDING ?? 0})`}
                          </div>
                        ))}
                      </div>
                    )}
                    {(timeline.tasks ?? []).length === 0 &&
                      (timeline.medications ?? []).length === 0 &&
                      (timeline.vitals ?? []).length === 0 &&
                      (timeline.visits ?? []).length === 0 &&
                      (timeline.orders ?? []).length === 0 && (
                        <p className="text-[11px] text-slate-500">
                          Nothing recorded for this stay yet.
                        </p>
                      )}
                  </div>
                )}
              </div>

              <DialogFooter className="pt-2">
                <Button variant="outline" size="sm" onClick={() => setSelectedPatient(null)}>
                  Close
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
