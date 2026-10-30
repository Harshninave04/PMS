"use client";

import React, { useEffect, useState, useMemo, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
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
  Eye,
  ShieldAlert,
  Loader2,
  BedDouble,
  ClipboardList,
  CheckCircle2,
  ArrowRightLeft,
  Banknote,
  AlertTriangle,
  Flag,
  Send,
  Undo2
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
  type HandoverPatient = { admissionId: string; name: string; bedNumber: string | number };
  type PatientInstructionsPatient = { admissionId: string; name: string; uhid: string };
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const [inpatients, setInpatients] = useState<any[]>([]);
  const [recentDischarges, setRecentDischarges] = useState<Array<{ admissionId: string; name: string; uhid: string; dischargeDate?: string; billingStatus?: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [handoverAdmissionId, setHandoverAdmissionId] = useState("");
  const [patientTab, setPatientTab] = useState<"inpatients" | "discharged">("inpatients");

  // Shared stay timeline (instructions + meds + vitals + notes)
  const [timeline, setTimeline] = useState<any>(null);
  const [timelineLoading, setTimelineLoading] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [wardFilter, setWardFilter] = useState("ALL");

  // Selected Inpatient Modal
  const [selectedPatient, setSelectedPatient] = useState<any>(null);
  const [instructionsPatient, setInstructionsPatient] = useState<PatientInstructionsPatient | null>(null);
  const [patientInstructions, setPatientInstructions] = useState<any[]>([]);
  const [patientInstructionsLoading, setPatientInstructionsLoading] = useState(false);
  const [handoverPatient, setHandoverPatient] = useState<HandoverPatient | null>(null);
  const [handoverNurses, setHandoverNurses] = useState<{ id: string; name: string; email: string }[]>([]);
  const [receivingNurseId, setReceivingNurseId] = useState("");
  const [handoverNote, setHandoverNote] = useState("");
  const [handoverNursesLoading, setHandoverNursesLoading] = useState(false);
  const [handoverSubmitting, setHandoverSubmitting] = useState(false);

  // Discharge pipeline: doctor flagged -> nurse reviews, notes, sends to billing.
  const [dischargePatient, setDischargePatient] = useState<any>(null);
  const [dischargeTimeline, setDischargeTimeline] = useState<any>(null);
  const [dischargeTimelineLoading, setDischargeTimelineLoading] = useState(false);
  const [expectedDischargeAt, setExpectedDischargeAt] = useState("");
  const [dischargeNoteText, setDischargeNoteText] = useState("");
  const [dischargeNoteSaving, setDischargeNoteSaving] = useState(false);
  const [dischargeActing, setDischargeActing] = useState(false);
  const [flaggedOnly, setFlaggedOnly] = useState(searchParams.get("flagged") === "1");

  const loadData = async () => {
    try {
      const [rosterRes, historyRes] = await Promise.all([
        fetch("/api/nursing/my-patients"),
        fetch("/api/nursing/my-patients?history=discharged"),
      ]);
      const [data, historyData] = await Promise.all([rosterRes.json(), historyRes.json()]);
      if (data.success) {
        const patients = data.data || [];
        setInpatients(patients);
        if (historyRes.ok && historyData.success) setRecentDischarges(historyData.data || []);
        const transferAdmissionId = searchParams.get("transferAdmissionId");
        const transferPatient = patients.find((patient: HandoverPatient) => patient.admissionId === transferAdmissionId);
        if (transferAdmissionId && transferPatient) {
          router.replace("/nursing/patients", { scroll: false });
          void beginNurseTransfer(transferPatient);
        }
      } else {
        toast("Failed to load inpatients", "error");
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
    loadData();
  };

  const openTimeline = async (patient: any) => {
    if (!patient.discharged && patient.admissionId) {
      router.push(`/nursing/patients/${encodeURIComponent(String(patient.admissionId))}/handover`);
      return;
    }

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

  const openPatientInstructions = async (patient: PatientInstructionsPatient) => {
    setInstructionsPatient(patient);
    setPatientInstructions([]);
    setPatientInstructionsLoading(true);
    try {
      const response = await fetch(`/api/care-tasks?admissionId=${encodeURIComponent(patient.admissionId)}`);
      const result = await response.json();
      if (!response.ok || !result.success) {
        toast(result.message || "Failed to load doctor instructions", "error");
        return;
      }
      setPatientInstructions(result.data || []);
    } catch {
      toast("Failed to load doctor instructions", "error");
    } finally {
      setPatientInstructionsLoading(false);
    }
  };

  const openShiftHandover = () => {
    const admissionId = handoverAdmissionId || inpatients[0]?.admissionId;
    const patient = inpatients.find((inpatient) => inpatient.admissionId === admissionId);
    if (patient) openTimeline(patient);
  };

  const openDischargePanel = async (patient: any) => {
    setDischargePatient(patient);
    setDischargeTimeline(null);
    setDischargeTimelineLoading(true);
    setExpectedDischargeAt(
      patient.expectedDischargeAt ? new Date(patient.expectedDischargeAt).toISOString().slice(0, 16) : ""
    );
    setDischargeNoteText("");
    try {
      const res = await fetch(
        `/api/care-tasks/timeline?admissionId=${patient.admissionId}`
      );
      const data = await res.json();
      if (res.ok && data.success) setDischargeTimeline(data.data);
    } catch {
      // Timeline is supplementary.
    } finally {
      setDischargeTimelineLoading(false);
    }
  };

  const submitDischargeNote = async () => {
    if (!dischargePatient || !dischargeNoteText.trim()) return;
    setDischargeNoteSaving(true);
    try {
      const res = await fetch("/api/admission/discharge-note", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          admissionId: dischargePatient.admissionId,
          text: dischargeNoteText.trim(),
        }),
      });
      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.message || "Failed to add note");
      }
      toast("Note added to the discharge case", "success");
      setDischargePatient((prev: any) =>
        prev
          ? {
              ...prev,
              dischargeNotes: [
                ...(prev.dischargeNotes ?? []),
                { text: dischargeNoteText.trim(), at: new Date().toISOString(), byName: "You" },
              ],
            }
          : prev
      );
      setDischargeNoteText("");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Failed to add note", "error");
    } finally {
      setDischargeNoteSaving(false);
    }
  };

  const sendToBilling = async () => {
    if (!dischargePatient) return;
    if (!expectedDischargeAt) {
      toast("Expected discharge date and time are required", "error");
      return;
    }
    setDischargeActing(true);
    try {
      const noteText = dischargeNoteText.trim();
      if (noteText) {
        const noteRes = await fetch("/api/admission/discharge-note", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            admissionId: dischargePatient.admissionId,
            text: noteText,
          }),
        });
        const noteResult = await noteRes.json();
        if (!noteRes.ok || !noteResult.success) {
          throw new Error(noteResult.message || "Failed to save the note before sending");
        }
      }
      const res = await fetch("/api/admission/billing-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          admissionId: dischargePatient.admissionId,
          expectedDischargeAt,
        }),
      });
      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.message || "Failed to send to billing");
      }
      const supplyCount = Array.isArray(result.data?.billingMedicalSupplies)
        ? result.data.billingMedicalSupplies.length
        : 0;
      toast(
        `${result.message || "Sent to billing"} ${supplyCount} medical supply record${supplyCount === 1 ? "" : "s"} included.`,
        "success"
      );
      setDischargePatient((prev: any) =>
        prev ? { ...prev, billingRequested: true, expectedDischargeAt } : prev
      );
      setDischargeNoteText("");
      await loadData();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Failed to send to billing", "error");
    } finally {
      setDischargeActing(false);
    }
  };

  const recallFromBilling = async () => {
    if (!dischargePatient) return;
    setDischargeActing(true);
    try {
      const res = await fetch("/api/admission/billing-request", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ admissionId: dischargePatient.admissionId }),
      });
      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.message || "Failed to recall from billing");
      }
      toast(result.message || "Recalled from billing", "success");
      setDischargePatient((prev: any) => (prev ? { ...prev, billingRequested: false } : prev));
      await loadData();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Failed to recall from billing", "error");
    } finally {
      setDischargeActing(false);
    }
  };

  const beginNurseTransfer = async (patient: HandoverPatient) => {
    setHandoverPatient(patient);
    setHandoverNurses([]);
    setReceivingNurseId("");
    setHandoverNote("");
    setHandoverNursesLoading(true);
    try {
      const res = await fetch(`/api/nursing/handover?admissionId=${encodeURIComponent(patient.admissionId)}`);
      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.message || "Could not load nurses for handover");
      }
      const nurses = result.data?.nurses ?? [];
      setHandoverNurses(nurses);
      setReceivingNurseId(nurses[0]?.id ?? "");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not load nurses for handover", "error");
    } finally {
      setHandoverNursesLoading(false);
    }
  };

  const submitNurseTransfer = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!handoverPatient || !receivingNurseId || !handoverNote.trim()) {
      toast("Choose a receiving nurse and add a handover note", "error");
      return;
    }

    setHandoverSubmitting(true);
    try {
      const res = await fetch("/api/nursing/handover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          admissionId: handoverPatient.admissionId,
          receivingNurseId,
          handoverNote: handoverNote.trim(),
        }),
      });
      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.message || "Failed to transfer patient");
      }
      toast(result.message || "Patient handed over successfully", "success");
      setHandoverPatient(null);
      await loadData();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Failed to transfer patient", "error");
    } finally {
      setHandoverSubmitting(false);
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
        if (selectedPatient) openTimeline(selectedPatient);
        if (instructionsPatient) openPatientInstructions(instructionsPatient);
      } else {
        toast(data.message || "Failed to update instruction", "error");
      }
    } catch {
      toast("Error updating instruction", "error");
    }
  };

  const panelPendingDoses = useMemo(
    () => (dischargeTimeline?.medications ?? []).filter((m: any) => m.status === "PENDING").length,
    [dischargeTimeline]
  );
  const panelExceptionDoses = useMemo(
    () =>
      (dischargeTimeline?.medications ?? []).filter((m: any) =>
        ["WITHHELD", "REFUSED"].includes(m.status)
      ).length,
    [dischargeTimeline]
  );
  const panelOpenInstructions = useMemo(
    () =>
      (dischargeTimeline?.tasks ?? []).filter((t: any) =>
        ["NEW", "ACKNOWLEDGED", "IN_PROGRESS"].includes(t.status)
      ).length,
    [dischargeTimeline]
  );
  const panelRoundCount = useMemo(() => (dischargeTimeline?.visits ?? []).length, [dischargeTimeline]);
  const panelLatestVital = dischargeTimeline?.vitals?.[0];

  // Distinct Wards
  const availableWards = useMemo(() => {
    const set = new Set<string>();
    inpatients.forEach((p) => {
      if (p.wardName) set.add(p.wardName);
    });
    return Array.from(set);
  }, [inpatients]);

  const dischargeFlagCount = useMemo(
    () => inpatients.filter((p) => p.dischargeRequested).length,
    [inpatients]
  );

  const filteredInpatients = useMemo(() => {
    return inpatients.filter((p) => {
      if (flaggedOnly && !p.dischargeRequested) return false;
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
  }, [inpatients, searchQuery, wardFilter, flaggedOnly]);

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
            Only patients allotted to you by the care-team desk.
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

      <div
        className="flex gap-1 border-b border-slate-200 dark:border-slate-800"
        role="tablist"
        aria-label="Nursing patients"
      >
        <button
          id="nursing-inpatients-tab"
          type="button"
          role="tab"
          aria-selected={patientTab === "inpatients"}
          aria-controls="nursing-inpatients-panel"
          tabIndex={patientTab === "inpatients" ? 0 : -1}
          onClick={() => setPatientTab("inpatients")}
          className={`border-b-2 px-4 py-2 text-sm font-medium ${
            patientTab === "inpatients"
              ? "border-emerald-600 text-emerald-700 dark:text-emerald-300"
              : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
          }`}
        >
          My Allotted Inpatients
        </button>
        <button
          id="nursing-discharged-tab"
          type="button"
          role="tab"
          aria-selected={patientTab === "discharged"}
          aria-controls="nursing-discharged-panel"
          tabIndex={patientTab === "discharged" ? 0 : -1}
          onClick={() => setPatientTab("discharged")}
          className={`border-b-2 px-4 py-2 text-sm font-medium ${
            patientTab === "discharged"
              ? "border-emerald-600 text-emerald-700 dark:text-emerald-300"
              : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
          }`}
        >
          Discharged Patients
          {recentDischarges.length > 0 && (
            <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs dark:bg-slate-800">
              {recentDischarges.length}
            </span>
          )}
        </button>
      </div>

      {/* Filter Bar */}
      {patientTab === "inpatients" ? <div
        id="nursing-inpatients-panel"
        role="tabpanel"
        aria-labelledby="nursing-inpatients-tab"
        tabIndex={0}
        className="space-y-3"
      >
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

            <Button
              variant="outline"
              size="sm"
              onClick={() => setFlaggedOnly((prev) => !prev)}
              className={`h-9 text-xs flex items-center gap-1.5 shrink-0 ${
                flaggedOnly
                  ? "border-amber-300 bg-amber-50 text-amber-700 dark:bg-amber-950/30"
                  : "text-slate-500"
              }`}
              title={flaggedOnly ? "Showing only doctor-flagged discharges" : "Filter to doctor-flagged discharges"}
            >
              <Flag className="h-3.5 w-3.5" />
              Discharge flags ({dischargeFlagCount})
            </Button>
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
                  <TableHead>Patient Particulars</TableHead>
                  <TableHead>Ward Location</TableHead>
                  <TableHead>Bed & Room</TableHead>
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
                    <TableRow
                      key={p.admissionId}
                      tabIndex={0}
                      aria-label={`View handover details for ${p.name}`}
                      title="Open patient details and shift handover"
                      onClick={(event) => {
                        if (event.target instanceof Element && event.target.closest("button, a, input, select, textarea")) return;
                        openTimeline(p);
                      }}
                      onKeyDown={(event) => {
                        if (event.target !== event.currentTarget || (event.key !== "Enter" && event.key !== " ")) return;
                        event.preventDefault();
                        openTimeline(p);
                      }}
                      className="cursor-pointer text-xs hover:bg-slate-50/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-600 dark:hover:bg-slate-800/40"
                    >
                      <TableCell>
                        <div className="font-semibold text-slate-900 dark:text-white">
                          {p.name}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          {p.uhid} • {p.gender}, {p.age}y
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
                        <div className="font-bold text-slate-900 dark:text-white font-mono text-sm">
                          Bed {p.bedNumber}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          Room {p.roomNumber}
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
                          {p.dischargeRequested ? (
                            <>
                              {p.billingRequested ? (
                                <>
                                <Badge
                                  className="bg-emerald-100 text-emerald-800 border-emerald-300 text-[10px]"
                                  title={`Sent to billing${p.expectedDischargeAt ? ` • expected discharge ${new Date(p.expectedDischargeAt).toLocaleString()}` : ""}`}
                                >
                                  <CheckCircle2 className="h-3 w-3 mr-1" />
                                  Sent to billing
                                </Badge>
                                {p.billingStatus === "BILLING_COMPLETED" && <Badge className="border-emerald-300 bg-emerald-100 text-[10px] text-emerald-800">Billing Completed</Badge>}
                                <Badge className="border-amber-300 bg-amber-100 text-[10px] text-amber-800">Discharge Pending</Badge>
                                </>
                              ) : (
                                <Badge
                                  className="bg-amber-100 text-amber-800 border-amber-300 text-[10px]"
                                  title={
                                    p.flaggedByName || p.dischargeRequestNotes
                                      ? `Flagged by ${p.flaggedByName || "doctor"}${p.dischargeRequestNotes ? ` — ${p.dischargeRequestNotes}` : ""}`
                                      : "Discharge flagged by the doctor"
                                  }
                                >
                                  <Flag className="h-3 w-3 mr-1" />
                                  Flagged
                                </Badge>
                              )}
                              <Button
                                size="sm"
                                className="h-7 px-2 text-xs flex items-center gap-1 bg-sky-700 hover:bg-sky-800 text-white"
                                onClick={() => openDischargePanel(p)}
                                title={
                                  p.billingRequested
                                    ? "Already sent to billing — open the panel to recall or add notes"
                                    : "Review the stay and send the case to billing"
                                }
                              >
                                <Banknote className="h-3 w-3" />
                                Discharge
                              </Button>

                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 px-2 text-xs flex items-center gap-1 text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                                onClick={() => openTimeline(p)}
                              >
                                <Eye className="h-3 w-3" />
                                View handover
                              </Button>

                            </>
                          ) : (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 px-2 text-xs flex items-center gap-1 text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                                onClick={() => openTimeline(p)}
                              >
                                <Eye className="h-3 w-3" />
                                View handover
                              </Button>

                            </>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-xs flex items-center gap-1 text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                            onClick={() => openPatientInstructions(p)}
                          >
                            <Eye className="h-3 w-3" />
                            Doctor Instructions
                          </Button>

                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-xs flex items-center gap-1 text-cyan-700 border-cyan-200 hover:bg-cyan-50"
                            onClick={() => beginNurseTransfer(p)}
                          >
                            <ArrowRightLeft className="h-3 w-3" />
                            Transfer shift
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
      </div> : (
        <div
          id="nursing-discharged-panel"
          role="tabpanel"
          aria-labelledby="nursing-discharged-tab"
          tabIndex={0}
          className="space-y-3"
        >
          <Card className="border shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">Discharged Patients</CardTitle>
              <CardDescription>
                Read-only history for stays previously assigned to you · {recentDischarges.length} patients
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {recentDischarges.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-500">
                  No discharged patients are available in your assigned history.
                </p>
              ) : recentDischarges.map((patient) => (
                <div key={patient.admissionId} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-800 dark:bg-slate-900">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900 dark:text-white">
                      {patient.name} <span className="font-mono text-xs text-slate-500">{patient.uhid}</span>
                    </p>
                    <p className="text-xs text-slate-500">
                      Discharged {patient.dischargeDate ? new Date(patient.dischargeDate).toLocaleString() : "time unavailable"}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {patient.billingStatus === "BILLING_COMPLETED" && (
                      <Badge className="bg-emerald-100 text-emerald-800">Billing Completed</Badge>
                    )}
                    <Badge variant="outline" className="border-rose-300 text-rose-800">DISCHARGED</Badge>
                    <Button variant="outline" size="sm" onClick={() => void openTimeline({ ...patient, discharged: true })}>
                      <Eye className="mr-1 h-3.5 w-3.5" /> View history
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      <Dialog
        open={!!handoverPatient}
        onOpenChange={(open) => !open && !handoverSubmitting && setHandoverPatient(null)}
      >
        <DialogContent className="max-w-lg">
          <form onSubmit={submitNurseTransfer}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ArrowRightLeft className="h-5 w-5 text-cyan-700" />
                Transfer patient to another nurse
              </DialogTitle>
              <DialogDescription>
                {handoverPatient
                  ? `Hand over ${handoverPatient.name} (Bed ${handoverPatient.bedNumber}). You will be removed from this patient's nursing team.`
                  : "Transfer the patient to another nurse."}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-1.5">
                <label htmlFor="receiving-nurse" className="text-sm font-medium">
                  Receiving nurse *
                </label>
                <Select
                  id="receiving-nurse"
                  value={receivingNurseId}
                  onChange={(event) => setReceivingNurseId(event.target.value)}
                  disabled={handoverNursesLoading || handoverNurses.length === 0 || handoverSubmitting}
                  required
                >
                  {handoverNursesLoading ? (
                    <option value="">Loading nurses...</option>
                  ) : handoverNurses.length === 0 ? (
                    <option value="">No other active nurses available in this branch</option>
                  ) : (
                    handoverNurses.map((nurse) => (
                      <option key={nurse.id} value={nurse.id}>{nurse.name} · {nurse.email}</option>
                    ))
                  )}
                </Select>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="handover-note" className="text-sm font-medium">
                  Handover note *
                </label>
                <Textarea
                  id="handover-note"
                  rows={4}
                  maxLength={2000}
                  placeholder="Summarize the patient's current condition, pending care, and what the next nurse should follow up."
                  value={handoverNote}
                  onChange={(event) => setHandoverNote(event.target.value)}
                  required
                  disabled={handoverSubmitting}
                />
                <p className="text-xs text-slate-500">
                  The note and transfer time will be saved in the patient’s handover history.
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setHandoverPatient(null)}
                disabled={handoverSubmitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="bg-cyan-700 text-white hover:bg-cyan-800"
                disabled={handoverNursesLoading || handoverNurses.length === 0 || handoverSubmitting || !handoverNote.trim()}
              >
                {handoverSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {handoverSubmitting ? "Transferring..." : "Confirm shift transfer"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!instructionsPatient}
        onOpenChange={(open) => {
          if (!open) {
            setInstructionsPatient(null);
            setPatientInstructions([]);
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          {instructionsPatient && (
            <div className="space-y-4">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <ClipboardList className="h-5 w-5 text-emerald-600" />
                  Doctor Instructions — {instructionsPatient.name}
                </DialogTitle>
                <DialogDescription>
                  Instructions for this patient only · UHID: {instructionsPatient.uhid}
                </DialogDescription>
              </DialogHeader>

              {patientInstructionsLoading ? (
                <div className="flex items-center gap-2 py-6 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading instructions...
                </div>
              ) : patientInstructions.length === 0 ? (
                <p className="py-6 text-sm text-slate-500">
                  No doctor instructions have been recorded for this patient.
                </p>
              ) : (
                <div className="max-h-[60vh] space-y-3 overflow-y-auto">
                  {patientInstructions.map((instruction) => (
                    <div key={instruction._id} className="space-y-2 rounded-lg border p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-slate-900 dark:text-white">{instruction.title}</span>
                        <Badge
                          variant="outline"
                          className={instruction.priority === "STAT"
                            ? "text-rose-600 border-rose-300"
                            : instruction.priority === "Urgent"
                              ? "text-amber-600 border-amber-300"
                              : ""}
                        >
                          {instruction.priority}
                        </Badge>
                        <Badge variant="outline">{instruction.status}</Badge>
                      </div>
                      {instruction.detail && (
                        <p className="whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-300">
                          {instruction.detail}
                        </p>
                      )}
                      <p className="text-xs text-slate-500">
                        By {instruction.authorId?.name ?? "Doctor"}
                        {instruction.createdAt ? ` · ${new Date(instruction.createdAt).toLocaleString()}` : ""}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {instruction.status === "NEW" && (
                          <Button variant="outline" size="sm" onClick={() => actOnTask(instruction, "ACKNOWLEDGED")}>
                            Acknowledge
                          </Button>
                        )}
                        {(instruction.status === "NEW" || instruction.status === "ACKNOWLEDGED") && (
                          <Button variant="outline" size="sm" onClick={() => actOnTask(instruction, "IN_PROGRESS")}>
                            Start
                          </Button>
                        )}
                        {(instruction.status === "ACKNOWLEDGED" || instruction.status === "IN_PROGRESS") && (
                          <Button size="sm" className="bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => actOnTask(instruction, "COMPLETED")}>
                            Complete
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setInstructionsPatient(null)}>Close</Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Shift handover detail */}
      <Dialog open={!!selectedPatient} onOpenChange={() => setSelectedPatient(null)}>
        <DialogContent className="max-w-xl">
          {selectedPatient && (
            <div className="space-y-4 text-xs">
              <DialogHeader>
                <div className="flex items-center justify-between border-b pb-3">
                  <div>
                    <DialogTitle className="text-base font-bold flex items-center gap-2">
                      <ClipboardList className="h-5 w-5 text-cyan-700" />
                      Shift handover — {selectedPatient.name}
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
                    className="text-xs text-emerald-700 border-emerald-200 hover:bg-emerald-50 justify-start"
                    onClick={() => {
                      setSelectedPatient(null);
                      router.push(`/nursing/notes?patientId=${selectedPatient.patientId}&admissionId=${selectedPatient.admissionId}`);
                    }}
                  >
                    <ClipboardList className="h-3.5 w-3.5 mr-1.5" />
                    Daily Nursing Records
                  </Button>
                </div>
              </div>

              {/* Shared stay timeline: doctor sees what nurse did and vice versa */}
              <div className="p-3 border rounded-lg space-y-2">
                <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                  Shift handover — care instructions, medication, vitals, and notes
                </span>
                {selectedPatient?.discharged && (
                  <p className="rounded-md border border-rose-200 bg-rose-50 px-2.5 py-2 text-[11px] font-medium text-rose-800">
                    Patient discharged. This admission is closed; new nursing entries are not allowed.
                  </p>
                )}
                {timelineLoading ? (
                  <div className="flex items-center gap-2 text-[11px] text-slate-500 py-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading timeline…
                  </div>
                ) : !timeline ? (
                  <p className="text-[11px] text-slate-500">Timeline unavailable.</p>
                ) : (
                  <div className="space-y-2">
                    {(timeline.handoverHistory ?? []).length > 0 && (
                      <div className="rounded-md border border-cyan-200 bg-cyan-50/70 p-2.5">
                        <span className="text-[11px] font-semibold block mb-1 text-cyan-900">
                          Nurse-to-nurse handover history
                        </span>
                        {[...(timeline.handoverHistory ?? [])].reverse().slice(0, 3).map((handover) => (
                          <div key={handover._id} className="border-t border-cyan-100 py-1.5 text-[11px] text-slate-700 first:border-0">
                            <div className="font-medium">
                              {handover.fromNurseId?.name ?? "Nurse"} handed over to {handover.toNurseId?.name ?? "Nurse"}
                              {handover.handedOverAt ? ` · ${new Date(handover.handedOverAt).toLocaleString()}` : ""}
                            </div>
                            <p className="mt-0.5 whitespace-pre-wrap">{handover.handoverNote}</p>
                          </div>
                        ))}
                      </div>
                    )}
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
                            {!selectedPatient?.discharged && ["NEW", "ACKNOWLEDGED", "IN_PROGRESS"].includes(t.status) && (
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

      {/* Discharge process panel: doctor flag -> nurse review -> billing */}
      <Dialog
        open={!!dischargePatient}
        onOpenChange={(open) => {
          if (!open && !dischargeActing && !dischargeNoteSaving) setDischargePatient(null);
        }}
      >
        <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto">
          {dischargePatient && (
            <div className="space-y-4 text-xs">
              <DialogHeader>
                <div className="flex items-center justify-between border-b pb-3">
                  <div>
                    <DialogTitle className="text-base font-bold flex items-center gap-2">
                      <Banknote className="h-5 w-5 text-sky-700" />
                      Discharge process — {dischargePatient.name}
                    </DialogTitle>
                    <DialogDescription>
                      UHID: {dischargePatient.uhid} • Review the stay, add notes, then send the case to billing.
                    </DialogDescription>
                  </div>
                  {dischargePatient.billingRequested ? (
                    <Badge className="bg-emerald-100 text-emerald-800 text-xs shrink-0">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Sent to billing
                    </Badge>
                  ) : (
                    <Badge className="bg-amber-100 text-amber-800 border-amber-300 text-xs shrink-0">
                      <Flag className="h-3 w-3 mr-1" />
                      Flagged for discharge
                    </Badge>
                  )}
                </div>
              </DialogHeader>

              <div className="p-3 border border-amber-200 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/20 rounded-lg space-y-1">
                <span className="text-[10px] text-amber-700 dark:text-amber-400 uppercase font-semibold block">
                  Discharge request from the doctor
                </span>
                <p className="font-medium text-slate-900 dark:text-white">
                  Flagged by {dischargePatient.flaggedByName || "the treating doctor"}
                  {dischargePatient.dischargeRequestedAt
                    ? ` · ${new Date(dischargePatient.dischargeRequestedAt).toLocaleString()}`
                    : ""}
                </p>
                {dischargePatient.dischargeRequestNotes ? (
                  <p className="text-[11px] text-slate-600 dark:text-slate-300 whitespace-pre-wrap">
                    “{dischargePatient.dischargeRequestNotes}”
                  </p>
                ) : (
                  <p className="text-[11px] text-slate-500">No note from the doctor.</p>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 bg-slate-50 dark:bg-slate-800/40 rounded-lg">
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-semibold block">Ward & Bed</span>
                  <div className="font-bold text-slate-900 dark:text-white mt-0.5">
                    {dischargePatient.wardName}
                  </div>
                  <div className="text-slate-500 text-[11px]">
                    Room {dischargePatient.roomNumber} · Bed {dischargePatient.bedNumber}
                  </div>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-semibold block">Attending</span>
                  <div className="font-bold text-slate-900 dark:text-white mt-0.5">
                    {dischargePatient.doctorName}
                  </div>
                  <div className="text-slate-500 text-[11px]">{dischargePatient.insurance}</div>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-semibold block">Patient</span>
                  <div className="font-bold text-slate-900 dark:text-white mt-0.5">
                    {dischargePatient.gender}, {dischargePatient.age} years
                  </div>
                  <div className="text-slate-500 text-[11px]">
                    Blood: {dischargePatient.bloodGroup || "Unknown"}
                  </div>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-semibold block">Stay</span>
                  <div className="font-bold text-slate-900 dark:text-white mt-0.5">
                    {new Date(dischargePatient.admissionDate).toLocaleDateString()}
                  </div>
                  <div className="text-slate-500 text-[11px]">
                    {Math.max(
                      1,
                      Math.ceil(
                        (Date.now() - new Date(dischargePatient.admissionDate).getTime()) / 86400000
                      )
                    )}{" "}
                    day(s) so far
                  </div>
                </div>
              </div>

              {dischargePatient.allergies && dischargePatient.allergies.length > 0 && (
                <div className="p-3 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 rounded-lg flex items-center gap-2 text-rose-700 dark:text-rose-300">
                  <ShieldAlert className="h-4 w-4 shrink-0" />
                  <span>Allergies on file: {dischargePatient.allergies.join(", ")}</span>
                </div>
              )}

              <div className="p-3 border rounded-lg space-y-1.5">
                <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                  Expected discharge date &amp; time *
                </span>
                <Input
                  type="datetime-local"
                  value={expectedDischargeAt}
                  onChange={(event) => setExpectedDischargeAt(event.target.value)}
                  disabled={dischargePatient.billingRequested || dischargeActing}
                  className="h-8 text-xs w-64"
                />
                <p className="text-[11px] text-slate-500">
                  Bed, room and nursing charges run until the real discharge from the Admissions desk — this expected
                  date guides the accountant&apos;s bill cut-off.
                </p>
              </div>

              <div className="p-3 border rounded-lg space-y-2">
                <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                  Review before sending
                </span>
                {dischargeTimelineLoading ? (
                  <div className="flex items-center gap-2 text-[11px] text-slate-500 py-1">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading clinical timeline…
                  </div>
                ) : !dischargeTimeline ? (
                  <p className="text-[11px] text-slate-500">
                    Clinical timeline unavailable — verify chart details before sending.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 text-[11px]">
                      {panelOpenInstructions > 0 ? (
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                      ) : (
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                      )}
                      <span>
                        Doctor instructions: {panelOpenInstructions} of{" "}
                        {dischargeTimeline.tasks?.length ?? 0} still open
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px]">
                      {panelPendingDoses + panelExceptionDoses > 0 ? (
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                      ) : (
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                      )}
                      <span>
                        Medication doses: {panelPendingDoses} pending
                        {panelExceptionDoses > 0 ? `, ${panelExceptionDoses} withheld/refused` : ""}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px]">
                      {panelRoundCount > 0 ? (
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                      ) : (
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                      )}
                      <span>
                        Doctor rounds recorded: {panelRoundCount}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px]">
                      {panelLatestVital ? (
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                      ) : (
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                      )}
                      <span>
                        {panelLatestVital
                          ? `Latest vitals: BP ${panelLatestVital.bloodPressure ?? "—"}, HR ${panelLatestVital.heartRate ?? "—"}, SpO2 ${panelLatestVital.oxygenSaturation ?? "—"}`
                          : "No vitals recorded for this stay"}
                      </span>
                    </div>
                  </div>
                )}
                <p className="text-[11px] text-slate-500">
                  These are advisories, not blocks — you decide when the stay is ready for billing.
                </p>
              </div>

              <div className="p-3 border rounded-lg space-y-2">
                <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                  Nurse notes for the account desk ({dischargePatient.dischargeNotes?.length ?? 0})
                </span>
                {dischargePatient.dischargeNotes &&
                dischargePatient.dischargeNotes.length > 0 ? (
                  [...dischargePatient.dischargeNotes].reverse().map((note: any, index: number) => (
                    <div
                      key={index}
                      className="border-t border-slate-100 dark:border-slate-800 py-1.5 first:border-0"
                    >
                      <p className="whitespace-pre-wrap text-[11px] text-slate-700 dark:text-slate-200">
                        {note.text}
                      </p>
                      <p className="text-[10px] text-slate-400">
                        {note.byName || "Nurse"} · {note.at ? new Date(note.at).toLocaleString() : ""}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="text-[11px] text-slate-500">
                    No notes yet — anything the accountant should know (deposits taken, extra consumables, checkout plans)?
                  </p>
                )}
                <div className="space-y-1.5 pt-1">
                  <Textarea
                    rows={2}
                    maxLength={2000}
                    placeholder="e.g. relatives deposited Rs 5,000 at the counter; 2 oxygen cylinders consumed…"
                    value={dischargeNoteText}
                    onChange={(event) => setDischargeNoteText(event.target.value)}
                    disabled={dischargeNoteSaving || dischargeActing}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={submitDischargeNote}
                    disabled={!dischargeNoteText.trim() || dischargeNoteSaving || dischargeActing}
                  >
                    {dischargeNoteSaving && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                    Add note
                  </Button>
                </div>
              </div>

              <DialogFooter className="pt-2 sm:justify-between gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDischargePatient(null)}
                  disabled={dischargeActing}
                >
                  {dischargePatient.billingRequested ? "Close" : "Cancel"}
                </Button>
                {dischargePatient.billingRequested ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-amber-300 text-amber-700 hover:bg-amber-50"
                    onClick={recallFromBilling}
                    disabled={dischargeActing}
                    title="Pull the case back from billing while the accountant has not prepared the bill yet"
                  >
                    {dischargeActing && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                    <Undo2 className="mr-1 h-3.5 w-3.5" />
                    {dischargeActing ? "Recalling..." : "Recall from billing"}
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    className="bg-sky-700 hover:bg-sky-800 text-white"
                    onClick={sendToBilling}
                    disabled={dischargeActing || !expectedDischargeAt}
                    title="Hand this stay to the accountant for the final bill"
                  >
                    {dischargeActing && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                    <Send className="mr-1 h-3.5 w-3.5" />
                    {dischargeActing ? "Sending..." : "Send to billing"}
                  </Button>
                )}
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
