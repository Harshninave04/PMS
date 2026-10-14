"use client";

import React, { useEffect, useMemo, useState, Suspense } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { FREQUENCY_SUGGESTIONS } from "@/lib/medication-schedule";
import { flagVitalForReview } from "@/lib/vital-flags";
import {
  Stethoscope,
  RefreshCw,
  Plus,
  Trash2,
  Loader2,
  Clock3,
  Pill,
  Ban,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";

const FREQUENCIES = ["STAT", "OD", "BD", "TDS", "QID", "Q6H", "Q8H", "Q12H", "HS", "PRN"] as const;
const ROUTES = ["ORAL", "IV", "IM", "SC", "TOPICAL", "INHALATION", "OTHER"] as const;

interface MedRow {
  medicationName: string;
  dosage: string;
  route: string;
  frequency: string;
  times: string;
  durationDays: string;
  instructions: string;
}

const emptyMedRow = (): MedRow => ({
  medicationName: "",
  dosage: "",
  route: "ORAL",
  frequency: "BD",
  times: (FREQUENCY_SUGGESTIONS.BD ?? []).join(", "),
  durationDays: "3",
  instructions: "",
});

// Medicine picker: search live pharmacy stock; free text still allowed so a
// doctor is never blocked — unlisted names surface in pharmacy as restock
// suggestions.
function MedicinePicker({ value, onPick }: { value: string; onPick: (name: string) => void }) {
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const q = value.trim();
    if (q.length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    setSearching(true);
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/pharmacy/medicines?search=${encodeURIComponent(q)}`);
        const data = await res.json();
        if (res.ok && data.success) {
          setResults((data.data || []).slice(0, 8));
          setOpen(true);
        }
      } catch {
        // Picker is assistive; free text always works.
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [value]);

  const exactHit = results.some((m) => (m.name ?? "").toLowerCase() === value.trim().toLowerCase());

  return (
    <div className="relative">
      <Input
        placeholder="Medicine — type to search pharmacy stock"
        value={value}
        onChange={(e) => onPick(e.target.value)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        onFocus={() => results.length > 0 && setOpen(true)}
        className="h-9"
      />
      {open && (
        <div className="absolute z-20 mt-1 max-h-52 w-full overflow-y-auto rounded-lg border bg-white shadow-lg dark:bg-slate-900 dark:border-slate-700">
          {results.map((m) => (
            <button
              key={m._id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onPick(m.name);
                setOpen(false);
              }}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <span className="truncate font-medium">{m.name}</span>
              <span className={`shrink-0 text-[10px] font-semibold ${(m.stockQuantity ?? 0) > 0 ? "text-emerald-600" : "text-rose-600"}`}>
                {(m.stockQuantity ?? 0) > 0 ? `${m.stockQuantity} in stock` : "out of stock"}
              </span>
            </button>
          ))}
          {results.length === 0 && !searching && (
            <p className="px-3 py-2 text-[11px] text-slate-500">No match — keep typing to prescribe anyway.</p>
          )}
        </div>
      )}
      {value.trim().length >= 2 && !exactHit && !searching && (
        <p className="mt-1 text-[10px] text-amber-600">Not in pharmacy stock — pharmacy will be asked to add it.</p>
      )}
      {searching && <p className="mt-1 text-[10px] text-slate-400">Searching stock…</p>}
    </div>
  );
}

export default function WardRoundsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-[450px] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
        </div>
      }
    >
      <WardRoundsContent />
    </Suspense>
  );
}

function WardRoundsContent() {
  const { toast } = useToast();

  const [inpatients, setInpatients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStayId, setSelectedStayId] = useState("");
  const [timeline, setTimeline] = useState<any>(null);
  const [timelineLoading, setTimelineLoading] = useState(false);

  // Visit composer
  const [visitType, setVisitType] = useState("Round");
  const [condition, setCondition] = useState("Stable");
  const [painScore, setPainScore] = useState("0");
  const [complaint, setComplaint] = useState("");
  const [findings, setFindings] = useState("");
  const [assessment, setAssessment] = useState("");
  const [plan, setPlan] = useState("");
  const [medRows, setMedRows] = useState<MedRow[]>([]);
  const [saving, setSaving] = useState(false);

  // General instruction for the nurse (not tied to a visit)
  const [instTitle, setInstTitle] = useState("");
  const [instDetail, setInstDetail] = useState("");
  const [instPriority, setInstPriority] = useState("Routine");
  const [instSaving, setInstSaving] = useState(false);

  const selectedStay = useMemo(
    () => inpatients.find((p) => String(p.admissionId) === selectedStayId),
    [inpatients, selectedStayId]
  );

  const loadRoster = async () => {
    try {
      const res = await fetch("/api/care-tasks/my-inpatients");
      const data = await res.json();
      if (res.ok && data.success) {
        setInpatients(data.data || []);
        setSelectedStayId((prev) => {
          if (prev && (data.data || []).some((p: any) => String(p.admissionId) === prev)) return prev;
          return data.data?.[0] ? String(data.data[0].admissionId) : "";
        });
      } else {
        toast(data.message || "Failed to load inpatients", "error");
      }
    } catch {
      toast("Failed to load inpatients", "error");
    } finally {
      setLoading(false);
    }
  };

  const loadTimeline = async (admissionId: string) => {
    if (!admissionId) {
      setTimeline(null);
      return;
    }
    setTimelineLoading(true);
    try {
      const res = await fetch(`/api/care-tasks/timeline?admissionId=${admissionId}`);
      const data = await res.json();
      if (res.ok && data.success) setTimeline(data.data);
      else setTimeline(null);
    } catch {
      setTimeline(null);
    } finally {
      setTimelineLoading(false);
    }
  };

  useEffect(() => {
    loadRoster();
  }, []);

  useEffect(() => {
    loadTimeline(selectedStayId);
  }, [selectedStayId]);

  const visits: any[] = timeline?.visits ?? [];
  const orders: any[] = timeline?.orders ?? [];
  const tasks: any[] = timeline?.tasks ?? [];

  // "What has the nurse done since I last saw this patient?"
  const lastVisitAt = visits.length
    ? new Date(visits[0].dateRecorded || visits[0].createdAt).getTime()
    : 0;
  const nurseNotes: any[] = (timeline?.notes ?? []).filter((n: any) => n.recordType === "Nursing Note");
  const latestVitals: any[] = (timeline?.vitals ?? []).slice(0, 3);
  const latestFlag = latestVitals.length > 0
    ? latestVitals.map((v: any) => flagVitalForReview(v)).includes("CRITICAL")
      ? "CRITICAL"
      : latestVitals.map((v: any) => flagVitalForReview(v)).includes("WATCH")
        ? "WATCH"
        : "NORMAL"
    : null;
  const sinceVisit = {
    vitals: (timeline?.vitals ?? []).filter((v: any) => new Date(v.dateRecorded || v.createdAt).getTime() > lastVisitAt).length,
    given: (timeline?.medications ?? []).filter(
      (m: any) => m.status === "GIVEN" && new Date(m.administeredTime || m.updatedAt || m.createdAt).getTime() > lastVisitAt
    ).length,
    notes: nurseNotes.filter((n: any) => new Date(n.dateRecorded || n.createdAt).getTime() > lastVisitAt).length,
  };

  const submitVisit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStay) {
      toast("Select a patient first", "error");
      return;
    }
    if (!complaint.trim() && !findings.trim() && !assessment.trim()) {
      toast("Note what you found: complaint, examination or assessment", "error");
      return;
    }
    const activeRows = medRows.filter((r) => r.medicationName.trim() && r.dosage.trim());
    for (const r of activeRows) {
      if (!r.frequency) {
        toast("Pick a frequency for every prescribed medicine", "error");
        return;
      }
    }
    setSaving(true);
    try {
      // 1. Record the visit (timestamped, authored).
      const visitRes = await fetch("/api/clinical/visits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          admissionId: selectedStay.admissionId,
          patientId: selectedStay.patientId,
          visitType,
          condition,
          painScore: Number(painScore),
          chiefComplaint: complaint.trim() || undefined,
          objectiveFindings: findings.trim() || undefined,
          assessment: assessment.trim() || undefined,
          plan: plan.trim() || undefined,
        }),
      });
      const visitData = await visitRes.json();
      if (!visitRes.ok || !visitData.success) {
        toast(visitData.message || "Failed to record visit", "error");
        return;
      }
      const visitId = visitData.data?._id;

      // 2. Prescribe for this visit: each order expands into timed nurse doses.
      let dosesTotal = 0;
      for (const r of activeRows) {
        const orderRes = await fetch("/api/medication-orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            admissionId: selectedStay.admissionId,
            patientId: selectedStay.patientId,
            visitId,
            medicationName: r.medicationName.trim(),
            dosage: r.dosage.trim(),
            route: r.route,
            frequency: r.frequency,
            timesOfDay: r.times
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean),
            durationDays: Number(r.durationDays) || 1,
            instructions: r.instructions.trim() || undefined,
          }),
        });
        const orderData = await orderRes.json();
        if (!orderRes.ok || !orderData.success) {
          toast(`Visit saved, but order "${r.medicationName}" failed: ${orderData.message}`, "error");
        } else {
          dosesTotal += orderData.data?.dosesCreated ?? 0;
        }
      }

      toast(
        activeRows.length > 0
          ? `Visit recorded — ${activeRows.length} order(s), ${dosesTotal} timed dose(s) sent to the nurse`
          : "Visit recorded",
        "success"
      );
      setComplaint("");
      setFindings("");
      setAssessment("");
      setPlan("");
      setPainScore("0");
      setMedRows([]);
      loadTimeline(selectedStayId);
    } catch {
      toast("Error saving visit", "error");
    } finally {
      setSaving(false);
    }
  };

  const discontinueOrder = async (order: any) => {
    const reason = window.prompt("Why discontinue this order? (recorded in history)", "");
    if (reason === null) return;
    try {
      const res = await fetch(`/api/medication-orders/${order._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast("Order discontinued — future pending doses cancelled", "success");
        loadTimeline(selectedStayId);
      } else {
        toast(data.message || "Failed to discontinue", "error");
      }
    } catch {
      toast("Error discontinuing order", "error");
    }
  };

  const setFrequency = (index: number, frequency: string) => {
    setMedRows((rows) =>
      rows.map((r, i) =>
        i === index ? { ...r, frequency, times: (FREQUENCY_SUGGESTIONS[frequency] ?? []).join(", ") } : r
      )
    );
  };

  const sendInstruction = async () => {
    if (!selectedStay || !instTitle.trim()) {
      toast("Write the instruction first", "error");
      return;
    }
    setInstSaving(true);
    try {
      const res = await fetch("/api/care-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          admissionId: selectedStay.admissionId,
          patientId: selectedStay.patientId,
          title: instTitle.trim(),
          detail: instDetail.trim() || undefined,
          priority: instPriority,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Unable to send instruction.");
      setInstTitle("");
      setInstDetail("");
      setInstPriority("Routine");
      toast("Instruction sent to the nursing team", "success");
      loadTimeline(selectedStayId);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Unable to send instruction", "error");
    } finally {
      setInstSaving(false);
    }
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
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <Stethoscope className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
            Ward Rounds
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Visit your allotted inpatients, record what you find, and prescribe timed medication courses the nurse executes.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => { loadRoster(); loadTimeline(selectedStayId); }} className="flex items-center gap-1.5">
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
      </div>

      {inpatients.length === 0 ? (
        <Card className="border shadow-sm">
          <CardContent className="py-12 text-center text-sm text-slate-500">
            No inpatients allotted to you yet. The admissions desk adds you to a stay&apos;s care team.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[0.9fr_1.4fr]">
          {/* Patient picker */}
          <Card className="border shadow-sm h-fit">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">My Inpatients ({inpatients.length})</CardTitle>
              <CardDescription>Stays where you are on the care team</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {inpatients.map((p) => {
                const active = String(p.admissionId) === selectedStayId;
                const myOrders = (timeline && active ? orders : []).filter((o: any) => o.status === "ACTIVE").length;
                return (
                  <button
                    key={String(p.admissionId)}
                    onClick={() => setSelectedStayId(String(p.admissionId))}
                    className={`w-full rounded-lg border p-3 text-left transition ${active ? "border-emerald-600 bg-emerald-50 dark:bg-emerald-950/40" : "border-slate-200 hover:bg-slate-50 dark:border-slate-800"}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-sm text-slate-900 dark:text-white">{p.name}</span>
                      <span className="font-mono text-[11px] text-emerald-700">Bed {p.bedNumber}</span>
                    </div>
                    <div className="mt-1 text-[11px] text-slate-500">
                      {p.wardName} • {p.uhid} • {p.diagnosis}
                    </div>
                    <div className="mt-1 text-[11px] text-slate-500">
                      {p.doctorName}
                      {active && timeline && (
                        <span className="ml-2 text-emerald-600 font-medium">{myOrders} active order(s)</span>
                      )}
                    </div>
                    {p.allergies?.length > 0 && (
                      <Badge variant="outline" className="mt-2 text-[10px] text-rose-600 border-rose-300">
                        <AlertTriangle className="h-3 w-3 mr-1" /> {p.allergies.join(", ")}
                      </Badge>
                    )}
                  </button>
                );
              })}
            </CardContent>
          </Card>

          {/* Visit + prescribe workspace */}
          <div className="space-y-5">
            {selectedStay && (
              <Card className="border shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-semibold">
                    New visit — {selectedStay.name} (Bed {selectedStay.bedNumber})
                  </CardTitle>
                  <CardDescription>
                    Logged with visit time and your name. Add timed prescriptions below and the nurse sees exactly when to give each dose.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={submitVisit} className="space-y-4 text-xs">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="space-y-1.5">
                        <Label>Visit type</Label>
                        <Select value={visitType} onChange={(e) => setVisitType(e.target.value)} className="h-9">
                          <option>Round</option>
                          <option>Admission Review</option>
                          <option>Pre-Discharge</option>
                          <option>Emergency</option>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label>Condition</Label>
                        <Select value={condition} onChange={(e) => setCondition(e.target.value)} className="h-9">
                          <option>Improving</option>
                          <option>Stable</option>
                          <option>Deteriorating</option>
                          <option>Critical</option>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label>Pain (0–10)</Label>
                        <Input type="number" min={0} max={10} value={painScore} onChange={(e) => setPainScore(e.target.value)} className="h-9" />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Visit time</Label>
                        <Input value={new Date().toLocaleString()} disabled className="h-9 text-slate-400" />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label>How the patient feels / complaint</Label>
                      <Textarea value={complaint} onChange={(e) => setComplaint(e.target.value)} rows={2} placeholder="e.g. Chest pain reduced, slept well, mild nausea…" />
                    </div>
                    <div className="grid sm:grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label>Examination findings</Label>
                        <Textarea value={findings} onChange={(e) => setFindings(e.target.value)} rows={2} placeholder="e.g. Lungs clear, wound clean, BP 120/80…" />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Assessment</Label>
                        <Textarea value={assessment} onChange={(e) => setAssessment(e.target.value)} rows={2} placeholder="e.g. Recovering well, continue current line…" />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Plan</Label>
                      <Textarea value={plan} onChange={(e) => setPlan(e.target.value)} rows={2} placeholder="e.g. Review tomorrow, shift to oral antibiotics if afebrile…" />
                    </div>

                    {/* Prescriptions for this visit */}
                    <div className="rounded-lg border p-3 space-y-3 bg-slate-50/60 dark:bg-slate-900/40">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold flex items-center gap-1.5">
                          <Pill className="h-4 w-4 text-purple-600" /> Prescribe for this visit ({medRows.length})
                        </span>
                        <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => setMedRows((r) => [...r, emptyMedRow()])}>
                          <Plus className="h-3 w-3 mr-1" /> Add medicine
                        </Button>
                      </div>
                      {medRows.map((row, i) => (
                        <div key={i} className="rounded-lg border bg-white dark:bg-slate-900 p-3 space-y-2">
                          <div className="grid sm:grid-cols-2 gap-2">
                            <MedicinePicker
                              value={row.medicationName}
                              onPick={(name) => setMedRows((rs) => rs.map((r, j) => (j === i ? { ...r, medicationName: name } : r)))}
                            />
                            <Input placeholder="Dose e.g. 1g" value={row.dosage} onChange={(e) => setMedRows((rs) => rs.map((r, j) => (j === i ? { ...r, dosage: e.target.value } : r)))} className="h-9" />
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            <Select value={row.route} onChange={(e) => setMedRows((rs) => rs.map((r, j) => (j === i ? { ...r, route: e.target.value } : r)))} className="h-9">
                              {ROUTES.map((r) => (<option key={r}>{r}</option>))}
                            </Select>
                            <Select value={row.frequency} onChange={(e) => setFrequency(i, e.target.value)} className="h-9">
                              {FREQUENCIES.map((f) => (<option key={f}>{f}</option>))}
                            </Select>
                            <Input placeholder="Days" type="number" min={1} max={30} value={row.durationDays} onChange={(e) => setMedRows((rs) => rs.map((r, j) => (j === i ? { ...r, durationDays: e.target.value } : r)))} className="h-9" disabled={row.frequency === "STAT" || row.frequency === "PRN"} />
                            <Button type="button" variant="ghost" size="sm" className="h-9 text-rose-600" onClick={() => setMedRows((rs) => rs.filter((_, j) => j !== i))}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                          {row.frequency !== "STAT" && row.frequency !== "PRN" && (
                            <Input placeholder="Clock times, e.g. 08:00, 20:00" value={row.times} onChange={(e) => setMedRows((rs) => rs.map((r, j) => (j === i ? { ...r, times: e.target.value } : r)))} className="h-9 font-mono" />
                          )}
                          <Input placeholder="Instructions for nurse (optional)" value={row.instructions} onChange={(e) => setMedRows((rs) => rs.map((r, j) => (j === i ? { ...r, instructions: e.target.value } : r)))} className="h-9" />
                        </div>
                      ))}
                      {medRows.length === 0 && (
                        <p className="text-[11px] text-slate-500">No medicines — visit will be recorded as observation only.</p>
                      )}
                    </div>

                    <Button type="submit" disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                      {saving ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving visit…</>) : (<><CheckCircle2 className="mr-2 h-4 w-4" /> Save visit {medRows.length > 0 && `+ ${medRows.length} order(s)`}</>)}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            )}

            {/* Visit history: every visit, its time, what was done */}
            <Card className="border shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Clock3 className="h-4 w-4" /> Visit history {visits.length > 0 && `(${visits.length})`}
                </CardTitle>
                <CardDescription>Each ward visit with time, findings, and medicines prescribed then</CardDescription>
              </CardHeader>
              <CardContent>
                {timelineLoading ? (
                  <p className="text-xs text-slate-500 py-4">Loading…</p>
                ) : visits.length === 0 ? (
                  <p className="text-xs text-slate-500 py-4">No visits recorded for this stay yet.</p>
                ) : (
                  <div className="space-y-3">
                    {visits.map((v: any) => {
                      const linkedOrders = orders.filter((o: any) => String(o.visitId ?? "") === String(v._id));
                      return (
                        <div key={v._id} className="rounded-lg border p-3 space-y-1.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline" className="text-[10px]">{v.visitType ?? "Round"}</Badge>
                            {v.condition && (
                              <Badge className={v.condition === "Critical" || v.condition === "Deteriorating" ? "bg-rose-100 text-rose-800 border-rose-300" : "bg-emerald-100 text-emerald-800 border-emerald-300"}>{v.condition}</Badge>
                            )}
                            {v.painScore !== undefined && v.painScore !== null && (
                              <span className="text-[11px] text-slate-500">Pain {v.painScore}/10</span>
                            )}
                            <span className="ml-auto text-[11px] text-slate-400">
                              {v.dateRecorded ? new Date(v.dateRecorded).toLocaleString() : ""} • Dr. {v.doctor?.name ?? ""}
                            </span>
                          </div>
                          {v.chiefComplaint && <p className="text-xs"><span className="font-semibold">Feels:</span> {v.chiefComplaint}</p>}
                          {v.objectiveFindings && <p className="text-xs"><span className="font-semibold">Found:</span> {v.objectiveFindings}</p>}
                          {v.assessment && <p className="text-xs"><span className="font-semibold">Assessment:</span> {v.assessment}</p>}
                          {v.plan && <p className="text-xs"><span className="font-semibold">Plan:</span> {v.plan}</p>}
                          {linkedOrders.length > 0 && (
                            <div className="mt-1 rounded bg-purple-50 dark:bg-purple-950/30 p-2 space-y-1">
                              <span className="text-[11px] font-semibold text-purple-700 dark:text-purple-300">Prescribed at this visit:</span>
                              {linkedOrders.map((o: any) => (
                                <p key={o._id} className="text-[11px]">
                                  {o.medicationName} {o.dosage} • {o.frequency}{o.timesOfDay?.length ? ` at ${o.timesOfDay.join(", ")}` : ""} • {o.status}
                                  {o.doseCounts && ` (given ${o.doseCounts.GIVEN ?? 0}/${Object.values(o.doseCounts).reduce((a: any, b: any) => a + b, 0)})`}
                                </p>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Nurse watch: what the nurse checked, and what's new since last visit */}
            <Card className="border shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle className="text-base font-semibold">Nurse watch</CardTitle>
                  {latestFlag === "CRITICAL" && (
                    <Badge className="bg-rose-600 text-white">Needs review — latest vitals critical</Badge>
                  )}
                  {latestFlag === "WATCH" && (
                    <Badge variant="outline" className="text-amber-600 border-amber-300">Watch — latest vitals elevated</Badge>
                  )}
                </div>
                <CardDescription>
                  {visits.length === 0
                    ? "No round yet — everything below is new for you."
                    : `Since your last visit (${new Date(visits[0].dateRecorded || visits[0].createdAt).toLocaleString()}): ${sinceVisit.vitals} vitals • ${sinceVisit.given} doses given • ${sinceVisit.notes} nurse note(s).`}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {timelineLoading ? (
                  <p className="text-xs text-slate-500 py-4">Loading…</p>
                ) : latestVitals.length === 0 && nurseNotes.length === 0 ? (
                  <p className="text-xs text-slate-500 py-4">Nurse hasn&apos;t recorded vitals or notes for this stay yet.</p>
                ) : (
                  <div className="space-y-3">
                    {latestVitals.length > 0 && (
                      <div>
                        <span className="text-[11px] font-semibold block mb-1">Latest vitals (checked by nurse)</span>
                        <div className="space-y-1.5">
                          {latestVitals.map((v: any) => {
                            const flag = flagVitalForReview(v);
                            return (
                              <div key={v._id} className={`rounded-lg border p-2.5 text-xs ${flag === "CRITICAL" ? "border-rose-300 bg-rose-50 dark:bg-rose-950/30" : flag === "WATCH" ? "border-amber-300 bg-amber-50 dark:bg-amber-950/20" : ""}`}>
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-mono font-semibold">
                                    BP {v.bloodPressure ?? "—"} • HR {v.heartRate ?? "—"} • SpO2 {v.oxygenSaturation ?? "—"}% • RR {v.respiratoryRate ?? "—"} • T {v.temperature ?? "—"}°C
                                  </span>
                                  {flag !== "NORMAL" && (
                                    <Badge className={flag === "CRITICAL" ? "bg-rose-600 text-white" : "bg-amber-100 text-amber-800 border-amber-300"}>{flag}</Badge>
                                  )}
                                  <span className="ml-auto text-[11px] text-slate-400">
                                    {v.dateRecorded ? new Date(v.dateRecorded).toLocaleString() : ""}
                                    {v.recordedBy?.name ? ` • ${v.recordedBy.name}` : ""}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {nurseNotes.length > 0 && (
                      <div>
                        <span className="text-[11px] font-semibold block mb-1">Nurse notes ({nurseNotes.length})</span>
                        <div className="space-y-1.5">
                          {nurseNotes.slice(0, 3).map((n: any) => (
                            <div key={n._id} className="rounded-lg border p-2.5 text-xs">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-semibold">{n.title ?? n.category ?? "Note"}</span>
                                <span className="text-[11px] text-slate-400">
                                  {n.dateRecorded ? new Date(n.dateRecorded).toLocaleString() : ""}
                                  {n.doctor?.name ? ` • ${n.doctor.name}` : ""}
                                </span>
                              </div>
                              {(n.chiefComplaint || n.objectiveFindings || n.assessment) && (
                                <p className="mt-1 text-slate-600 dark:text-slate-400">
                                  {[n.chiefComplaint, n.objectiveFindings, n.assessment].filter(Boolean).join(" • ")}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Active orders with adherence */}
            <Card className="border shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold">Medication orders</CardTitle>
                <CardDescription>Timed courses for this stay — discontinue to stop future doses</CardDescription>
              </CardHeader>
              <CardContent>
                {timelineLoading ? (
                  <p className="text-xs text-slate-500 py-4">Loading…</p>
                ) : orders.length === 0 ? (
                  <p className="text-xs text-slate-500 py-4">No orders for this stay yet.</p>
                ) : (
                  <div className="space-y-2">
                    {orders.map((o: any) => (
                      <div key={o._id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-lg border p-3">
                        <div className="text-xs">
                          <span className="font-semibold">{o.medicationName}</span> {o.dosage} • {o.route} • {o.frequency}
                          {o.timesOfDay?.length > 0 && <span className="font-mono"> at {o.timesOfDay.join(", ")}</span>}
                          <span className="text-slate-500"> • {o.durationDays}d from {o.startDate ? new Date(o.startDate).toLocaleDateString() : ""}</span>
                          <div className="mt-1 text-[11px] text-slate-500">
                            Ordered {o.createdAt ? new Date(o.createdAt).toLocaleString() : ""} by {o.prescribedBy?.name ?? ""}
                            {o.doseCounts && (
                              <> — given {o.doseCounts.GIVEN ?? 0} • pending {o.doseCounts.PENDING ?? 0}{(o.doseCounts.WITHHELD ?? 0) + (o.doseCounts.REFUSED ?? 0) > 0 && <> • withheld/refused {(o.doseCounts.WITHHELD ?? 0) + (o.doseCounts.REFUSED ?? 0)}</>}</>
                            )}
                            {o.instructions && <> — “{o.instructions}”</>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge className={o.status === "ACTIVE" ? "bg-emerald-100 text-emerald-800 border-emerald-300" : "bg-slate-100 text-slate-600"}>{o.status}</Badge>
                          {o.status === "ACTIVE" && (
                            <Button variant="outline" size="sm" className="h-7 text-xs text-rose-600 border-rose-200" onClick={() => discontinueOrder(o)}>
                              <Ban className="h-3 w-3 mr-1" /> Stop
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* General instructions (kept): free tasks for the nurse */}
            <Card className="border shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold">Instructions for the nurse</CardTitle>
                <CardDescription>General tasks not tied to a visit — the nurse ticks them off in her inbox</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-2 rounded-xl border p-3">
                  <Input
                    value={instTitle}
                    onChange={(e) => setInstTitle(e.target.value)}
                    placeholder="e.g. Vitals every 4 hours, keep NPO after midnight"
                    className="h-9 text-xs"
                  />
                  <div className="flex items-center gap-2">
                    <Select value={instPriority} onChange={(e) => setInstPriority(e.target.value)} className="h-9 text-xs w-32">
                      <option>Routine</option>
                      <option>Urgent</option>
                      <option>STAT</option>
                    </Select>
                    <Input
                      value={instDetail}
                      onChange={(e) => setInstDetail(e.target.value)}
                      placeholder="Detail (optional)"
                      className="h-9 text-xs"
                    />
                    <Button size="sm" onClick={sendInstruction} disabled={instSaving} className="bg-emerald-600 text-white hover:bg-emerald-700 shrink-0">
                      {instSaving ? "Sending…" : "Send"}
                    </Button>
                  </div>
                </div>
                {timelineLoading ? (
                  <p className="text-xs text-slate-500">Loading…</p>
                ) : tasks.length === 0 ? (
                  <p className="text-xs text-slate-500">No instructions for this stay yet.</p>
                ) : (
                  <div className="space-y-1.5">
                    {tasks.slice(0, 6).map((t: any) => (
                      <div key={t._id} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs">
                        <span className="truncate">
                          <span className="font-medium">{t.title}</span>
                          <span className="text-slate-500"> • {t.priority}{t.detail ? ` — ${t.detail}` : ""}</span>
                        </span>
                        <Badge variant="outline" className="text-[10px] shrink-0">{t.status}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
