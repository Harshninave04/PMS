"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  AlertTriangle, Ban, Check, ChevronDown, ChevronRight, ClipboardList, Clock3,
  FilePlus2, HeartPulse, Loader2, Pill, Plus, RefreshCw, Search, Send,
  Stethoscope, Syringe, UserRound, X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { FREQUENCY_SUGGESTIONS } from "@/lib/medication-schedule";
import { flagVitalForReview, type VitalFlag } from "@/lib/vital-flags";

type Condition = "Improving" | "Stable" | "Deteriorating" | "Critical";
type RoundTab = "Round" | "Timeline" | "Orders";
type Frequency = "STAT" | "OD" | "BD" | "TDS" | "QID" | "Q6H" | "Q8H" | "Q12H" | "HS" | "PRN";
type Route = "ORAL" | "IV" | "IM" | "SC" | "TOPICAL" | "INHALATION" | "OTHER";
type Priority = "Routine" | "Urgent" | "STAT";
type TimelineFilter = "All" | "Rounds" | "Vitals" | "Medicines" | "Notes";

interface LatestVital {
  _id: string;
  temperature?: number;
  heartRate?: number;
  bloodPressure?: string;
  respiratoryRate?: number;
  oxygenSaturation?: number;
  dateRecorded?: string;
  flag?: VitalFlag;
}

interface InpatientRow {
  admissionId: string;
  patientId: string;
  name: string;
  uhid: string;
  age?: number;
  gender?: string;
  bedNumber: string;
  roomNumber: string;
  wardName: string;
  diagnosis: string;
  allergies: string[];
  admissionDate: string;
  doctorName: string;
  latestVital?: LatestVital;
  latestVitalFlag?: VitalFlag;
  lastRoundAt?: string;
  roundedToday: boolean;
}

interface PersonName { name?: string }
interface Round {
  _id: string;
  recordType: string;
  visitType?: string;
  condition?: Condition;
  notes?: string;
  details?: string;
  chiefComplaint?: string;
  objectiveFindings?: string;
  assessment?: string;
  plan?: string;
  painScore?: number;
  doctor?: PersonName;
  author?: PersonName;
  visitedAt?: string;
  timestamp?: string;
  dateRecorded?: string;
  createdAt?: string;
  parentVisitId?: string;
  text?: string;
  dayNumber?: number;
}
interface DoseCounts { GIVEN?: number; PENDING?: number; WITHHELD?: number; REFUSED?: number }
interface MedicationOrder {
  _id: string;
  admissionId: string;
  patientId: string;
  visitId?: string;
  prescribedBy?: PersonName;
  medicationName: string;
  dosage: string;
  route: Route;
  frequency: Frequency;
  timesOfDay: string[];
  startDate: string;
  durationDays: number;
  instructions?: string;
  status: "ACTIVE" | "DISCONTINUED" | "COMPLETED";
  createdAt?: string;
  doseCounts?: DoseCounts;
}
interface CareTask {
  _id: string;
  admissionId: string;
  patientId: string;
  title: string;
  detail?: string;
  priority: Priority;
  status: "NEW" | "ACKNOWLEDGED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  createdAt?: string;
  dueAt?: string;
  dayNumber?: number;
}
interface Vital extends LatestVital { recordedBy?: PersonName; createdAt?: string; dayNumber?: number }
interface Dose {
  _id: string;
  orderId?: string | { _id?: string };
  medicationName: string;
  dosage: string;
  route: Route;
  scheduledTime: string;
  administeredTime?: string;
  status: "GIVEN" | "PENDING" | "WITHHELD" | "REFUSED";
  notes?: string;
  dayNumber?: number;
}
interface TimelineItem {
  id: string;
  kind: "ROUND" | "ADDENDUM" | "VITAL" | "DOSE" | "NURSE_NOTE" | "INSTRUCTION";
  at: string;
  dayNumber: number;
  title: string;
  detail?: string;
  flag?: string;
}
interface TimelineResponse {
  tasks: CareTask[];
  medications: Dose[];
  vitals: Vital[];
  notes: Round[];
  visits: Round[];
  orders: MedicationOrder[];
  timelineItems: TimelineItem[];
  timeZone?: string;
}
interface ApiResult<T> { success: boolean; data?: T; message?: string }
interface MedicineOption { _id: string; name: string; stockQuantity?: number }
interface MedicineDraft {
  type: "MEDICINE";
  medicationName: string;
  dosage: string;
  route: Route;
  frequency: Frequency;
  timesOfDay: string[];
  timesText: string;
  durationDays: string;
  instructions: string;
  editSchedule: boolean;
}
interface InstructionDraft { type: "INSTRUCTION"; id: string; title: string; priority: Priority }
type OrderDraft = (Omit<MedicineDraft, "type"> & { type: "MEDICINE"; id: string }) | InstructionDraft;
interface Draft {
  condition: Condition | "";
  notes: string;
  medicine: MedicineDraft;
  instructionTitle: string;
  instructionPriority: Priority;
  orders: OrderDraft[];
  newRoundOpen: boolean;
}
interface SavedSummary {
  at: string;
  condition: Condition | "";
  notes: string;
  medicines: Array<{ name: string; times: string[] }>;
  instructionCount: number;
}

const CONDITIONS: Condition[] = ["Improving", "Stable", "Deteriorating", "Critical"];
const FREQUENCIES: Frequency[] = ["OD", "BD", "TDS", "QID", "HS", "STAT", "PRN"];
const ROUTES: Route[] = ["ORAL", "IV", "IM", "SC", "TOPICAL", "INHALATION", "OTHER"];
const PRIORITIES: Priority[] = ["Routine", "Urgent", "STAT"];
const TIME_ZONE = "Asia/Kolkata";
const INSTRUCTION_TEMPLATES = ["Vitals every 4h", "NPO", "Strict intake/output", "Monitor SpO2", "Dressing change", "Review in 24h"];
const FREQUENCY_LABELS: Record<Frequency, string> = {
  OD: "OD · once daily", BD: "BD · twice daily", TDS: "TDS · thrice daily", QID: "QID · four times daily",
  HS: "HS · bedtime", STAT: "STAT · once now", PRN: "PRN · as needed", Q6H: "Q6H", Q8H: "Q8H", Q12H: "Q12H",
};
const FREQUENCY_SUMMARIES: Record<Frequency, string> = {
  OD: "once daily", BD: "twice daily", TDS: "thrice daily", QID: "four times daily",
  HS: "bedtime", STAT: "once now", PRN: "as needed", Q6H: "every 6 hours", Q8H: "every 8 hours", Q12H: "every 12 hours",
};

function createDraft(): Draft {
  const timesOfDay = [...(FREQUENCY_SUGGESTIONS.BD ?? ["08:00", "20:00"])];
  return {
    condition: "", notes: "",
    medicine: { type: "MEDICINE", medicationName: "", dosage: "", route: "ORAL", frequency: "BD", timesOfDay, timesText: timesOfDay.join(", "), durationDays: "3", instructions: "", editSchedule: false },
    instructionTitle: "", instructionPriority: "Routine", orders: [], newRoundOpen: false,
  };
}

function dateValue(value?: string): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
function dayKey(date: Date, timeZone = TIME_ZONE): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "00";
  return `${part("year")}-${part("month")}-${part("day")}`;
}
function isToday(value?: string, timeZone = TIME_ZONE): boolean {
  const date = dateValue(value);
  return Boolean(date && dayKey(date, timeZone) === dayKey(new Date(), timeZone));
}
function formatDateTime(value?: string, timeZone = TIME_ZONE): string {
  const date = dateValue(value);
  return date ? date.toLocaleString("en-IN", { timeZone, dateStyle: "medium", timeStyle: "short" }) : "Not recorded";
}
function formatClock(value?: string, timeZone = TIME_ZONE): string {
  const date = dateValue(value);
  return date ? date.toLocaleTimeString("en-IN", { timeZone, hour: "2-digit", minute: "2-digit", hour12: false }) : "—";
}
function formatDoctorName(value?: string): string {
  const clean = (value ?? "").trim().replace(/^(dr\.?\s*)+/i, "").trim();
  return clean ? `Dr. ${clean}` : "Attending doctor";
}
function doseSuffix(medicineName: string, dosage: string): string {
  const dose = dosage.trim();
  if (!dose) return "";
  const normalize = (value: string) => value.toLowerCase().replace(/\s+/g, "");
  return normalize(medicineName).includes(normalize(dose)) ? "" : ` · ${dose}`;
}
function statusForPatient(patient: InpatientRow): { label: string; className: string; rank: number } {
  const flag = patient.latestVitalFlag ?? (patient.latestVital ? flagVitalForReview(patient.latestVital) : null);
  if (flag === "CRITICAL") return { label: "Vitals critical", className: "bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-200", rank: 0 };
  if (flag === "WATCH") return { label: "Watch", className: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200", rank: 1 };
  if (patient.roundedToday) return { label: "Rounded today", className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200", rank: 3 };
  return { label: "Not rounded yet", className: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300", rank: 2 };
}
function hasDraftContent(draft?: Draft): boolean {
  if (!draft) return false;
  return Boolean(draft.condition || draft.notes.trim() || draft.orders.length || draft.medicine.medicationName.trim() || draft.medicine.dosage.trim() || draft.instructionTitle.trim());
}
function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">{children}</p>;
}
function InlineError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200"><span>{message}</span><Button type="button" size="sm" variant="outline" onClick={onRetry}><RefreshCw className="mr-1.5 h-3.5 w-3.5" />Retry</Button></div>;
}
function MedicinePicker({ value, onChange, className = "" }: { value: string; onChange: (value: string) => void; className?: string }) {
  const [results, setResults] = useState<MedicineOption[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    const query = value.trim();
    if (query.length < 2) { setResults([]); setOpen(false); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/pharmacy/medicines?search=${encodeURIComponent(query)}`, { signal: controller.signal });
        const result = await response.json() as ApiResult<MedicineOption[]>;
        if (response.ok && result.success) { setResults((result.data ?? []).slice(0, 7)); setOpen(true); }
      } catch { /* Free text remains available if stock lookup is unavailable. */ }
      finally { setLoading(false); }
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [value]);
  return <div className={`relative min-w-0 ${className}`}><Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><Input value={value} onChange={(event) => onChange(event.target.value)} onFocus={() => results.length > 0 && setOpen(true)} onBlur={() => window.setTimeout(() => setOpen(false), 140)} placeholder="Search stock or type medicine" className="h-10 pl-9" />{loading && <Loader2 className="absolute right-3 top-3 h-4 w-4 animate-spin text-slate-400" />}{open && results.length > 0 && <div className="absolute z-30 mt-1 max-h-52 w-full overflow-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl dark:border-slate-700 dark:bg-slate-900">{results.map((medicine) => <button key={medicine._id} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => { onChange(medicine.name); setOpen(false); }} className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-emerald-50 dark:hover:bg-emerald-950/40"><span className="truncate font-medium">{medicine.name}</span><span className="shrink-0 text-xs text-slate-500">{medicine.stockQuantity ?? 0} in stock</span></button>)}</div>}</div>;
}

export default function WardRoundsPage() {
  const { toast } = useToast();
  const [inpatients, setInpatients] = useState<InpatientRow[]>([]);
  const [rosterLoading, setRosterLoading] = useState(true);
  const [rosterError, setRosterError] = useState("");
  const [selectedAdmissionId, setSelectedAdmissionId] = useState("");
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [savedSummaries, setSavedSummaries] = useState<Record<string, SavedSummary>>({});
  const [timeline, setTimeline] = useState<TimelineResponse | null>(null);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineError, setTimelineError] = useState("");
  const [timelineFilter, setTimelineFilter] = useState<TimelineFilter>("All");
  const [tab, setTab] = useState<RoundTab>("Round");
  const [saving, setSaving] = useState(false);
  const [roundError, setRoundError] = useState("");
  const [dayOpen, setDayOpen] = useState<Record<number, boolean>>({});
  const [doseOpen, setDoseOpen] = useState<Record<number, boolean>>({});
  const [stopTarget, setStopTarget] = useState<MedicationOrder | null>(null);
  const [stopReason, setStopReason] = useState("");
  const [stopping, setStopping] = useState(false);
  const [addendumTarget, setAddendumTarget] = useState<Round | null>(null);
  const [addendumText, setAddendumText] = useState("");
  const [addendumSaving, setAddendumSaving] = useState(false);
  const timelineRequest = useRef(0);

  const selectedPatient = useMemo(() => inpatients.find((row) => row.admissionId === selectedAdmissionId), [inpatients, selectedAdmissionId]);
  const draft = drafts[selectedAdmissionId] ?? createDraft();
  const updateDraft = useCallback((change: Partial<Draft>) => {
    if (!selectedAdmissionId) return;
    setDrafts((previous) => ({ ...previous, [selectedAdmissionId]: { ...(previous[selectedAdmissionId] ?? createDraft()), ...change } }));
  }, [selectedAdmissionId]);

  const loadRoster = useCallback(async (): Promise<InpatientRow[]> => {
    setRosterLoading(true); setRosterError("");
    try {
      const response = await fetch("/api/care-tasks/my-inpatients");
      const result = await response.json() as ApiResult<InpatientRow[]>;
      if (!response.ok || !result.success) throw new Error(result.message || "Could not load your inpatient list");
      const rows = result.data ?? [];
      setInpatients(rows);
      setSelectedAdmissionId((previous) => rows.some((row) => row.admissionId === previous) ? previous : rows[0]?.admissionId ?? "");
      return rows;
    } catch (error) {
      setRosterError(error instanceof Error ? error.message : "Could not load your inpatient list");
      return [];
    } finally { setRosterLoading(false); }
  }, []);
  const loadTimeline = useCallback(async (admissionId: string): Promise<TimelineResponse | null> => {
    const requestId = ++timelineRequest.current;
    if (!admissionId) { setTimeline(null); setTimelineError(""); setTimelineLoading(false); return null; }
    setTimeline(null); setTimelineLoading(true); setTimelineError("");
    try {
      const response = await fetch(`/api/care-tasks/timeline?admissionId=${encodeURIComponent(admissionId)}`);
      const result = await response.json() as ApiResult<TimelineResponse>;
      if (!response.ok || !result.success || !result.data) throw new Error(result.message || "Could not load the patient timeline");
      if (requestId === timelineRequest.current) setTimeline(result.data);
      return result.data;
    } catch (error) {
      if (requestId === timelineRequest.current) setTimelineError(error instanceof Error ? error.message : "Could not load the patient timeline");
      return null;
    } finally { if (requestId === timelineRequest.current) setTimelineLoading(false); }
  }, []);

  useEffect(() => { void loadRoster(); }, [loadRoster]);
  useEffect(() => { void loadTimeline(selectedAdmissionId); }, [loadTimeline, selectedAdmissionId]);

  const sortedPatients = useMemo(() => [...inpatients].sort((left, right) => statusForPatient(left).rank - statusForPatient(right).rank || left.name.localeCompare(right.name)), [inpatients]);
  const roundCount = inpatients.filter((patient) => patient.roundedToday).length;
  const displayTimeZone = timeline?.timeZone ?? TIME_ZONE;
  const visits = timeline?.visits ?? [];
  const rounds = visits.filter((visit) => visit.recordType === "Progress Note");
  const todayRound = rounds.find((visit) => isToday(visit.visitedAt ?? visit.dateRecorded ?? visit.createdAt, displayTimeZone));
  const latestVitals = timeline?.vitals[0] ?? selectedPatient?.latestVital;
  const latestFlag = latestVitals ? flagVitalForReview(latestVitals) : null;
  const orders = timeline?.orders ?? [];
  const activeOrders = orders.filter((order) => order.status === "ACTIVE");
  const activeTasks = (timeline?.tasks ?? []).filter((task) => task.status !== "COMPLETED" && task.status !== "CANCELLED");
  const timelineItems = timeline?.timelineItems ?? [];
  const filteredItems = timelineItems.filter((item) => {
    if (timelineFilter === "All") return true;
    if (timelineFilter === "Rounds") return item.kind === "ROUND" || item.kind === "ADDENDUM";
    if (timelineFilter === "Vitals") return item.kind === "VITAL";
    if (timelineFilter === "Medicines") return item.kind === "DOSE";
    return item.kind === "ROUND" || item.kind === "ADDENDUM" || item.kind === "NURSE_NOTE";
  });
  const timelineDays = useMemo(() => {
    const groups = new Map<number, TimelineItem[]>();
    for (const item of filteredItems) groups.set(item.dayNumber, [...(groups.get(item.dayNumber) ?? []), item]);
    return [...groups.entries()].sort(([left], [right]) => right - left);
  }, [filteredItems]);
  const savedSummary = savedSummaries[selectedAdmissionId];
  const showTodaySummary = Boolean(selectedPatient?.roundedToday && !draft.newRoundOpen);
  const todayOrders = todayRound ? orders.filter((order) => order.visitId === todayRound._id) : [];
  const draftHasContent = hasDraftContent(drafts[selectedAdmissionId]);

  const updateMedicine = (change: Partial<MedicineDraft>) => updateDraft({ medicine: { ...draft.medicine, ...change } });
  const updateFrequency = (frequency: Frequency) => {
    const timesOfDay = frequency === "STAT" || frequency === "PRN" ? [] : [...(FREQUENCY_SUGGESTIONS[frequency] ?? [])];
    updateMedicine({ frequency, timesOfDay, timesText: timesOfDay.join(", ") });
  };
  const addMedicine = () => {
    const medicine = draft.medicine;
    if (!medicine.medicationName.trim()) { setRoundError("Choose or type a medicine before adding it."); return; }
    if (medicine.frequency !== "STAT" && medicine.frequency !== "PRN" && (!medicine.durationDays || !medicine.timesOfDay.length)) { setRoundError("Choose dose times and course length."); return; }
    const order: OrderDraft = { ...medicine, id: crypto.randomUUID() };
    updateDraft({ orders: [...draft.orders, order], medicine: createDraft().medicine });
    setRoundError("");
  };
  const addInstruction = (title?: string) => {
    const name = (title ?? draft.instructionTitle).trim();
    if (!name) { setRoundError("Enter an instruction or choose a template."); return; }
    const order: InstructionDraft = { type: "INSTRUCTION", id: crypto.randomUUID(), title: name, priority: title ? "Routine" : draft.instructionPriority };
    updateDraft({ orders: [...draft.orders, order], instructionTitle: "", instructionPriority: "Routine" });
    setRoundError("");
  };
  const updateOrder = (id: string, change: Partial<OrderDraft>) => updateDraft({ orders: draft.orders.map((order) => order.id === id ? { ...order, ...change } as OrderDraft : order) });
  const removeOrder = (id: string) => updateDraft({ orders: draft.orders.filter((order) => order.id !== id) });

  const saveRound = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const admissionId = selectedAdmissionId;
    const patient = inpatients.find((row) => row.admissionId === admissionId);
    const draftAtSave = drafts[admissionId] ?? createDraft();
    if (!patient) { setRoundError("Select a patient before saving this round."); return; }
    if (!draftAtSave.notes.trim() && !draftAtSave.condition && !draftAtSave.orders.length) { setRoundError("Add a condition, round note, or order before saving."); return; }
    for (const [index, order] of draftAtSave.orders.entries()) {
      if (order.type === "MEDICINE" && !order.medicationName.trim()) { setRoundError(`Medicine ${index + 1}: choose a medicine.`); return; }
      if (order.type === "INSTRUCTION" && !order.title.trim()) { setRoundError(`Instruction ${index + 1}: enter a title.`); return; }
    }
    setSaving(true); setRoundError("");
    try {
      const payload = {
        admissionId,
        condition: draftAtSave.condition || undefined,
        notes: draftAtSave.notes.trim() || undefined,
        orders: draftAtSave.orders.map((order) => order.type === "MEDICINE" ? {
          type: order.type, medicationName: order.medicationName.trim(), dosage: order.dosage.trim(), route: order.route,
          frequency: order.frequency, timesOfDay: order.frequency === "STAT" || order.frequency === "PRN" ? [] : order.timesOfDay,
          durationDays: order.frequency === "STAT" ? 1 : Number(order.durationDays || 1), instructions: order.instructions.trim() || undefined,
        } : { type: order.type, title: order.title.trim(), priority: order.priority }),
      };
      const response = await fetch("/api/clinical/rounds", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json() as ApiResult<{ visitId: string; ordersCreated: number; dosesCreated: number; tasksCreated: number }>;
      if (!response.ok || !result.success || !result.data) throw new Error(result.message || "Could not save the round");
      const summary: SavedSummary = {
        at: new Date().toISOString(), condition: draftAtSave.condition, notes: draftAtSave.notes.trim(),
        medicines: draftAtSave.orders.filter((order): order is Extract<OrderDraft, { type: "MEDICINE" }> => order.type === "MEDICINE").map((order) => ({ name: order.medicationName, times: order.timesOfDay })),
        instructionCount: result.data.tasksCreated,
      };
      setSavedSummaries((previous) => ({ ...previous, [admissionId]: summary }));
      setDrafts((previous) => ({ ...previous, [admissionId]: { ...createDraft(), newRoundOpen: false } }));
      toast("Round saved", "success");
      await Promise.all([loadTimeline(admissionId), loadRoster()]);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Could not save the round";
      const message = /permission|forbidden|nursing\.task\.execute/i.test(errorMessage)
        ? "You don't have permission to place orders. Contact admin."
        : errorMessage;
      setRoundError(message); toast(message, "error");
    } finally { setSaving(false); }
  };

  const nextPatientId = sortedPatients.find((patient) => patient.admissionId !== selectedAdmissionId && !patient.roundedToday)?.admissionId;
  const confirmStopOrder = async () => {
    if (!stopTarget || !stopReason.trim()) return;
    setStopping(true);
    try {
      const response = await fetch(`/api/medication-orders/${stopTarget._id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: stopReason.trim() }) });
      const result = await response.json() as ApiResult<unknown>;
      if (!response.ok || !result.success) throw new Error(result.message || "Could not stop the order");
      toast("Order stopped", "success"); setStopTarget(null); setStopReason(""); await loadTimeline(selectedAdmissionId);
    } catch (error) { toast(error instanceof Error ? error.message : "Could not stop the order", "error"); }
    finally { setStopping(false); }
  };
  const saveAddendum = async () => {
    if (!addendumTarget || !addendumText.trim()) return;
    setAddendumSaving(true);
    try {
      const response = await fetch(`/api/clinical/visits/${addendumTarget._id}/addendum`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: addendumText.trim() }) });
      const result = await response.json() as ApiResult<Round>;
      if (!response.ok || !result.success) throw new Error(result.message || "Could not append addendum");
      toast("Addendum saved", "success"); setAddendumTarget(null); setAddendumText(""); await loadTimeline(selectedAdmissionId);
    } catch (error) { toast(error instanceof Error ? error.message : "Could not append addendum", "error"); }
    finally { setAddendumSaving(false); }
  };

  const timelineIcon = (kind: TimelineItem["kind"]) => {
    const className = "h-4 w-4";
    if (kind === "ROUND" || kind === "ADDENDUM") return <Stethoscope className={className} />;
    if (kind === "VITAL") return <HeartPulse className={className} />;
    if (kind === "DOSE") return <Syringe className={className} />;
    if (kind === "INSTRUCTION") return <ClipboardList className={className} />;
    return <FilePlus2 className={className} />;
  };

  return (
    <main className="mx-auto max-w-[1500px] space-y-4 pb-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div><div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300"><Stethoscope className="h-5 w-5" /><span className="text-xs font-semibold uppercase tracking-[0.15em]">Clinical workflow</span></div><h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Ward Rounds</h1><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Review the patient, record the round, and send orders to the care team.</p></div>
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm shadow-sm dark:border-slate-800 dark:bg-slate-900"><span className="font-semibold text-slate-900 dark:text-white">Rounded {roundCount}/{inpatients.length} today</span><div className="mt-1.5 h-1.5 w-40 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${inpatients.length ? (roundCount / inpatients.length) * 100 : 0}%` }} /></div></div>
      </header>

      <div className="lg:hidden"><Label htmlFor="patient-top-select">Select patient</Label><Select id="patient-top-select" value={selectedAdmissionId} onChange={(event) => setSelectedAdmissionId(event.target.value)} disabled={!inpatients.length} className="mt-1">{sortedPatients.map((patient) => <option key={patient.admissionId} value={patient.admissionId}>{patient.name} · Bed {patient.bedNumber} · {patient.wardName}{hasDraftContent(drafts[patient.admissionId]) ? " · Draft" : ""}</option>)}</Select></div>

      <div className="grid items-start gap-4 lg:grid-cols-[290px_minmax(0,1fr)] xl:grid-cols-[310px_minmax(0,1fr)]">
        <Card className="hidden rounded-2xl border-slate-200 shadow-sm dark:border-slate-800 lg:block lg:sticky lg:top-3"><CardContent className="space-y-3 p-4">
          <div className="flex items-center justify-between"><div><h2 className="font-semibold text-slate-900 dark:text-white">My inpatients</h2><p className="text-xs text-slate-500">Assigned care team stays</p></div><Badge variant="outline">{inpatients.length}</Badge></div>
          {rosterError && <InlineError message={rosterError} onRetry={() => void loadRoster()} />}
          {rosterLoading && <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Loading roster</div>}
          {!rosterLoading && !rosterError && inpatients.length === 0 && <div className="rounded-xl border border-dashed p-5 text-center text-sm text-slate-500">No active patients are assigned to your care team.</div>}
          <div className="max-h-[calc(100vh-240px)] space-y-2 overflow-y-auto pr-1">{sortedPatients.map((patient) => {
            const status = statusForPatient(patient); const selected = patient.admissionId === selectedAdmissionId;
            const hasPatientDraft = hasDraftContent(drafts[patient.admissionId]);
            return <button key={patient.admissionId} type="button" onClick={() => { setSelectedAdmissionId(patient.admissionId); setRoundError(""); }} className={`w-full rounded-xl border p-3 text-left transition ${selected ? "border-emerald-500 bg-emerald-50/70 ring-1 ring-emerald-500/20 dark:bg-emerald-950/30" : "border-slate-200 hover:border-emerald-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/60"}`}>
              <div className="flex items-start justify-between gap-2"><span className="font-semibold text-sm text-slate-900 dark:text-white">{patient.name}</span><span className="flex shrink-0 items-center gap-1">{hasPatientDraft && <Badge variant="outline" className="border-amber-300 bg-amber-50 text-[10px] text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">Draft</Badge>}<Badge className={`border-0 text-[10px] ${status.className}`}>{status.label}</Badge></span></div>
              <p className="mt-1 text-xs text-slate-500">Bed {patient.bedNumber} · {patient.wardName}</p><p className="mt-1 truncate text-xs text-slate-500">{patient.diagnosis}</p>
              {patient.allergies.length > 0 && <p className="mt-2 flex items-center gap-1 truncate text-[11px] font-medium text-rose-700 dark:text-rose-300"><AlertTriangle className="h-3 w-3 shrink-0" />{patient.allergies.join(", ")}</p>}
            </button>;
          })}</div>
        </CardContent></Card>

        <section className="min-w-0 space-y-3">
          {rosterError && <div className="lg:hidden"><InlineError message={rosterError} onRetry={() => void loadRoster()} /></div>}
          {!selectedPatient && !rosterLoading && !rosterError && <Card className="rounded-2xl border-dashed"><CardContent className="py-16 text-center text-sm text-slate-500">Select an assigned inpatient to begin.</CardContent></Card>}
          {selectedPatient && <>
            <Card className="rounded-2xl border-slate-200 shadow-sm dark:border-slate-800"><CardContent className="space-y-2.5 p-3.5 sm:p-4">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5"><UserRound className="h-4 w-4 shrink-0 text-emerald-600" /><h2 className="text-sm font-bold text-slate-900 dark:text-white">{selectedPatient.name}</h2><span className="text-xs text-slate-500">{selectedPatient.uhid}</span><span className="text-xs text-slate-500">{selectedPatient.age ?? "—"} years · {selectedPatient.gender ?? "—"}</span><span className="text-xs font-medium text-slate-700 dark:text-slate-300">Bed {selectedPatient.bedNumber} · {selectedPatient.wardName}</span><span className="ml-auto text-xs text-slate-500">{formatDoctorName(selectedPatient.doctorName)}</span></div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-slate-100 pt-2 dark:border-slate-800">
                <span className={`inline-flex items-center gap-1 text-xs font-semibold ${selectedPatient.allergies.length ? "text-rose-700 dark:text-rose-300" : "text-slate-500"}`}><AlertTriangle className="h-3.5 w-3.5" />Allergies: {selectedPatient.allergies.length ? selectedPatient.allergies.join(", ") : "none recorded"}</span>
                <span className="text-xs text-slate-600 dark:text-slate-300">Vitals: {latestVitals ? `BP ${latestVitals.bloodPressure ?? "—"} · HR ${latestVitals.heartRate ?? "—"} · SpO₂ ${latestVitals.oxygenSaturation ?? "—"}%` : "not recorded"}</span>
                {latestFlag && <Badge className={`py-0 text-[10px] ${latestFlag === "CRITICAL" ? "bg-rose-600 text-white" : latestFlag === "WATCH" ? "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200" : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200"}`}>{latestFlag}</Badge>}
                <span className="text-xs text-slate-600 dark:text-slate-300">{activeOrders.length} active meds</span><span className="text-xs text-slate-500">Last round: {todayRound ? formatDateTime(todayRound.visitedAt ?? todayRound.dateRecorded ?? todayRound.createdAt, displayTimeZone) : selectedPatient.lastRoundAt ? formatDateTime(selectedPatient.lastRoundAt, displayTimeZone) : "not yet"}</span>
              </div>
            </CardContent></Card>

            <div className="flex gap-1 border-b border-slate-200 dark:border-slate-800" role="tablist" aria-label="Patient workspace">{(["Round", "Timeline", "Orders"] as const).map((name) => <button key={name} role="tab" aria-selected={tab === name} type="button" onClick={() => setTab(name)} className={`border-b-2 px-4 py-2 text-sm font-medium transition ${tab === name ? "border-emerald-600 text-emerald-700 dark:text-emerald-300" : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"}`}>{name}</button>)}</div>
            {timelineError && <InlineError message={timelineError} onRetry={() => void loadTimeline(selectedAdmissionId)} />}
            {timelineLoading && <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Loading patient timeline…</div>}

            {tab === "Round" && <div className="space-y-3">
              {(savedSummary || (showTodaySummary && todayRound)) && <Card className="border-emerald-200 bg-emerald-50/70 shadow-sm dark:border-emerald-900 dark:bg-emerald-950/20"><CardContent className="space-y-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2"><div><div className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-600" /><h3 className="font-semibold text-emerald-950 dark:text-emerald-100">Round saved</h3></div><p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{formatDateTime(savedSummary?.at ?? todayRound?.visitedAt ?? todayRound?.dateRecorded ?? todayRound?.createdAt, displayTimeZone)}{(savedSummary?.condition ?? todayRound?.condition) ? ` · ${savedSummary?.condition ?? todayRound?.condition}` : ""}</p></div><Badge variant="outline" className="border-emerald-300 text-emerald-800 dark:text-emerald-200">{savedSummary ? "Saved just now" : "Today’s round"}</Badge></div>
                <p className="text-sm text-slate-700 dark:text-slate-200">{(savedSummary?.notes || todayRound?.notes || todayRound?.details || todayRound?.text) ? `“${(savedSummary?.notes || todayRound?.notes || todayRound?.details || todayRound?.text || "").slice(0, 180)}”` : "No note excerpt."}</p>
                {savedSummary ? <div className="space-y-1 text-xs text-slate-600 dark:text-slate-300"><p>{savedSummary.medicines.length} medicines{savedSummary.medicines.map((medicine) => ` · ${medicine.name}${medicine.times.length ? ` (${medicine.times.join(" · ")})` : ""}`).join("")}</p><p>{savedSummary.instructionCount} instructions</p></div> : <p className="text-xs text-slate-600 dark:text-slate-300">{todayOrders.length} medicines in this round · Nurse instructions are in the Orders tab.</p>}
                <p className="text-xs text-emerald-900 dark:text-emerald-200">Nurses can see doses in the medication list; instructions are in the nurse inbox.</p>
                <div className="flex flex-wrap gap-2">{todayRound && <Button type="button" size="sm" variant="outline" onClick={() => { setAddendumTarget(todayRound); setAddendumText(""); }}>Add addendum</Button>}<Button type="button" size="sm" variant="outline" onClick={() => setTab("Timeline")}>View in Timeline <ChevronRight className="ml-1 h-3.5 w-3.5" /></Button>{nextPatientId && <Button type="button" size="sm" className="bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => setSelectedAdmissionId(nextPatientId)}>Next patient <ChevronRight className="ml-1 h-3.5 w-3.5" /></Button>}{showTodaySummary && <Button type="button" size="sm" variant="outline" onClick={() => updateDraft({ newRoundOpen: true })}>New round</Button>}</div>
              </CardContent></Card>}
              {showTodaySummary && !todayRound && !savedSummary && <Card className="border-emerald-200 dark:border-emerald-900"><CardContent className="flex flex-wrap items-center justify-between gap-2 p-4"><div><h3 className="font-semibold">Today’s round</h3><p className="text-xs text-slate-500">Loading the saved round details…</p></div><Button type="button" size="sm" variant="outline" onClick={() => updateDraft({ newRoundOpen: true })}>New round</Button></CardContent></Card>}

              {!showTodaySummary && <Card className="rounded-2xl border-slate-200 shadow-sm dark:border-slate-800"><form onSubmit={saveRound}>
                <CardContent className="space-y-3 p-4 sm:p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><div><h3 className="font-semibold text-slate-900 dark:text-white">{draft.newRoundOpen ? "New round" : "Record round"}</h3></div>{draftHasContent && <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">Draft</Badge>}</div></div>
                  <section className="space-y-1.5"><h4 className="font-semibold text-slate-900 dark:text-white">Step 1. How is the patient?</h4><p className="text-xs text-slate-500">Choose one condition.</p><div className="flex flex-wrap gap-1.5">{CONDITIONS.map((value) => { const active = draft.condition === value; const tone = value === "Critical" ? "border-rose-300 bg-rose-50 text-rose-800 dark:bg-rose-950/40 dark:text-rose-200" : value === "Deteriorating" ? "border-amber-300 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200" : value === "Improving" ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200" : "border-sky-300 bg-sky-50 text-sky-800 dark:bg-sky-950/40 dark:text-sky-200"; return <button key={value} type="button" aria-pressed={active} onClick={() => updateDraft({ condition: active ? "" : value })} className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-sm font-medium ${active ? `${tone} ring-2 ring-emerald-500/20` : "border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300"}`}>{active && <Check className="h-3.5 w-3.5" />}{value}</button>; })}</div></section>
                  <section className="space-y-1"><h4 className="font-semibold text-slate-900 dark:text-white">Step 2. Your note</h4><p className="text-xs text-slate-500">Add today’s findings and plan.</p><Textarea id="round-notes" aria-label="Round note" rows={3} value={draft.notes} onChange={(event) => updateDraft({ notes: event.target.value })} placeholder="Write a short note about the patient." className="resize-y" /></section>

                  <section className="space-y-2 border-t border-slate-100 pt-3 dark:border-slate-800"><div><h4 className="font-semibold text-slate-900 dark:text-white">Step 3. Orders for the nurse (optional)</h4><p className="text-xs text-slate-500">Medicines appear in the medication list; instructions appear in the nurse inbox.</p></div>
                    <div className="space-y-2 rounded-xl border border-slate-200 p-3 dark:border-slate-800"><h5 className="text-sm font-medium text-slate-800 dark:text-slate-200">Give medicine</h5>
                      <div className="grid items-center gap-2 sm:grid-cols-[minmax(200px,1.5fr)_minmax(170px,1fr)_72px_auto]"><MedicinePicker value={draft.medicine.medicationName} onChange={(medicationName) => updateMedicine({ medicationName })} /><Select aria-label="Frequency" value={draft.medicine.frequency} onChange={(event) => updateFrequency(event.target.value as Frequency)}>{FREQUENCIES.map((frequency) => <option key={frequency} value={frequency}>{FREQUENCY_LABELS[frequency]}</option>)}</Select><Input aria-label="Course days" type="number" min={1} max={30} disabled={draft.medicine.frequency === "STAT" || draft.medicine.frequency === "PRN"} value={draft.medicine.frequency === "STAT" || draft.medicine.frequency === "PRN" ? "" : draft.medicine.durationDays} onChange={(event) => updateMedicine({ durationDays: event.target.value })} /><Button type="button" size="sm" onClick={addMedicine} className="bg-emerald-600 text-white hover:bg-emerald-700"><Plus className="mr-1 h-4 w-4" />Add</Button></div>
                      <div className="flex flex-wrap items-center gap-x-2 text-xs text-slate-500">{draft.medicine.frequency === "STAT" ? <span>One dose now</span> : draft.medicine.frequency === "PRN" ? <span>No fixed dose times</span> : <span>{draft.medicine.timesOfDay.join(" · ") || "Choose times"}</span>}<button type="button" className="font-medium text-emerald-700 underline dark:text-emerald-300" onClick={() => updateMedicine({ editSchedule: !draft.medicine.editSchedule })}>{draft.medicine.editSchedule ? "Close edit" : "Edit"}</button><span>· Route: {draft.medicine.route}</span></div>
                      {draft.medicine.editSchedule && <div className="grid gap-2 rounded-lg bg-slate-50 p-2.5 dark:bg-slate-800/60 sm:grid-cols-2"><div className="space-y-1"><Label htmlFor="round-dose">Dose (optional)</Label><Input id="round-dose" placeholder="e.g. 500 mg" value={draft.medicine.dosage} onChange={(event) => updateMedicine({ dosage: event.target.value })} /></div><div className="space-y-1"><Label htmlFor="round-route">Route</Label><Select id="round-route" value={draft.medicine.route} onChange={(event) => updateMedicine({ route: event.target.value as Route })}>{ROUTES.map((route) => <option key={route}>{route}</option>)}</Select></div>{draft.medicine.frequency !== "STAT" && draft.medicine.frequency !== "PRN" && <div className="space-y-1"><Label htmlFor="round-times">Dose times</Label><Input id="round-times" placeholder="08:00, 20:00" value={draft.medicine.timesText} onChange={(event) => updateMedicine({ timesText: event.target.value, timesOfDay: event.target.value.split(",").map((time) => time.trim()).filter(Boolean) })} /></div>}<div className="space-y-1"><Label htmlFor="round-nurse-note">Nurse note (optional)</Label><Input id="round-nurse-note" placeholder="Additional instruction" value={draft.medicine.instructions} onChange={(event) => updateMedicine({ instructions: event.target.value })} /></div></div>}
                    </div>
                    <div className="space-y-2 rounded-xl border border-slate-200 p-3 dark:border-slate-800"><h5 className="text-sm font-medium text-slate-800 dark:text-slate-200">Nurse instruction</h5><div className="flex flex-wrap gap-1.5">{INSTRUCTION_TEMPLATES.map((template) => <button key={template} type="button" onClick={() => addInstruction(template)} className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">+ {template}</button>)}</div><div className="grid gap-2 sm:grid-cols-[minmax(180px,1fr)_130px_auto]"><Input aria-label="Nurse instruction" placeholder="Write a nurse instruction" value={draft.instructionTitle} onChange={(event) => updateDraft({ instructionTitle: event.target.value })} /><Select aria-label="Instruction priority" value={draft.instructionPriority} onChange={(event) => updateDraft({ instructionPriority: event.target.value as Priority })}>{PRIORITIES.map((priority) => <option key={priority}>{priority}</option>)}</Select><Button type="button" size="sm" variant="outline" onClick={() => addInstruction()}>Add instruction</Button></div></div>
                    {draft.orders.length > 0 && <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">{draft.orders.map((order) => <div key={order.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2 text-sm"><span className="text-emerald-700 dark:text-emerald-300">{order.type === "MEDICINE" ? <Pill className="h-4 w-4" /> : <ClipboardList className="h-4 w-4" />}</span>{order.type === "MEDICINE" ? <span className="font-medium text-slate-900 dark:text-white">{order.medicationName}{doseSuffix(order.medicationName, order.dosage)} · {FREQUENCY_SUMMARIES[order.frequency]} · {order.frequency === "STAT" ? "1 dose" : order.frequency === "PRN" ? "as needed" : `${order.durationDays} days`} · {order.timesOfDay.length ? order.timesOfDay.join(", ") : "no fixed times"}</span> : <span className="font-medium text-slate-900 dark:text-white">{order.title} · {order.priority}</span>}<Badge variant="outline" className="text-[10px]">{order.type === "MEDICINE" ? "Nurse medication list" : "Nurse task inbox"}</Badge><button type="button" aria-label="Remove order" className="ml-auto rounded p-1 text-slate-400 hover:text-rose-600" onClick={() => removeOrder(order.id)}><X className="h-4 w-4" /></button></div>)}</div>}
                  </section>
                  {roundError && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200">{roundError}</div>}
                </CardContent>
                <div className="sticky bottom-0 z-20 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-6px_20px_rgba(15,23,42,0.06)] backdrop-blur dark:border-slate-800 dark:bg-slate-950/95 sm:px-5"><span className="text-sm text-slate-600 dark:text-slate-300">Save round for <strong className="text-slate-900 dark:text-white">{selectedPatient.name}</strong></span><Button type="submit" disabled={saving} className="bg-emerald-600 text-white hover:bg-emerald-700">{saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</> : <><Send className="mr-2 h-4 w-4" />Save round</>}</Button></div>
              </form></Card>}
            </div>}

            {tab === "Timeline" && <Card className="rounded-2xl border-slate-200 shadow-sm dark:border-slate-800"><CardContent className="space-y-3 p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-semibold text-slate-900 dark:text-white">Stay timeline</h3><p className="text-xs text-slate-500">Times shown in hospital timezone</p></div><Button type="button" size="sm" variant="outline" onClick={() => void loadTimeline(selectedAdmissionId)}><RefreshCw className="mr-1.5 h-3.5 w-3.5" />Refresh</Button></div>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter timeline">{(["All", "Rounds", "Vitals", "Medicines", "Notes"] as const).map((filter) => <button key={filter} type="button" aria-pressed={timelineFilter === filter} onClick={() => setTimelineFilter(filter)} className={`rounded-full border px-3 py-1.5 text-xs font-medium ${timelineFilter === filter ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300"}`}>{filter}</button>)}</div>
              {timelineDays.length === 0 && !timelineLoading && !timelineError && <p className="rounded-xl border border-dashed p-8 text-center text-sm text-slate-500">No events match this filter.</p>}
              {timelineDays.map(([dayNumber, items], index) => {
                const opened = dayOpen[dayNumber] ?? index === 0;
                const firstDate = dateValue(items[0]?.at);
                const dateKey = firstDate ? dayKey(firstDate, displayTimeZone) : "";
                const todayKey = dayKey(new Date(), displayTimeZone);
                const yesterday = new Date(Date.now() - 86_400_000);
                const label = dateKey === todayKey ? "Today" : dateKey === dayKey(yesterday, displayTimeZone) ? "Yesterday" : `Day ${dayNumber} · ${firstDate?.toLocaleDateString("en-IN", { timeZone: displayTimeZone, day: "2-digit", month: "short" }) ?? ""}`;
                const dayDoses = items.filter((item) => item.kind === "DOSE").map((item) => timeline?.medications.find((dose) => dose._id === item.id)).filter((dose): dose is Dose => Boolean(dose));
                const dayDoseCounts = { GIVEN: dayDoses.filter((dose) => dose.status === "GIVEN").length, PENDING: dayDoses.filter((dose) => dose.status === "PENDING").length, WITHHELD: dayDoses.filter((dose) => dose.status === "WITHHELD" || dose.status === "REFUSED").length };
                const shown = items.filter((item) => item.kind !== "DOSE");
                return <section key={dayNumber} className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800"><button type="button" aria-expanded={opened} onClick={() => setDayOpen((previous) => ({ ...previous, [dayNumber]: !opened }))} className="flex w-full items-center justify-between gap-3 bg-slate-50 px-4 py-3 text-left dark:bg-slate-900/70"><span className="font-semibold text-sm text-slate-800 dark:text-slate-200">{label}</span><span className="flex items-center gap-2 text-xs text-slate-500">{items.length} events{opened ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</span></button>
                  {opened && <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {dayDoses.length > 0 && <div className="px-4 py-3"><button type="button" aria-expanded={doseOpen[dayNumber] ?? false} onClick={() => setDoseOpen((previous) => ({ ...previous, [dayNumber]: !previous[dayNumber] }))} className="flex w-full flex-wrap items-center gap-x-2 gap-y-1 text-left text-sm"><Syringe className="h-4 w-4 text-emerald-600" /><strong>Medicines: {dayDoseCounts.GIVEN} given, {dayDoseCounts.PENDING} pending, {dayDoseCounts.WITHHELD} withheld</strong><span className="ml-auto text-xs text-slate-500">{doseOpen[dayNumber] ? "Hide doses" : "Show doses"}</span></button>{(doseOpen[dayNumber] ?? false) && <div className="mt-2 space-y-1 pl-6">{dayDoses.map((dose) => <div key={dose._id} className="flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-300"><span>{dose.medicationName} {dose.dosage}</span><span>{formatClock(dose.administeredTime ?? dose.scheduledTime, displayTimeZone)}</span><Badge variant="outline">{dose.status}</Badge></div>)}</div>}</div>}
                    {shown.map((item) => {
                      const round = item.kind === "ROUND" ? rounds.find((visit) => visit._id === item.id) : undefined;
                      const prescribed = round ? orders.filter((order) => order.visitId === round._id) : [];
                      return <div key={item.id} className={`flex gap-3 px-4 py-3 ${item.kind === "ROUND" ? "bg-emerald-50/50 dark:bg-emerald-950/10" : ""}`}><span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${item.flag === "CRITICAL" ? "bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-200" : item.flag === "WATCH" ? "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-200" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}>{timelineIcon(item.kind)}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className={`text-sm ${item.kind === "ROUND" ? "font-bold text-slate-900 dark:text-white" : "font-semibold text-slate-800 dark:text-slate-200"}`}>{item.title}</p>{round?.condition && <Badge className={round.condition === "Critical" || round.condition === "Deteriorating" ? "bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-200" : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200"}>{round.condition}</Badge>}{item.flag && item.flag !== "NORMAL" && <Badge className={item.flag === "CRITICAL" ? "bg-rose-600 text-white" : "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200"}>{item.flag}</Badge>}<time className="ml-auto text-xs text-slate-500">{formatClock(item.at, displayTimeZone)}</time></div>{item.detail && <p className={`mt-1 whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-400 ${item.kind === "VITAL" ? "text-xs" : ""}`}>{item.detail}</p>}{prescribed.length > 0 && <p className="mt-1 text-xs font-medium text-emerald-800 dark:text-emerald-200">Prescribed: {prescribed.map((order) => `${order.medicationName} ${order.dosage}`).join(", ")}</p>}{round && <Button type="button" variant="ghost" size="sm" className="mt-1 h-7 px-2 text-xs text-emerald-700 dark:text-emerald-300" onClick={() => { setAddendumTarget(round); setAddendumText(""); }}>Add addendum</Button>}</div></div>;
                    })}
                  </div>}
                </section>;
              })}
            </CardContent></Card>}

            {tab === "Orders" && <div className="space-y-3"><Card className="rounded-2xl border-slate-200 shadow-sm dark:border-slate-800"><CardContent className="space-y-3 p-4 sm:p-5"><div><h3 className="font-semibold text-slate-900 dark:text-white">Medicines</h3><p className="text-xs text-slate-500">Active prescriptions and today’s dose status</p></div>
              {activeOrders.length === 0 && <p className="rounded-xl border border-dashed p-5 text-center text-sm text-slate-500">No active medicine orders.</p>}
              {activeOrders.map((order) => {
                const orderDoses = (timeline?.medications ?? []).filter((dose) => typeof dose.orderId === "string" ? dose.orderId === order._id : dose.orderId?._id === order._id);
                const todayDoses = orderDoses.filter((dose) => isToday(dose.scheduledTime, displayTimeZone));
                const nextDue = todayDoses.filter((dose) => dose.status === "PENDING").sort((left, right) => left.scheduledTime.localeCompare(right.scheduledTime))[0];
                const counts = order.doseCounts ?? {};
                const total = (counts.GIVEN ?? 0) + (counts.PENDING ?? 0) + (counts.WITHHELD ?? 0) + (counts.REFUSED ?? 0);
                return <div key={order._id} className="flex flex-col gap-2 rounded-xl border border-slate-200 p-3 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="font-semibold text-sm text-slate-900 dark:text-white">{order.medicationName} <span className="font-normal">{order.dosage} · {order.route}</span></p><p className="mt-1 text-xs text-slate-500">{order.frequency}{order.timesOfDay.length ? ` · ${order.timesOfDay.join(" · ")}` : ""} · {order.durationDays} days</p><p className="mt-1 text-xs font-medium text-slate-700 dark:text-slate-300">{nextDue ? `Next due ${formatClock(nextDue.scheduledTime, displayTimeZone)}` : todayDoses.length ? "No pending dose today" : "No dose scheduled today"} · Today: {todayDoses.filter((dose) => dose.status === "GIVEN").length}/{todayDoses.length} given <span className="text-slate-400">(course {counts.GIVEN ?? 0}/{total})</span></p>{order.instructions && <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">Nurse note: {order.instructions}</p>}</div><Button type="button" variant="outline" size="sm" className="shrink-0 text-rose-700 dark:text-rose-300" onClick={() => { setStopTarget(order); setStopReason(""); }}><Ban className="mr-1.5 h-3.5 w-3.5" />Stop</Button></div>;
              })}
            </CardContent></Card>
            <Card className="rounded-2xl border-slate-200 shadow-sm dark:border-slate-800"><CardContent className="space-y-3 p-4 sm:p-5"><div><h3 className="font-semibold text-slate-900 dark:text-white">Nurse instructions</h3><p className="text-xs text-slate-500">Tasks in the nurse inbox</p></div>{activeTasks.length === 0 && <p className="rounded-xl border border-dashed p-5 text-center text-sm text-slate-500">No active nurse instructions.</p>}{activeTasks.map((task) => <div key={task._id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 p-3 dark:border-slate-800"><div><p className="font-semibold text-sm text-slate-900 dark:text-white">{task.title}</p>{task.detail && <p className="mt-1 text-xs text-slate-500">{task.detail}</p>}</div><div className="flex gap-1.5"><Badge variant="outline">{task.priority}</Badge><Badge variant="outline">{task.status}</Badge></div></div>)}</CardContent></Card>
            <details className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"><summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 text-sm font-semibold text-slate-800 dark:text-slate-200">History <ChevronDown className="h-4 w-4 text-slate-400" /></summary><div className="space-y-2 border-t border-slate-100 p-4 dark:border-slate-800">{orders.filter((order) => order.status !== "ACTIVE").map((order) => <div key={order._id} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800/50"><span>{order.medicationName} · {order.dosage} · {order.frequency}</span><Badge variant="outline">{order.status}</Badge></div>)}{(timeline?.tasks ?? []).filter((task) => task.status === "COMPLETED" || task.status === "CANCELLED").map((task) => <div key={task._id} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800/50"><span>{task.title}</span><Badge variant="outline">{task.status}</Badge></div>)}{orders.every((order) => order.status === "ACTIVE") && (timeline?.tasks ?? []).every((task) => task.status !== "COMPLETED" && task.status !== "CANCELLED") && <p className="text-sm text-slate-500">No order history yet.</p>}</div></details></div>}
          </>}
        </section>
      </div>

      <Dialog open={Boolean(stopTarget)} onOpenChange={(open) => { if (!open && !stopping) { setStopTarget(null); setStopReason(""); } }}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>Stop medication order</DialogTitle><DialogDescription>{stopTarget ? `Stop ${stopTarget.medicationName} and cancel its future pending doses?` : ""}</DialogDescription></DialogHeader><div className="space-y-1.5"><Label htmlFor="stop-reason">Reason</Label><Textarea id="stop-reason" rows={3} value={stopReason} onChange={(event) => setStopReason(event.target.value)} placeholder="Record why this order is being stopped" /></div><DialogFooter><Button type="button" variant="outline" onClick={() => setStopTarget(null)} disabled={stopping}>Cancel</Button><Button type="button" disabled={stopping || !stopReason.trim()} onClick={() => void confirmStopOrder()} className="bg-rose-600 text-white hover:bg-rose-700">{stopping ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Ban className="mr-2 h-4 w-4" />}Stop order</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={Boolean(addendumTarget)} onOpenChange={(open) => { if (!open && !addendumSaving) { setAddendumTarget(null); setAddendumText(""); } }}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>Add to round note</DialogTitle><DialogDescription>Saved rounds are unchanged; this will be appended as a timestamped addendum.</DialogDescription></DialogHeader><div className="space-y-1.5"><Label htmlFor="round-addendum">Addendum</Label><Textarea id="round-addendum" rows={4} maxLength={4000} value={addendumText} onChange={(event) => setAddendumText(event.target.value)} placeholder="Add a correction or later observation" /></div><DialogFooter><Button type="button" variant="outline" disabled={addendumSaving} onClick={() => setAddendumTarget(null)}>Cancel</Button><Button type="button" disabled={addendumSaving || !addendumText.trim()} onClick={() => void saveAddendum()} className="bg-emerald-600 text-white hover:bg-emerald-700">{addendumSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FilePlus2 className="mr-2 h-4 w-4" />}Append addendum</Button></DialogFooter></DialogContent></Dialog>
    </main>
  );
}
