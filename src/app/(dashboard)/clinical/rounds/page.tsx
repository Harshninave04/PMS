"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  AlertTriangle, Ban, Check, ChevronDown, ChevronRight, ClipboardList, Clock3, DoorOpen, Info, Printer,
  FilePlus2, Loader2, Pill, Plus, RefreshCw, Search, Send,
  UserRound, X,
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
import { cleanRoundDisplayText, formatRoundDateTime, RoundCard, type RoundView } from "@/components/clinical/round-card";

type Condition = "Improving" | "Stable" | "Deteriorating" | "Critical";
type RoundTab = "Round" | "Timeline" | "Orders";
type Frequency = "STAT" | "OD" | "BD" | "TDS" | "QID" | "Q6H" | "Q8H" | "Q12H" | "HS" | "PRN";
type Route = "ORAL" | "IV" | "IM" | "SC" | "TOPICAL" | "INHALATION" | "OTHER";
type Priority = "Routine" | "Urgent" | "STAT";
type RoundDateFilter = "Today" | "Last 7 days" | "This stay";

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
  doctorId?: string;
  assignedDoctors?: Array<{ _id?: string; name?: string }>;
  assignedNurses?: Array<{ _id?: string; name?: string }>;
  latestVital?: LatestVital;
  latestVitalFlag?: VitalFlag;
  lastRoundAt?: string;
  roundedToday: boolean;
  dischargeRequested?: boolean;
  dischargeRequestedAt?: string;
}

interface PersonName { _id?: string; name?: string }
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
  updatedAt?: string;
  discontinuedAt?: string;
  discontinuedBy?: PersonName;
  discontinueReason?: string;
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
  authorId?: PersonName;
  completedAt?: string;
  completedBy?: PersonName;
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
  administeredBy?: PersonName;
  notes?: string;
  dayNumber?: number;
}
interface TimelineResponse {
  tasks: CareTask[];
  medications: Dose[];
  vitals: Vital[];
  notes: Round[];
  visits: Round[];
  orders: MedicationOrder[];
  timeZone?: string;
  currentUserId?: string;
  hospitalName?: string;
}
interface ApiResult<T> { success: boolean; data?: T; message?: string }
interface MedicineOption { _id: string; name: string; stockQuantity?: number }
interface MedicineDraft {
  type: "MEDICINE";
  medicationName: string;
  dosage: string;
  route: Route;
  frequency: Frequency | "";
  timesOfDay: string[];
  timesText: string;
  durationDays: string;
  instructions: string;
  editSchedule: boolean;
}
interface InstructionDraft { type: "INSTRUCTION"; id: string; title: string; priority: Priority }
type OrderDraft = (Omit<MedicineDraft, "type" | "frequency"> & { type: "MEDICINE"; frequency: Frequency; id: string }) | InstructionDraft;
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
  medicines: Array<{ name: string; dosage: string; frequency: Frequency; times: string[] }>;
  instructionCount: number;
}

const CONDITIONS: Condition[] = ["Improving", "Stable", "Deteriorating", "Critical"];
const FREQUENCIES: Frequency[] = ["OD", "BD", "TDS", "QID", "Q6H", "Q8H", "Q12H", "HS", "STAT", "PRN"];
const ROUTES: Route[] = ["ORAL", "IV", "IM", "SC", "TOPICAL", "INHALATION", "OTHER"];
const PRIORITIES: Priority[] = ["Routine", "Urgent", "STAT"];
const TIME_ZONE = "Asia/Kolkata";
const INSTRUCTION_TEMPLATES = ["Vitals every 4h", "NPO", "Strict intake/output", "Monitor SpO2", "Dressing change", "Review in 24h"];
const FREQUENCY_LABELS: Record<Frequency, string> = {
  OD: "OD  -  once daily", BD: "BD  -  twice daily", TDS: "TDS  -  thrice daily", QID: "QID  -  four times daily",
  HS: "HS  -  bedtime", STAT: "STAT  -  once now", PRN: "PRN  -  as needed", Q6H: "Q6H  -  every 6 hours", Q8H: "Q8H  -  every 8 hours", Q12H: "Q12H  -  every 12 hours",
};
const FREQUENCY_SUMMARIES: Record<Frequency, string> = {
  OD: "once daily", BD: "twice daily", TDS: "thrice daily", QID: "four times daily",
  HS: "bedtime", STAT: "once now", PRN: "as needed", Q6H: "every 6 hours", Q8H: "every 8 hours", Q12H: "every 12 hours",
};

function createDraft(): Draft {
  return {
    condition: "", notes: "",
    medicine: { type: "MEDICINE", medicationName: "", dosage: "", route: "ORAL", frequency: "", timesOfDay: [], timesText: "", durationDays: "", instructions: "", editSchedule: false },
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
  return formatRoundDateTime(value, timeZone);
}
function plural(count: number, singular: string, pluralWord = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralWord}`;
}
function formatClock(value?: string, timeZone = TIME_ZONE): string {
  const date = dateValue(value);
  return date ? date.toLocaleTimeString("en-IN", { timeZone, hour: "2-digit", minute: "2-digit", hour12: false }) : "-";
}
function courseDay(startDate?: string, timeZone = TIME_ZONE): number {
  const start = dateValue(startDate);
  if (!start) return 1;
  const startKey = dayKey(start, timeZone);
  const todayKey = dayKey(new Date(), timeZone);
  const [sy, sm, sd] = startKey.split("-").map(Number);
  const [ty, tm, td] = todayKey.split("-").map(Number);
  const startUtc = Date.UTC(sy, sm - 1, sd);
  const todayUtc = Date.UTC(ty, tm - 1, td);
  return Math.max(1, Math.floor((todayUtc - startUtc) / 86400000) + 1);
}
function formatDoctorName(value?: string): string {
  const clean = (value ?? "").trim().replace(/^(dr\.?\s*)+/i, "").trim();
  return clean ? `Dr. ${clean}` : "Attending doctor";
}
function doseSuffix(medicineName: string, dosage: string): string {
  const dose = dosage.trim();
  if (!dose) return "";
  const normalize = (value: string) => value.toLowerCase().replace(/\s+/g, "");
  return normalize(medicineName).includes(normalize(dose)) ? "" : `  -  ${dose}`;
}
function statusForPatient(patient: InpatientRow): { label: string; className: string; rank: number } {
  const flag = patient.latestVitalFlag ?? (patient.latestVital ? flagVitalForReview(patient.latestVital) : null);
  if (flag === "CRITICAL") return { label: "Vitals critical", className: "bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-200", rank: 0 };
  if (flag === "WATCH") return { label: "Watch", className: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200", rank: 1 };
  if (patient.roundedToday) return { label: "Rounded today", className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200", rank: 3 };
  return { label: "Not rounded yet", className: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300", rank: 2 };
}
function nurseSummary(patient: InpatientRow): { short: string; full: string; unassigned: boolean } {
  const names = (patient.assignedNurses ?? []).map((nurse) => nurse.name?.trim()).filter((name): name is string => Boolean(name));
  if (!names.length) return { short: "Not assigned", full: "No nurse assigned to this admission", unassigned: true };
  const shown = names.slice(0, 2).join(", ");
  const extra = names.length - 2;
  return { short: extra > 0 ? `${shown} +${extra} more` : shown, full: names.join(", "), unassigned: false };
}
function canManageDischargeFlag(patient: InpatientRow, currentUserId?: string): boolean {
  if (!currentUserId) return true;
  return patient.doctorId === currentUserId || (patient.assignedDoctors ?? []).some((doctor) => doctor._id === currentUserId);
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
  const [rosterSearch, setRosterSearch] = useState("");
  const [rosterFilter, setRosterFilter] = useState<"All" | "Not rounded" | "Needs attention">("All");
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [savedSummaries, setSavedSummaries] = useState<Record<string, SavedSummary>>({});
  const [timeline, setTimeline] = useState<TimelineResponse | null>(null);
  const [timelineAdmissionId, setTimelineAdmissionId] = useState("");
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineError, setTimelineError] = useState("");
  const [roundDateFilter, setRoundDateFilter] = useState<RoundDateFilter>("This stay");
  const [roundDoctorFilter, setRoundDoctorFilter] = useState("");
  const [tab, setTab] = useState<RoundTab>("Round");
  const [orderSectionVisibility, setOrderSectionVisibility] = useState<Record<string, { medicine?: boolean; instruction?: boolean }>>({});
  const [saving, setSaving] = useState(false);
  const [roundError, setRoundError] = useState("");
  const [doseOpen, setDoseOpen] = useState<Record<number, boolean>>({});
  const [stopTarget, setStopTarget] = useState<MedicationOrder | null>(null);
  const [stopReason, setStopReason] = useState("");
  const [stopping, setStopping] = useState(false);
  const [stoppingTaskId, setStoppingTaskId] = useState("");
  const [flagDialogOpen, setFlagDialogOpen] = useState(false);
  const [flagNotes, setFlagNotes] = useState("");
  const [flagSaving, setFlagSaving] = useState(false);
  const [addendumTarget, setAddendumTarget] = useState<Round | null>(null);
  const [addendumText, setAddendumText] = useState("");
  const [addendumSaving, setAddendumSaving] = useState(false);
  const timelineRequest = useRef(0);

  const selectedPatient = useMemo(() => inpatients.find((row) => row.admissionId === selectedAdmissionId), [inpatients, selectedAdmissionId]);
  const draft = drafts[selectedAdmissionId] ?? createDraft();
  const medicineSectionHasData = Boolean(draft.medicine.medicationName.trim() || draft.medicine.dosage.trim() || draft.medicine.frequency || draft.medicine.timesText.trim() || draft.medicine.durationDays.trim() || draft.medicine.instructions.trim() || draft.medicine.editSchedule) || draft.orders.some((order) => order.type === "MEDICINE");
  const instructionSectionHasData = Boolean(draft.instructionTitle.trim()) || draft.orders.some((order) => order.type === "INSTRUCTION");
  const medicineSectionOpen = orderSectionVisibility[selectedAdmissionId]?.medicine ?? medicineSectionHasData;
  const instructionSectionOpen = orderSectionVisibility[selectedAdmissionId]?.instruction ?? instructionSectionHasData;
  const toggleOrderSection = (section: "medicine" | "instruction") => setOrderSectionVisibility((previous) => ({
    ...previous,
    [selectedAdmissionId]: { ...previous[selectedAdmissionId], [section]: section === "medicine" ? !medicineSectionOpen : !instructionSectionOpen },
  }));
  const openOrderSection = (section: "medicine" | "instruction") => setOrderSectionVisibility((previous) => ({
    ...previous,
    [selectedAdmissionId]: { ...previous[selectedAdmissionId], [section]: true },
  }));
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
    if (!admissionId) { setTimeline(null); setTimelineAdmissionId(""); setTimelineError(""); setTimelineLoading(false); return null; }
    setTimelineAdmissionId("");
    setTimeline(null); setTimelineLoading(true); setTimelineError("");
    try {
      const response = await fetch(`/api/care-tasks/timeline?admissionId=${encodeURIComponent(admissionId)}`);
      const result = await response.json() as ApiResult<TimelineResponse>;
      if (!response.ok || !result.success || !result.data) throw new Error(result.message || "Could not load the patient timeline");
      if (requestId === timelineRequest.current) { setTimeline(result.data); setTimelineAdmissionId(admissionId); }
      return result.data;
    } catch (error) {
      if (requestId === timelineRequest.current) setTimelineError(error instanceof Error ? error.message : "Could not load the patient timeline");
      return null;
    } finally { if (requestId === timelineRequest.current) setTimelineLoading(false); }
  }, []);

  useEffect(() => { void loadRoster(); }, [loadRoster]);
  useEffect(() => { void loadTimeline(selectedAdmissionId); }, [loadTimeline, selectedAdmissionId]);
  useEffect(() => {
    const hasUnsavedDraft = Object.values(drafts).some(hasDraftContent);
    if (!hasUnsavedDraft) return;
    const warnBeforeLeave = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeLeave);
    return () => window.removeEventListener("beforeunload", warnBeforeLeave);
  }, [drafts]);

  const sortedPatients = useMemo(() => [...inpatients].sort((left, right) => statusForPatient(left).rank - statusForPatient(right).rank || left.name.localeCompare(right.name)), [inpatients]);
  const visiblePatients = useMemo(() => {
    const query = rosterSearch.trim().toLocaleLowerCase();
    return sortedPatients.filter((patient) => {
      const matchesQuery = !query || [patient.name, patient.uhid, patient.bedNumber, patient.wardName].some((value) => value.toLocaleLowerCase().includes(query));
      const status = statusForPatient(patient);
      const matchesFilter = rosterFilter === "All" || (rosterFilter === "Not rounded" ? !patient.roundedToday : status.rank <= 1);
      return matchesQuery && matchesFilter;
    });
  }, [sortedPatients, rosterSearch, rosterFilter]);
  const roundCount = inpatients.filter((patient) => patient.roundedToday).length;
  const currentTimeline = timelineAdmissionId === selectedAdmissionId ? timeline : null;
  const displayTimeZone = currentTimeline?.timeZone ?? TIME_ZONE;
  const visits = currentTimeline?.visits ?? [];
  const rounds = visits.filter((visit) => visit.recordType === "Progress Note");
  const todayRound = rounds.find((visit) => isToday(visit.visitedAt ?? visit.dateRecorded ?? visit.createdAt, displayTimeZone));
  const latestVitals = currentTimeline?.vitals[0] ?? selectedPatient?.latestVital;
  const latestFlag = latestVitals ? flagVitalForReview(latestVitals) : null;
  const orders = currentTimeline?.orders ?? [];
  const activeOrders = orders.filter((order) => order.status === "ACTIVE");
  const activeTasks = (currentTimeline?.tasks ?? []).filter((task) => task.status !== "COMPLETED" && task.status !== "CANCELLED");
  const historyOrders = orders.filter((order) => order.status !== "ACTIVE");
  const historyTasks = (currentTimeline?.tasks ?? []).filter((task) => task.status === "COMPLETED" || task.status === "CANCELLED");
  const historyCount = historyOrders.length + historyTasks.length;
  const matchingPatientAdmissions = selectedPatient ? inpatients.filter((row) => String(row.patientId) === String(selectedPatient.patientId)).length : 0;
  const allRoundCards = useMemo(() => rounds.map((round) => ({
    ...round,
    addenda: visits.filter((entry) => entry.recordType === "Visit Addendum" && entry.parentVisitId === round._id),
    orders: orders.filter((order) => order.visitId === round._id),
  } as RoundView)).sort((left, right) => new Date(right.visitedAt || right.dateRecorded || right.createdAt || 0).getTime() - new Date(left.visitedAt || left.dateRecorded || left.createdAt || 0).getTime()), [rounds, visits, orders]);
  const roundCards = allRoundCards.filter((round) => {
    const date = new Date(round.visitedAt || round.dateRecorded || round.createdAt || 0);
    const now = new Date();
    const dateMatches = roundDateFilter === "This stay" || (roundDateFilter === "Today"
      ? isToday(date.toISOString(), displayTimeZone)
      : date.getTime() >= now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const roundDoctorId = typeof round.doctor === "object" ? round.doctor?._id : undefined;
    return dateMatches && (!roundDoctorFilter || roundDoctorId === roundDoctorFilter);
  });
  const savedSummary = savedSummaries[selectedAdmissionId];
  const showTodaySummary = Boolean(selectedPatient?.roundedToday && !draft.newRoundOpen);
  const todayOrders = todayRound ? orders.filter((order) => order.visitId === todayRound._id) : [];
  const todayInstructionCount = (currentTimeline?.tasks ?? []).filter((task) => isToday(task.createdAt, displayTimeZone)).length;
  const draftHasContent = hasDraftContent(drafts[selectedAdmissionId]);
  const savedNote = cleanRoundDisplayText(savedSummary?.notes || todayRound?.notes || todayRound?.details || todayRound?.text);
  const savedNoteExcerpt = savedNote.length > 120 ? `${savedNote.slice(0, 117)}...` : savedNote || "No note";

  const updateMedicine = (change: Partial<MedicineDraft>) => updateDraft({ medicine: { ...draft.medicine, ...change } });
  const updateFrequency = (frequency: Frequency | "") => {
    const timesOfDay = !frequency || frequency === "STAT" || frequency === "PRN" ? [] : [...(FREQUENCY_SUGGESTIONS[frequency] ?? [])];
    updateMedicine({ frequency, timesOfDay, timesText: timesOfDay.join(", ") });
  };
  const addMedicine = () => {
    const medicine = draft.medicine;
    const frequency = medicine.frequency;
    if (!medicine.medicationName.trim()) { setRoundError("Choose or type a medicine before adding it."); return; }
    if (!frequency) { setRoundError("Choose a medicine frequency."); return; }
    if (frequency !== "STAT" && frequency !== "PRN" && (!medicine.durationDays || !medicine.timesOfDay.length)) { setRoundError("Choose dose times and course length."); return; }
    const order: OrderDraft = { ...medicine, frequency, id: crypto.randomUUID() };
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
    if (draftAtSave.medicine.medicationName.trim() || draftAtSave.medicine.dosage.trim() || draftAtSave.instructionTitle.trim()) {
      setRoundError("Add or clear the medicine or instruction you started before saving.");
      return;
    }
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
        medicines: draftAtSave.orders.filter((order): order is Extract<OrderDraft, { type: "MEDICINE" }> => order.type === "MEDICINE").map((order) => ({ name: order.medicationName, dosage: order.dosage, frequency: order.frequency, times: order.timesOfDay })),
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
  const stopInstruction = async (task: CareTask) => {
    setStoppingTaskId(task._id);
    try {
      const response = await fetch(`/api/care-tasks/${task._id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "CANCELLED" }) });
      const result = await response.json() as ApiResult<unknown>;
      if (!response.ok || !result.success) throw new Error(result.message || "Could not stop the instruction");
      toast("Instruction stopped", "success");
      await loadTimeline(selectedAdmissionId);
    } catch (error) { toast(error instanceof Error ? error.message : "Could not stop the instruction", "error"); }
    finally { setStoppingTaskId(""); }
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

  const confirmFlagDischarge = async () => {
    const admissionId = selectedAdmissionId;
    if (!admissionId) return;
    setFlagSaving(true);
    try {
      const response = await fetch("/api/admission/discharge-request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ admissionId, notes: flagNotes.trim() || undefined }) });
      const result = await response.json() as ApiResult<unknown>;
      if (!response.ok || !result.success) throw new Error(result.message || "Could not flag this stay for discharge");
      toast("Discharge flagged — nursing will take over", "success");
      setFlagDialogOpen(false); setFlagNotes("");
      await loadRoster();
    } catch (error) { toast(error instanceof Error ? error.message : "Could not flag this stay for discharge", "error"); }
    finally { setFlagSaving(false); }
  };
  const withdrawDischargeFlag = async () => {
    const admissionId = selectedAdmissionId;
    if (!admissionId) return;
    setFlagSaving(true);
    try {
      const response = await fetch("/api/admission/discharge-request", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ admissionId }) });
      const result = await response.json() as ApiResult<unknown>;
      if (!response.ok || !result.success) throw new Error(result.message || "Could not withdraw the discharge flag");
      toast("Discharge flag withdrawn", "success");
      setFlagDialogOpen(false); setFlagNotes("");
      await loadRoster();
    } catch (error) { toast(error instanceof Error ? error.message : "Could not withdraw the discharge flag", "error"); }
    finally { setFlagSaving(false); }
  };

  return (
    <main className="mx-auto max-w-[1500px] space-y-4 pb-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div><h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Ward Rounds</h1><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Review patients, record rounds, and coordinate care.</p></div>
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm shadow-sm dark:border-slate-800 dark:bg-slate-900"><span className="font-semibold text-slate-900 dark:text-white">Rounded {roundCount}/{inpatients.length} today</span><div className="mt-1.5 h-1.5 w-40 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${inpatients.length ? (roundCount / inpatients.length) * 100 : 0}%` }} /></div></div>
      </header>

      <div className="space-y-2 lg:hidden"><Label htmlFor="patient-roster-search-mobile">Find patient</Label><Input id="patient-roster-search-mobile" value={rosterSearch} onChange={(event) => setRosterSearch(event.target.value)} placeholder="Search name, UHID, or bed" /><Select id="patient-top-select" value={visiblePatients.some((patient) => patient.admissionId === selectedAdmissionId) ? selectedAdmissionId : ""} onChange={(event) => setSelectedAdmissionId(event.target.value)} disabled={!visiblePatients.length}><option value="">Select patient</option>{visiblePatients.map((patient) => <option key={patient.admissionId} value={patient.admissionId}>{cleanRoundDisplayText(patient.name)} - Bed {cleanRoundDisplayText(patient.bedNumber)} - {cleanRoundDisplayText(patient.wardName)}{patient.dischargeRequested ? " - Flagged for discharge" : ""}{hasDraftContent(drafts[patient.admissionId]) ? " - Unsaved" : ""}</option>)}</Select><div className="flex flex-wrap gap-1.5">{(["All", "Not rounded", "Needs attention"] as const).map((filter) => <button key={filter} type="button" aria-pressed={rosterFilter === filter} onClick={() => setRosterFilter(filter)} className={`rounded-full border px-2.5 py-1 text-xs ${rosterFilter === filter ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300"}`}>{filter}</button>)}</div></div>

      <div className="grid items-start gap-4 lg:grid-cols-[290px_minmax(0,1fr)] xl:grid-cols-[310px_minmax(0,1fr)]">
        <Card className="hidden rounded-2xl border-slate-200 shadow-sm dark:border-slate-800 lg:block lg:sticky lg:top-3"><CardContent className="space-y-3 p-4">
          <div className="flex items-center justify-between"><div><h2 className="font-semibold text-slate-900 dark:text-white">My inpatients</h2><p className="text-xs text-slate-500">Assigned care team stays</p></div><Badge variant="outline">{visiblePatients.length}/{inpatients.length}</Badge></div>
          <div className="space-y-2"><Input aria-label="Search inpatients" value={rosterSearch} onChange={(event) => setRosterSearch(event.target.value)} placeholder="Search name, UHID, or bed" /><div className="flex flex-wrap gap-1.5">{(["All", "Not rounded", "Needs attention"] as const).map((filter) => <button key={filter} type="button" aria-pressed={rosterFilter === filter} onClick={() => setRosterFilter(filter)} className={`rounded-full border px-2.5 py-1 text-xs ${rosterFilter === filter ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300"}`}>{filter}</button>)}</div></div>
          {rosterError && <InlineError message={rosterError} onRetry={() => void loadRoster()} />}
          {rosterLoading && <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Loading roster</div>}
          {!rosterLoading && !rosterError && inpatients.length === 0 && <div className="rounded-xl border border-dashed p-5 text-center text-sm text-slate-500">No active patients are assigned to your care team.</div>}
          {!rosterLoading && !rosterError && inpatients.length > 0 && visiblePatients.length === 0 && <div className="rounded-xl border border-dashed p-5 text-center text-sm text-slate-500">No patients match this search or filter.</div>}
          <div className="max-h-[calc(100vh-300px)] space-y-2 overflow-y-auto pr-1">{visiblePatients.map((patient) => {
            const status = statusForPatient(patient); const selected = patient.admissionId === selectedAdmissionId;
            const hasPatientDraft = hasDraftContent(drafts[patient.admissionId]);
            const nurses = nurseSummary(patient);
            return <button key={patient.admissionId} type="button" onClick={() => { setSelectedAdmissionId(patient.admissionId); setRoundError(""); }} className={`w-full rounded-xl border p-3 text-left transition ${selected ? "border-emerald-500 bg-emerald-50/70 ring-1 ring-emerald-500/20 dark:bg-emerald-950/30" : "border-slate-200 hover:border-emerald-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/60"}`}>
              <div className="flex items-start justify-between gap-2"><span className="font-semibold text-sm text-slate-900 dark:text-white">{patient.name}</span><span className="flex shrink-0 items-center gap-1">{hasPatientDraft && <Badge variant="outline" className="border-amber-300 bg-amber-50 text-[10px] text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">Unsaved</Badge>}{patient.dischargeRequested && <Badge className="border-0 bg-amber-100 text-[10px] text-amber-900 dark:bg-amber-950/40 dark:text-amber-200" title="Discharge flagged — nursing will take over">Flagged</Badge>}<Badge className={`border-0 text-[10px] ${status.className}`}>{status.label}</Badge></span></div>
              <p className="mt-1 text-xs text-slate-500">Bed {cleanRoundDisplayText(patient.bedNumber)} - {cleanRoundDisplayText(patient.wardName)}</p><p title={cleanRoundDisplayText(nurses.full)} className={`mt-1 truncate text-xs ${nurses.unassigned ? "text-slate-500" : "text-slate-600 dark:text-slate-300"}`}>Nurse: {cleanRoundDisplayText(nurses.short)}</p><p className="mt-1 truncate text-xs text-slate-500">{cleanRoundDisplayText(patient.diagnosis)}</p>
              {patient.allergies.length > 0 && <p className="mt-2 flex items-center gap-1 truncate text-[11px] font-medium text-rose-700 dark:text-rose-300"><AlertTriangle className="h-3 w-3 shrink-0" />{patient.allergies.join(", ")}</p>}
            </button>;
          })}</div>
        </CardContent></Card>

        <section className="min-w-0 space-y-3">
          {rosterError && <div className="lg:hidden"><InlineError message={rosterError} onRetry={() => void loadRoster()} /></div>}
          {!selectedPatient && !rosterLoading && !rosterError && <Card className="rounded-2xl border-dashed"><CardContent className="py-16 text-center text-sm text-slate-500">Select an assigned inpatient to begin.</CardContent></Card>}
          {selectedPatient && <>
            {matchingPatientAdmissions > 1 && <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">This patient has more than one active admission. Please ask Reception to fix it.</div>}
            <Card className="rounded-2xl border-slate-200 shadow-sm dark:border-slate-800"><CardContent className="space-y-2 p-3 sm:p-3.5">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5"><UserRound className="h-4 w-4 shrink-0 text-emerald-600" /><h2 className="text-sm font-bold text-slate-900 dark:text-white">{cleanRoundDisplayText(selectedPatient.name)}</h2><span className="text-xs text-slate-500">{cleanRoundDisplayText(selectedPatient.uhid)}</span><span className="text-xs text-slate-500">{selectedPatient.age ?? "-"} years - {cleanRoundDisplayText(selectedPatient.gender) || "-"}</span><span className="text-xs font-medium text-slate-700 dark:text-slate-300">Bed {cleanRoundDisplayText(selectedPatient.bedNumber)} - {cleanRoundDisplayText(selectedPatient.wardName)}</span><span className="ml-auto text-xs text-slate-500">{cleanRoundDisplayText(formatDoctorName(selectedPatient.doctorName))}</span></div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-slate-100 pt-2 dark:border-slate-800">
                <span className={`inline-flex items-center gap-1 text-xs font-semibold ${selectedPatient.allergies.length ? "text-rose-700 dark:text-rose-300" : "text-slate-500"}`}><AlertTriangle className="h-3.5 w-3.5" />Allergies: {selectedPatient.allergies.length ? selectedPatient.allergies.join(", ") : "none recorded"}</span>
                <span className="text-xs text-slate-600 dark:text-slate-300">Vitals: {latestVitals ? `BP ${latestVitals.bloodPressure ?? "-"}  -  HR ${latestVitals.heartRate ?? "-"}  -  SpO2 ${latestVitals.oxygenSaturation ?? "-"}%${latestVitals.dateRecorded ? `  -  ${formatClock(latestVitals.dateRecorded, displayTimeZone)}` : ""}` : "not recorded"}</span>
                {latestFlag && <Badge className={`py-0 text-[10px] ${latestFlag === "CRITICAL" ? "bg-rose-600 text-white" : latestFlag === "WATCH" ? "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200" : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200"}`}>{latestFlag}</Badge>}
                {(() => { const nurses = nurseSummary(selectedPatient); return <span title={nurses.full} className={`text-xs ${nurses.unassigned ? "text-slate-500" : "text-slate-600 dark:text-slate-300"}`}>Nurse: {nurses.short}</span>; })()}
                <span className="text-xs text-slate-600 dark:text-slate-300">{activeOrders.length} active meds</span><span className="text-xs text-slate-500">Last round: {todayRound ? formatDateTime(todayRound.visitedAt ?? todayRound.dateRecorded ?? todayRound.createdAt, displayTimeZone) : selectedPatient.lastRoundAt ? formatDateTime(selectedPatient.lastRoundAt, displayTimeZone) : "not yet"}</span>
                {selectedPatient.dischargeRequested && <Badge className="bg-amber-100 py-0 text-[10px] text-amber-900 dark:bg-amber-950/50 dark:text-amber-200" title={`Discharge flagged${selectedPatient.dischargeRequestedAt ? ` on ${formatDateTime(selectedPatient.dischargeRequestedAt, displayTimeZone)}` : ""} — nursing will take over`}>Discharge flagged</Badge>}
                {canManageDischargeFlag(selectedPatient, currentTimeline?.currentUserId) && (selectedPatient.dischargeRequested
                  ? <Button type="button" size="sm" variant="outline" className="ml-auto h-7 px-2.5 text-xs" disabled={flagSaving} onClick={() => { setFlagDialogOpen(true); setFlagNotes(""); }}>Withdraw flag</Button>
                  : <Button type="button" size="sm" variant="outline" className="ml-auto h-7 shrink-0 px-2.5 text-xs" disabled={flagSaving} onClick={() => { setFlagDialogOpen(true); setFlagNotes(""); }}><DoorOpen className="mr-1 h-3.5 w-3.5" />Flag for discharge</Button>)}
              </div>
            </CardContent></Card>

            <div className="flex gap-1 border-b border-slate-200 dark:border-slate-800" role="tablist" aria-label="Patient workspace">{(["Round", "Timeline", "Orders"] as const).map((name) => <button key={name} role="tab" aria-selected={tab === name} type="button" onClick={() => setTab(name)} className={`border-b-2 px-4 py-2 text-sm font-medium transition ${tab === name ? "border-emerald-600 text-emerald-700 dark:text-emerald-300" : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"}`}>{name}</button>)}</div>
            {timelineError && <InlineError message={timelineError} onRetry={() => void loadTimeline(selectedAdmissionId)} />}
            {timelineLoading && <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Loading patient timeline...</div>}

            {tab === "Round" && <div className="space-y-3">
              {(savedSummary || (showTodaySummary && todayRound)) && <Card className="border-emerald-200 bg-emerald-50/70 shadow-sm dark:border-emerald-900 dark:bg-emerald-950/20"><CardContent className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3">
                <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                  <Check className="h-4 w-4 shrink-0 text-emerald-600" />
                  <h3 className="whitespace-nowrap text-sm font-semibold text-emerald-950 dark:text-emerald-100">Round saved</h3>
                  <span className="text-xs text-slate-600 dark:text-slate-300">{formatDateTime(savedSummary?.at ?? todayRound?.visitedAt ?? todayRound?.dateRecorded ?? todayRound?.createdAt, displayTimeZone)}</span>
                  {(savedSummary?.condition ?? todayRound?.condition) && <Badge variant="outline" className={`border ${savedSummary?.condition === "Critical" || todayRound?.condition === "Critical" ? "border-rose-300 bg-rose-50 text-rose-800 dark:bg-rose-950/40 dark:text-rose-200" : savedSummary?.condition === "Deteriorating" || todayRound?.condition === "Deteriorating" ? "border-amber-300 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200" : "border-emerald-300 bg-emerald-100 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100"}`}>{savedSummary?.condition ?? todayRound?.condition}</Badge>}
                  <Badge variant="outline" className="whitespace-nowrap border-emerald-300 text-emerald-800 dark:text-emerald-200">{savedSummary ? "Saved just now" : "Today's round"}</Badge>
                </div>
                <p title={savedNote || "No note"} className="min-w-0 flex-1 overflow-hidden whitespace-nowrap text-xs text-slate-700 dark:text-slate-200">{savedNoteExcerpt}</p>
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-700 dark:text-slate-200">
                  {savedSummary ? <>
                    <span className="whitespace-nowrap">{plural(savedSummary.medicines.length, "medicine", "medicines")}</span>
                    {savedSummary.medicines.map((medicine, index) => <span key={`${medicine.name}-${index}`} className="max-w-56 truncate rounded-full border border-emerald-200 bg-white/70 px-2 py-0.5 dark:border-emerald-900 dark:bg-slate-900/50" title={`${cleanRoundDisplayText(medicine.name)}${medicine.dosage ? ` ${cleanRoundDisplayText(medicine.dosage)}` : " - Dose: not set"}`}>
                      {cleanRoundDisplayText(medicine.name)}{medicine.dosage ? ` ${cleanRoundDisplayText(medicine.dosage)}` : <span className="text-amber-700 dark:text-amber-300"> Dose: not set</span>} - {medicine.frequency}{medicine.times.length ? ` ${cleanRoundDisplayText(medicine.times.join(", "))}` : ""}
                    </span>)}
                    <span className="whitespace-nowrap">{plural(savedSummary.instructionCount, "instruction", "instructions")}</span>
                  </> : <>
                    <span className="whitespace-nowrap">{plural(todayOrders.length, "medicine", "medicines")}</span>
                    {todayOrders.map((medicine) => <span key={medicine._id} className="max-w-56 truncate rounded-full border border-emerald-200 bg-white/70 px-2 py-0.5 dark:border-emerald-900 dark:bg-slate-900/50" title={`${cleanRoundDisplayText(medicine.medicationName)}${medicine.dosage ? ` ${cleanRoundDisplayText(medicine.dosage)}` : " - Dose: not set"}`}>
                      {cleanRoundDisplayText(medicine.medicationName)}{medicine.dosage ? ` ${cleanRoundDisplayText(medicine.dosage)}` : <span className="text-amber-700 dark:text-amber-300"> Dose: not set</span>} - {medicine.frequency}{medicine.timesOfDay.length ? ` ${cleanRoundDisplayText(medicine.timesOfDay.join(", "))}` : ""}
                    </span>)}
                    <span className="whitespace-nowrap">{plural(todayInstructionCount, "instruction", "instructions")}</span>
                  </>}
                  <span title="Nurses can see doses in the medication list; instructions are in the nurse inbox." aria-label="Round order information" className="inline-flex h-5 w-5 items-center justify-center rounded-full text-emerald-800 dark:text-emerald-200"><Info className="h-3.5 w-3.5" /></span>
                </div>
                <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5">
                  {todayRound && typeof todayRound.doctor === "object" && todayRound.doctor?._id === currentTimeline?.currentUserId && <Button type="button" size="sm" variant="outline" className="h-8 px-2.5 text-xs" onClick={() => { setAddendumTarget(todayRound); setAddendumText(""); }}>Add addendum</Button>}
                  <Button type="button" size="sm" variant="outline" className="h-8 px-2.5 text-xs" onClick={() => setTab("Timeline")}>View in Timeline</Button>
                  {nextPatientId && <Button type="button" size="sm" className="h-8 bg-emerald-600 px-2.5 text-xs text-white hover:bg-emerald-700" onClick={() => setSelectedAdmissionId(nextPatientId)}>Next patient</Button>}
                  {showTodaySummary && <Button type="button" size="sm" variant="outline" className="h-8 px-2.5 text-xs" onClick={() => updateDraft({ newRoundOpen: true })}>New round</Button>}
                </div>
              </CardContent></Card>}
              {showTodaySummary && !todayRound && !savedSummary && <Card className="border-emerald-200 dark:border-emerald-900"><CardContent className="flex flex-wrap items-center justify-between gap-2 p-4"><div><h3 className="font-semibold">Today's round</h3><p className="text-xs text-slate-500">Loading the saved round details...</p></div><Button type="button" size="sm" variant="outline" onClick={() => updateDraft({ newRoundOpen: true })}>New round</Button></CardContent></Card>}

              {!showTodaySummary && <Card className="rounded-2xl border-slate-200 shadow-sm dark:border-slate-800"><form onSubmit={saveRound}>
                <CardContent className="space-y-2.5 p-3 pb-20 sm:p-4 sm:pb-20">
                  <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold text-slate-900 dark:text-white">Record round</h3>{draftHasContent && <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">Unsaved changes</Badge>}</div>
                  <section className="flex flex-wrap items-center gap-x-3 gap-y-1.5"><h4 className="shrink-0 text-sm font-semibold text-slate-900 dark:text-white">Condition</h4><div className="flex flex-wrap gap-1.5">{CONDITIONS.map((value) => { const active = draft.condition === value; const tone = value === "Critical" ? "border-rose-300 bg-rose-50 text-rose-800 dark:bg-rose-950/40 dark:text-rose-200" : value === "Deteriorating" ? "border-amber-300 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200" : "border-emerald-300 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"; return <button key={value} type="button" aria-pressed={active} onClick={() => updateDraft({ condition: active ? "" : value })} className={`inline-flex h-9 items-center gap-1 rounded-full border px-3 text-sm font-medium ${active ? `${tone} ring-2 ring-emerald-500/20` : "border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300"}`}>{active && <Check className="h-3.5 w-3.5" />}{value}</button>; })}</div></section>
                  <section className="space-y-1"><h4 className="text-sm font-semibold text-slate-900 dark:text-white">Round note</h4><Textarea id="round-notes" aria-label="Round note" rows={2} value={cleanRoundDisplayText(draft.notes)} onChange={(event) => updateDraft({ notes: event.target.value })} placeholder="Add today's findings and plan." className="resize-y" /></section>

                  <section className="space-y-2 border-t border-slate-100 pt-2.5 dark:border-slate-800">
                    <div className="flex flex-wrap items-center gap-2"><h4 className="text-sm font-semibold text-slate-900 dark:text-white">Orders (optional)</h4><span title="Medicines appear in the medication list; instructions appear in the nurse inbox." aria-label="Orders information" className="inline-flex h-5 w-5 items-center justify-center text-slate-500"><Info className="h-3.5 w-3.5" /></span><div className="ml-auto flex flex-wrap gap-1.5"><Button type="button" size="sm" variant="outline" aria-expanded={medicineSectionOpen} onClick={() => toggleOrderSection("medicine")}><Plus className="mr-1 h-3.5 w-3.5" />Add medicine</Button><Button type="button" size="sm" variant="outline" aria-expanded={instructionSectionOpen} onClick={() => toggleOrderSection("instruction")}><Plus className="mr-1 h-3.5 w-3.5" />Add instruction</Button></div></div>
                    {medicineSectionOpen && <div id="round-medicine-section" className="space-y-1.5 border-t border-slate-100 pt-2 dark:border-slate-800"><h5 className="text-sm font-medium text-slate-800 dark:text-slate-200">Give medicine</h5>
                      <div className="grid min-w-0 items-center gap-1.5 sm:grid-cols-[minmax(200px,1fr)_minmax(160px,0.8fr)_72px_auto]"><MedicinePicker value={draft.medicine.medicationName} onChange={(medicationName) => updateMedicine({ medicationName })} /><Select aria-label="Frequency" value={draft.medicine.frequency} onChange={(event) => updateFrequency(event.target.value as Frequency | "")}><option value="">Select frequency</option>{FREQUENCIES.map((frequency) => <option key={frequency} value={frequency}>{FREQUENCY_LABELS[frequency]}</option>)}</Select><Input aria-label="Course days" placeholder="Days" type="number" min={1} max={30} disabled={!draft.medicine.frequency || draft.medicine.frequency === "STAT" || draft.medicine.frequency === "PRN"} value={!draft.medicine.frequency || draft.medicine.frequency === "STAT" || draft.medicine.frequency === "PRN" ? "" : draft.medicine.durationDays} onChange={(event) => updateMedicine({ durationDays: event.target.value })} /><Button type="button" size="sm" onClick={addMedicine} className="bg-emerald-600 text-white hover:bg-emerald-700"><Plus className="mr-1 h-4 w-4" />Add</Button></div>
                      <div className="flex flex-wrap items-center gap-x-2 text-xs text-slate-500">{!draft.medicine.frequency ? <span>Select a frequency to set suggested dose times.</span> : draft.medicine.frequency === "STAT" ? <span>One dose now</span> : draft.medicine.frequency === "PRN" ? <span>No fixed dose times</span> : <span>{draft.medicine.timesOfDay.join("  -  ") || "Choose times"}</span>}{draft.medicine.frequency && <><button type="button" className="font-medium text-emerald-700 underline dark:text-emerald-300" onClick={() => updateMedicine({ editSchedule: !draft.medicine.editSchedule })}>{draft.medicine.editSchedule ? "Edit schedule" : "Edit details"}</button><span> -  Route: {draft.medicine.route}</span></>}</div>
                      {draft.medicine.editSchedule && <div className="grid gap-2 border-t border-slate-100 pt-2 sm:grid-cols-2 dark:border-slate-800"><div className="space-y-1"><Label htmlFor="round-dose">Dose (optional)</Label><Input id="round-dose" placeholder="e.g. 500 mg" value={draft.medicine.dosage} onChange={(event) => updateMedicine({ dosage: event.target.value })} /></div><div className="space-y-1"><Label htmlFor="round-route">Route</Label><Select id="round-route" value={draft.medicine.route} onChange={(event) => updateMedicine({ route: event.target.value as Route })}>{ROUTES.map((route) => <option key={route}>{route}</option>)}</Select></div>{draft.medicine.frequency && draft.medicine.frequency !== "STAT" && draft.medicine.frequency !== "PRN" && <div className="space-y-1"><Label htmlFor="round-times">Dose times</Label><Input id="round-times" placeholder="08:00, 20:00" value={draft.medicine.timesText} onChange={(event) => updateMedicine({ timesText: event.target.value, timesOfDay: event.target.value.split(",").map((time) => time.trim()).filter(Boolean) })} /></div>}<div className="space-y-1"><Label htmlFor="round-nurse-note">Nurse note (optional)</Label><Input id="round-nurse-note" placeholder="Additional instruction" value={draft.medicine.instructions} onChange={(event) => updateMedicine({ instructions: event.target.value })} /></div></div>}
                      {draft.orders.some((order) => order.type === "MEDICINE") && <div className="flex flex-wrap gap-1.5 pt-1">{draft.orders.filter((order): order is Extract<OrderDraft, { type: "MEDICINE" }> => order.type === "MEDICINE").map((order) => <span key={order.id} className="inline-flex max-w-full items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100"><Pill className="h-3 w-3 shrink-0" /><span className="truncate">{order.medicationName}{doseSuffix(order.medicationName, order.dosage)} {order.frequency} {order.durationDays}d</span><button type="button" aria-label="Remove order" className="rounded p-0.5 text-slate-500 hover:text-rose-600" onClick={() => removeOrder(order.id)}><X className="h-3 w-3" /></button></span>)}</div>}
                    </div>}
                    {instructionSectionOpen && <div id="round-instruction-section" className="space-y-1.5 border-t border-slate-100 pt-2 dark:border-slate-800"><h5 className="text-sm font-medium text-slate-800 dark:text-slate-200">Nurse instruction</h5><div className="flex flex-wrap gap-1">{INSTRUCTION_TEMPLATES.map((template) => <button key={template} type="button" onClick={() => addInstruction(template)} className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">+ {template}</button>)}</div><div className="grid gap-1.5 sm:grid-cols-[minmax(180px,1fr)_130px_auto]"><Input aria-label="Nurse instruction" placeholder="Write a nurse instruction" value={draft.instructionTitle} onChange={(event) => updateDraft({ instructionTitle: event.target.value })} /><Select aria-label="Instruction priority" value={draft.instructionPriority} onChange={(event) => updateDraft({ instructionPriority: event.target.value as Priority })}>{PRIORITIES.map((priority) => <option key={priority}>{priority}</option>)}</Select><Button type="button" size="sm" variant="outline" onClick={() => addInstruction()}>Add</Button></div>
                      {draft.orders.some((order) => order.type === "INSTRUCTION") && <div className="flex flex-wrap gap-1.5 pt-1">{draft.orders.filter((order): order is InstructionDraft => order.type === "INSTRUCTION").map((order) => <span key={order.id} className="inline-flex max-w-full items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100"><ClipboardList className="h-3 w-3 shrink-0" /><span className="truncate">{order.title}</span><button type="button" aria-label="Remove order" className="rounded p-0.5 text-slate-500 hover:text-rose-600" onClick={() => removeOrder(order.id)}><X className="h-3 w-3" /></button></span>)}</div>}
                    </div>}
                  </section>
                  {roundError && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200">{roundError}</div>}
                </CardContent>
                <div className="sticky bottom-0 z-20 flex justify-end border-t border-slate-200 bg-white/95 px-3 py-2 shadow-[0_-6px_20px_rgba(15,23,42,0.06)] backdrop-blur dark:border-slate-800 dark:bg-slate-950/95 sm:px-4"><Button type="submit" disabled={saving} className="bg-emerald-600 text-white hover:bg-emerald-700">{saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving...</> : <><Send className="mr-2 h-4 w-4" />Save round</>}</Button></div>
              </form></Card>}
            </div>}

            {tab === "Timeline" && <Card className="rounded-2xl border-slate-200 shadow-sm dark:border-slate-800"><CardContent className="space-y-4 p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-semibold text-slate-900 dark:text-white">Ward rounds</h3><p className="text-xs text-slate-500">Saved rounds for this admission, newest first.</p></div><div className="flex gap-2"><Button type="button" size="sm" variant="outline" onClick={() => window.print()}><Printer className="mr-1.5 h-3.5 w-3.5" />Print rounds</Button><Button type="button" size="sm" variant="outline" onClick={() => void loadTimeline(selectedAdmissionId)}><RefreshCw className="mr-1.5 h-3.5 w-3.5" />Refresh</Button></div></div>
              <div className="flex flex-wrap gap-2"><Select aria-label="Filter rounds by date" value={roundDateFilter} onChange={(event) => setRoundDateFilter(event.target.value as RoundDateFilter)}><option>Today</option><option>Last 7 days</option><option>This stay</option></Select><Select aria-label="Filter rounds by doctor" value={roundDoctorFilter} onChange={(event) => setRoundDoctorFilter(event.target.value)}><option value="">All doctors</option>{Array.from(new Map(rounds.map((round) => { const doc = round.doctor; const id = typeof doc === "object" ? doc?._id || "" : ""; return [id, { id, name: formatDoctorName(typeof doc === "object" ? doc?.name || "Doctor" : "Doctor") }]; })).values()).filter((doc) => doc.id).map((doc) => <option key={doc.id} value={doc.id}>{doc.name}</option>)}</Select></div>
              {timelineError && <InlineError message={timelineError} onRetry={() => void loadTimeline(selectedAdmissionId)} />}
              {timelineLoading && <div className="flex items-center gap-2 py-6 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Loading rounds...</div>}
              {!timelineLoading && !timelineError && roundCards.length === 0 && <p className="rounded-xl border border-dashed p-8 text-center text-sm text-slate-500">No rounds recorded yet</p>}
              {!timelineLoading && !timelineError && <div className="grid grid-cols-1 gap-3">{roundCards.map((round) => <RoundCard key={round._id} round={round} bedWard={(selectedPatient?.bedNumber || "Bed not recorded") + "  -  " + (selectedPatient?.wardName || "Ward not recorded")} attendingDoctorId={selectedPatient?.doctorId} timeZone={displayTimeZone} actions={typeof round.doctor === "object" && round.doctor?._id === currentTimeline?.currentUserId ? <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => { const saved = rounds.find((item) => item._id === round._id); if (saved) { setAddendumTarget(saved); setAddendumText(""); } }}>+ Addendum</Button> : undefined} />)}</div>}
              {!timelineLoading && !timelineError && (currentTimeline?.tasks.length ?? 0) > 0 && <details className="rounded-lg border border-slate-200 bg-white/70 px-3 py-2 dark:border-slate-800 dark:bg-slate-900/40"><summary className="cursor-pointer text-xs font-medium text-slate-700 dark:text-slate-200">Admission instructions (not linked to a specific round)</summary><ul className="mt-2 space-y-2 border-t border-slate-100 pt-2 dark:border-slate-800">{currentTimeline?.tasks.map((task) => <li key={task._id} className="text-sm text-slate-600 dark:text-slate-300">{task.title}{task.detail ? " - " + task.detail : ""} <span className="text-xs text-slate-500">({task.status})</span></li>)}</ul></details>}
              <div id="rounds-print-root" className="hidden"><h1>{currentTimeline?.hospitalName || "Hospital"}</h1><h2>{selectedPatient?.name || "Patient"} ({selectedPatient?.uhid || "UHID not recorded"})</h2><p>{selectedPatient?.bedNumber || "Bed not recorded"}  -  {selectedPatient?.wardName || "Ward not recorded"}  -  Admission date: {selectedPatient?.admissionDate ? new Date(selectedPatient.admissionDate).toLocaleDateString() : "Not recorded"}</p>{allRoundCards.map((round) => <RoundCard key={"print-" + round._id} round={round} bedWard={(selectedPatient?.bedNumber || "Bed not recorded") + "  -  " + (selectedPatient?.wardName || "Ward not recorded")} attendingDoctorId={selectedPatient?.doctorId} />)}</div>
              <style>{"@media print { body * { visibility: hidden !important; } #rounds-print-root, #rounds-print-root * { visibility: visible !important; } #rounds-print-root { display: block !important; position: absolute; inset: 0; width: 100%; padding: 24px; color: #111827; background: white; } #rounds-print-root .round-print-card { break-inside: avoid; border-color: #cbd5e1; box-shadow: none; margin: 12px 0; } #rounds-print-root .round-no-print { display: none !important; } }"}</style>
            </CardContent></Card>}
            {tab === "Orders" && <div className="space-y-3">
              <Card className="rounded-xl border-emerald-200 bg-emerald-50/60 shadow-sm dark:border-emerald-900 dark:bg-emerald-950/20"><CardContent className="flex flex-wrap items-center gap-2.5 p-3 sm:p-4"><div className="mr-auto min-w-0"><h3 className="font-semibold text-emerald-950 dark:text-emerald-100">Orders for {cleanRoundDisplayText(selectedPatient.name)} <span className="font-normal">| {plural(activeOrders.length, "medicine", "medicines")} | {plural(activeTasks.length, "instruction", "instructions")}</span></h3><p className="text-xs text-slate-600 dark:text-slate-300">Active orders for this admission</p></div><Button type="button" size="sm" variant="outline" onClick={() => { setTab("Round"); openOrderSection("medicine"); updateDraft({ newRoundOpen: true, medicine: { ...draft.medicine, editSchedule: true } }); window.setTimeout(() => document.getElementById("round-medicine-section")?.scrollIntoView({ behavior: "smooth", block: "center" }), 80); }}><Plus className="mr-1 h-3.5 w-3.5" />Add medicine</Button><Button type="button" size="sm" variant="outline" onClick={() => { setTab("Round"); openOrderSection("instruction"); updateDraft({ newRoundOpen: true }); window.setTimeout(() => document.getElementById("round-instruction-section")?.scrollIntoView({ behavior: "smooth", block: "center" }), 80); }}><Plus className="mr-1 h-3.5 w-3.5" />Add instruction</Button></CardContent></Card>
              {activeOrders.length === 0 && activeTasks.length === 0 && <Card className="rounded-xl border-emerald-200 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-950/20"><CardContent className="flex flex-wrap items-center justify-between gap-3 p-4"><p className="text-sm text-slate-700 dark:text-slate-200">No active orders. Add a medicine or nurse instruction in a round.</p><div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="outline" onClick={() => { setTab("Round"); openOrderSection("medicine"); updateDraft({ newRoundOpen: true, medicine: { ...draft.medicine, editSchedule: true } }); window.setTimeout(() => document.getElementById("round-medicine-section")?.scrollIntoView({ behavior: "smooth", block: "center" }), 80); }}>+ Add medicine</Button><Button type="button" size="sm" variant="outline" onClick={() => { setTab("Round"); openOrderSection("instruction"); updateDraft({ newRoundOpen: true }); window.setTimeout(() => document.getElementById("round-instruction-section")?.scrollIntoView({ behavior: "smooth", block: "center" }), 80); }}>+ Add instruction</Button></div></CardContent></Card>}
              {(activeOrders.length > 0 || activeTasks.length > 0) && <Card className="rounded-xl border-emerald-200 bg-emerald-50/40 shadow-sm dark:border-emerald-900 dark:bg-emerald-950/10"><CardContent className="space-y-2 p-3 sm:p-4"><div className="flex flex-wrap items-center justify-between gap-2"><h4 className="font-semibold text-slate-900 dark:text-white">Medicines</h4><span className="text-xs text-slate-500">{plural(activeOrders.length, "medicine", "medicines")}</span></div>
                {activeOrders.length === 0 && <p className="text-xs text-slate-500">No active medicines.</p>}
                {activeOrders.map((order) => {
                  const orderDoses = (currentTimeline?.medications ?? []).filter((dose) => typeof dose.orderId === "string" ? dose.orderId === order._id : dose.orderId?._id === order._id);
                  const todayDoses = orderDoses.filter((dose) => isToday(dose.scheduledTime, displayTimeZone));
                  const counts = order.doseCounts ?? {};
                  const total = (counts.GIVEN ?? 0) + (counts.PENDING ?? 0) + (counts.WITHHELD ?? 0) + (counts.REFUSED ?? 0);
                  const day = courseDay(order.startDate, displayTimeZone);
                  const doctor = order.prescribedBy?.name?.trim().replace(/^(dr\.?\s*)+/i, "") || "Doctor";
                  return <div key={order._id} className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-emerald-200 bg-white/80 px-3 py-2 dark:border-emerald-900 dark:bg-slate-900/50">
                    <div className="min-w-0 flex-1 basis-56"><p className="break-words text-sm font-semibold text-slate-900 dark:text-white">{order.medicationName}</p><p className="text-xs text-slate-600 dark:text-slate-300">Dose: {order.dosage?.trim() || <span className="text-amber-700 dark:text-amber-300">not set</span>} | {order.route} | {order.frequency}{order.timesOfDay.length ? ` ${order.timesOfDay.join(", ")}` : ""} | Day {day} of {order.durationDays}</p></div>
                    <div className="flex min-w-0 flex-1 basis-64 flex-wrap gap-1">{todayDoses.length ? todayDoses.map((dose) => {
                      const overdue = dose.status === "PENDING" && new Date(dose.scheduledTime).getTime() < Date.now();
                      const label = dose.status === "GIVEN" ? "Given" : dose.status === "WITHHELD" || dose.status === "REFUSED" ? "Withheld" : overdue ? "Missed" : "Pending";
                      const highlighted = label === "Missed" || label === "Withheld";
                      const administeredBy = dose.administeredBy?.name?.trim().replace(/^(dr\.?\s*)+/i, "");
                      return <span key={dose._id} className={`max-w-full rounded-full border px-2 py-0.5 text-[11px] ${highlighted ? "border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200" : "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200"}`} title={`${formatDateTime(dose.scheduledTime, displayTimeZone)}${dose.notes ? ` - ${dose.notes}` : ""}`}><span className="font-medium">{formatClock(dose.scheduledTime, displayTimeZone)} {label}</span>{dose.status === "GIVEN" && ` by ${administeredBy || "Nurse"} at ${formatClock(dose.administeredTime || dose.scheduledTime, displayTimeZone)}`}</span>;
                    }) : <span className="text-xs text-slate-500">No dose scheduled today</span>}</div>
                    <div className="text-xs text-slate-600 dark:text-slate-300">Ordered by Dr. {doctor} on {formatDateTime(order.createdAt, displayTimeZone)} <span className="text-slate-400">| Course {counts.GIVEN ?? 0}/{total} given</span></div>
                    <Badge variant="outline" className="border-emerald-300 text-emerald-800 dark:text-emerald-200">Active</Badge>
                    <Button type="button" variant="outline" size="sm" className="h-7 text-rose-700 dark:text-rose-300" onClick={() => { setStopTarget(order); setStopReason(""); }}><Ban className="mr-1 h-3.5 w-3.5" />Stop</Button>
                  </div>;
                })}
              </CardContent></Card>}
              {(activeOrders.length > 0 || activeTasks.length > 0) && <Card className="rounded-xl border-emerald-200 bg-emerald-50/40 shadow-sm dark:border-emerald-900 dark:bg-emerald-950/10"><CardContent className="space-y-2 p-3 sm:p-4"><div className="flex flex-wrap items-center justify-between gap-2"><h4 className="font-semibold text-slate-900 dark:text-white">Nurse instructions</h4><span className="text-xs text-slate-500">{plural(activeTasks.length, "instruction", "instructions")}</span></div>
                {activeTasks.length === 0 && <p className="text-xs text-slate-500">No active nurse instructions.</p>}
                {activeTasks.map((task) => { const author = task.authorId?.name?.trim().replace(/^(dr\.?\s*)+/i, "") || "Doctor"; return <div key={task._id} className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-emerald-200 bg-white/80 px-3 py-2 dark:border-emerald-900 dark:bg-slate-900/50"><div className="min-w-0 flex-1 basis-56"><p className="break-words text-sm font-semibold text-slate-900 dark:text-white">{task.title}</p>{task.detail && <p className="break-words text-xs text-slate-600 dark:text-slate-300">{task.detail}</p>}<p className="text-xs text-slate-500">Frequency: not set</p></div><Badge variant="outline">{task.priority}</Badge><Badge variant="outline">Pending</Badge><span className="text-xs text-slate-600 dark:text-slate-300">Ordered by Dr. {author} on {formatDateTime(task.createdAt, displayTimeZone)}</span><Button type="button" variant="outline" size="sm" disabled={stoppingTaskId === task._id} className="h-7 text-rose-700 dark:text-rose-300" onClick={() => void stopInstruction(task)}>{stoppingTaskId === task._id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Ban className="mr-1 h-3.5 w-3.5" />Stop</>}</Button></div>; })}
              </CardContent></Card>}
              <details className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"><summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold text-slate-800 dark:text-slate-200">History ({historyCount}) <ChevronDown className="h-4 w-4 text-slate-400" /></summary><div className="space-y-2 border-t border-slate-100 p-3 dark:border-slate-800">{historyOrders.map((order) => <div key={order._id} className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800/50"><span className="font-medium">{order.medicationName}{order.dosage ? ` ${order.dosage}` : " - Dose: not set"}</span><Badge variant="outline">{order.status}</Badge><span className="text-xs text-slate-600 dark:text-slate-300">Ordered {formatDateTime(order.createdAt, displayTimeZone)}</span>{order.discontinuedAt && <span className="text-xs text-slate-600 dark:text-slate-300">Stopped {formatDateTime(order.discontinuedAt, displayTimeZone)} by {order.discontinuedBy?.name?.replace(/^(dr\.?\s*)+/i, "") || "Staff member"}</span>}{order.status === "COMPLETED" && <span className="text-xs text-slate-600 dark:text-slate-300">Finished {formatDateTime(order.updatedAt || order.createdAt, displayTimeZone)}</span>}{order.discontinueReason && <span className="min-w-0 break-words text-xs text-slate-500">Reason: {order.discontinueReason}</span>}</div>)}{historyTasks.map((task) => <div key={task._id} className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800/50"><span className="font-medium">{task.title}</span><Badge variant="outline">{task.status === "COMPLETED" ? "Done" : "Stopped"}</Badge><span className="text-xs text-slate-600 dark:text-slate-300">Ordered {formatDateTime(task.createdAt, displayTimeZone)}</span><span className="text-xs text-slate-600 dark:text-slate-300">{task.status === "COMPLETED" ? `Finished ${formatDateTime(task.completedAt, displayTimeZone)} by ${task.completedBy?.name?.replace(/^(dr\.?\s*)+/i, "") || "Staff member"}` : "Stop date and staff name are not recorded"}</span></div>)}{historyCount === 0 && <p className="text-sm text-slate-500">No order history yet.</p>}</div></details>
            </div>}
          </>}
        </section>
      </div>

      <Dialog open={flagDialogOpen} onOpenChange={(open) => { if (!open && !flagSaving) { setFlagDialogOpen(false); setFlagNotes(""); } }}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>{selectedPatient?.dischargeRequested ? "Withdraw discharge flag" : "Flag for discharge"}</DialogTitle><DialogDescription>{selectedPatient?.dischargeRequested ? "Remove the request before nursing takes over the discharge process. The patient stays admitted." : "Request the nursing team to start the discharge and billing process. The patient remains admitted until the final discharge."}</DialogDescription></DialogHeader>{!selectedPatient?.dischargeRequested && <div className="space-y-1.5"><Label htmlFor="discharge-flag-notes">Note for nursing (optional)</Label><Textarea id="discharge-flag-notes" rows={3} maxLength={1000} value={flagNotes} onChange={(event) => setFlagNotes(event.target.value)} placeholder="Anything nursing or billing should prepare, e.g. pending observation" /></div>}<DialogFooter><Button type="button" variant="outline" disabled={flagSaving} onClick={() => setFlagDialogOpen(false)}>Cancel</Button>{selectedPatient?.dischargeRequested ? <Button type="button" disabled={flagSaving} onClick={() => void withdrawDischargeFlag()} className="bg-amber-600 text-white hover:bg-amber-700">{flagSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <><DoorOpen className="mr-2 h-4 w-4" />Withdraw flag</>}</Button> : <Button type="button" disabled={flagSaving} onClick={() => void confirmFlagDischarge()} className="bg-emerald-600 text-white hover:bg-emerald-700">{flagSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <><DoorOpen className="mr-2 h-4 w-4" />Flag for discharge</>}</Button>}</DialogFooter></DialogContent></Dialog>
      <Dialog open={Boolean(stopTarget)} onOpenChange={(open) => { if (!open && !stopping) { setStopTarget(null); setStopReason(""); } }}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>Stop medication order</DialogTitle><DialogDescription>{stopTarget ? `Stop ${stopTarget.medicationName} and cancel its future pending doses?` : ""}</DialogDescription></DialogHeader><div className="space-y-1.5"><Label htmlFor="stop-reason">Reason</Label><Textarea id="stop-reason" rows={3} value={stopReason} onChange={(event) => setStopReason(event.target.value)} placeholder="Record why this order is being stopped" /></div><DialogFooter><Button type="button" variant="outline" onClick={() => setStopTarget(null)} disabled={stopping}>Cancel</Button><Button type="button" disabled={stopping || !stopReason.trim()} onClick={() => void confirmStopOrder()} className="bg-rose-600 text-white hover:bg-rose-700">{stopping ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Ban className="mr-2 h-4 w-4" />}Stop order</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={Boolean(addendumTarget)} onOpenChange={(open) => { if (!open && !addendumSaving) { setAddendumTarget(null); setAddendumText(""); } }}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>Add to round note</DialogTitle><DialogDescription>Saved rounds are unchanged; this will be appended as a timestamped addendum.</DialogDescription></DialogHeader><div className="space-y-1.5"><Label htmlFor="round-addendum">Addendum</Label><Textarea id="round-addendum" rows={4} maxLength={4000} value={addendumText} onChange={(event) => setAddendumText(event.target.value)} placeholder="Add a correction or later observation" /></div><DialogFooter><Button type="button" variant="outline" disabled={addendumSaving} onClick={() => setAddendumTarget(null)}>Cancel</Button><Button type="button" disabled={addendumSaving || !addendumText.trim()} onClick={() => void saveAddendum()} className="bg-emerald-600 text-white hover:bg-emerald-700">{addendumSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FilePlus2 className="mr-2 h-4 w-4" />}Append addendum</Button></DialogFooter></DialogContent></Dialog>
    </main>
  );
}
