"use client";

import { FormEvent, Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FileText, Loader2, Plus, Printer, Save, Search, PackagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";

type RecordForm = {
  bloodPressure: string;
  pulse: string;
  temperature: string;
  respiratoryRate: string;
  oxygenSaturation: string;
  observations: string;
};

type DailyRecord = {
  _id: string;
  nursingDay: number;
  status: string;
  recordDate: string;
  author?: { name?: string };
  vitals?: Record<string, string | number | undefined>;
  observations?: string;
  procedures?: string;
  medicationAdministration?: string;
  progress?: string;
  additionalNotes?: string;
};

type MedicalSupply = {
  _id: string;
  nursingDay: number;
  category: string;
  itemName: string;
  quantity: number;
  notes?: string;
  recordedAt: string;
  author?: { name?: string };
};

type AssignedPatient = {
  admissionId: string;
  patientId: string;
  name: string;
  uhid: string;
  bedNumber: string | number;
};

const supplyCategories = [
  "Medicines",
  "Medical Consumables",
  "Equipment Usage / Rental",
  "Other Medical Supplies",
] as const;

const blank: RecordForm = {
  bloodPressure: "",
  pulse: "",
  temperature: "",
  respiratoryRate: "",
  oxygenSaturation: "",
  observations: "",
};

const vitalFields: [keyof RecordForm, string][] = [
  ["bloodPressure", "Blood pressure"],
  ["pulse", "Pulse"],
  ["temperature", "Temperature"],
  ["respiratoryRate", "Resp. rate"],
  ["oxygenSaturation", "Oxygen saturation"],
];

const recordSections: [keyof Pick<DailyRecord, "observations" | "procedures" | "medicationAdministration" | "progress" | "additionalNotes">, string][] = [
  ["observations", "Observations"],
  ["procedures", "Care provided"],
  ["medicationAdministration", "Medication administration"],
  ["progress", "Progress"],
  ["additionalNotes", "Notes"],
];

export default function NursingNotesPage() {
  return (
    <Suspense fallback={<div className="flex h-80 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin" /></div>}>
      <DailyNursingRecords />
    </Suspense>
  );
}

function DailyNursingRecords() {
  const router = useRouter();
  const params = useSearchParams();
  const admissionId = params.get("admissionId") || "";
  const patientId = params.get("patientId") || "";
  const { toast } = useToast();
  const [assignedPatients, setAssignedPatients] = useState<AssignedPatient[]>([]);
  const [patientsLoading, setPatientsLoading] = useState(true);
  const [patientSearch, setPatientSearch] = useState("");
  const [records, setRecords] = useState<DailyRecord[]>([]);
  const [visibleRecordDays, setVisibleRecordDays] = useState<{ admissionId: string; days: number[] } | null>(null);
  const [recordDaySelection, setRecordDaySelection] = useState<{ admissionId: string; day: number } | null>(null);
  const [supplies, setSupplies] = useState<MedicalSupply[]>([]);
  const [currentSupplyDayInfo, setCurrentSupplyDayInfo] = useState<{ admissionId: string; day: number } | null>(null);
  const [visibleSupplyDays, setVisibleSupplyDays] = useState<{ admissionId: string; days: number[] } | null>(null);
  const [daySelection, setDaySelection] = useState<{ admissionId: string; tab: "supplies" } | null>(null);
  const [supplyDaySelection, setSupplyDaySelection] = useState<{ admissionId: string; day: number } | null>(null);
  const [supplyCategory, setSupplyCategory] = useState<(typeof supplyCategories)[number]>("Medicines");
  const [supplyName, setSupplyName] = useState("");
  const [supplyQuantity, setSupplyQuantity] = useState("1");
  const [supplyNotes, setSupplyNotes] = useState("");
  const [suppliesLoading, setSuppliesLoading] = useState(false);
  const [supplySaving, setSupplySaving] = useState(false);
  const [form, setForm] = useState<RecordForm>(blank);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const currentSupplyDay = currentSupplyDayInfo?.admissionId === admissionId ? currentSupplyDayInfo.day : 0;

  const loadRecords = useCallback(async () => {
    if (!admissionId || !patientId) {
      setRecords([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setRecords([]);
    try {
      const response = await fetch(
        `/api/nursing/daily-records?admissionId=${encodeURIComponent(admissionId)}&patientId=${encodeURIComponent(patientId)}`
      );
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.message || "Unable to load daily records");
      }
      const loadedRecords = result.data as DailyRecord[];
      setRecords(loadedRecords);
      const lastRecordedDay = Math.max(0, ...loadedRecords.map((record) => record.nursingDay));
      setVisibleRecordDays((current) => {
        const existingDayCount = current?.admissionId === admissionId ? current.days.length : 0;
        const dayCount = Math.max(1, existingDayCount, currentSupplyDay - 1, lastRecordedDay);
        return { admissionId, days: Array.from({ length: dayCount }, (_, index) => index + 1) };
      });
    } catch (error) {
      toast(error instanceof Error ? error.message : "Unable to load daily records", "error");
    } finally {
      setLoading(false);
    }
  }, [admissionId, currentSupplyDay, patientId, toast]);

  const loadSupplies = useCallback(async () => {
    if (!admissionId || !patientId) {
      setSupplies([]);
      setCurrentSupplyDayInfo(null);
      setSuppliesLoading(false);
      return;
    }

    setSuppliesLoading(true);
    setSupplies([]);
    try {
      const response = await fetch(
        `/api/nursing/medical-supplies?admissionId=${encodeURIComponent(admissionId)}&patientId=${encodeURIComponent(patientId)}`
      );
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.message || "Unable to load medical supplies");
      }
      const data = result.data as { records: MedicalSupply[]; currentDay: number };
      setSupplies(data.records || []);
      setCurrentSupplyDayInfo({ admissionId, day: data.currentDay || 0 });
      const lastRecordedDay = Math.max(0, ...(data.records || []).map((record) => record.nursingDay));
      setVisibleSupplyDays((current) => {
        const existingDayCount = current?.admissionId === admissionId ? current.days.length : 0;
        const dayCount = Math.min(7, Math.max(1, existingDayCount, data.currentDay - 1, lastRecordedDay));
        return { admissionId, days: Array.from({ length: dayCount }, (_, index) => index + 1) };
      });
      setSupplyDaySelection((current) =>
        current?.admissionId === admissionId
          ? current
          : data.currentDay > 0
            ? { admissionId, day: Math.max(1, lastRecordedDay || data.currentDay - 1) }
            : null
      );
    } catch (error) {
      toast(error instanceof Error ? error.message : "Unable to load medical supplies", "error");
    } finally {
      setSuppliesLoading(false);
    }
  }, [admissionId, patientId, toast]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadRecords(), 0);
    return () => window.clearTimeout(timer);
  }, [loadRecords]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadSupplies(), 0);
    return () => window.clearTimeout(timer);
  }, [loadSupplies]);

  useEffect(() => {
    if (!admissionId || !patientId) return;

    const timer = window.setInterval(() => void loadSupplies(), 5 * 60 * 1000);
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void loadSupplies();
    };
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [admissionId, patientId, loadSupplies]);

  useEffect(() => {
    let active = true;
    const loadAssignedPatients = async () => {
      try {
        const response = await fetch("/api/nursing/my-patients");
        const result = await response.json();
        if (!response.ok || !result.success) {
          throw new Error(result.message || "Unable to load assigned patients");
        }
        if (active) setAssignedPatients(result.data || []);
      } catch (error) {
        if (active) toast(error instanceof Error ? error.message : "Unable to load assigned patients", "error");
      } finally {
        if (active) setPatientsLoading(false);
      }
    };

    void loadAssignedPatients();
    return () => {
      active = false;
    };
  }, [toast]);

  const setField = (key: keyof RecordForm, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const choosePatient = (selectedAdmissionId: string) => {
    const patient = assignedPatients.find((item) => item.admissionId === selectedAdmissionId);
    if (!patient) {
      setPatientSearch("");
      router.push("/nursing/notes");
      return;
    }
    setPatientSearch("");
    router.push(`/nursing/notes?patientId=${encodeURIComponent(patient.patientId)}&admissionId=${encodeURIComponent(patient.admissionId)}`);
  };

  const submit = async (event: FormEvent | undefined, status: "Draft" | "Final") => {
    event?.preventDefault();
    if (!admissionId || !patientId || !activeRecordDay) {
      toast("Select an assigned patient and hospital day before saving a daily record", "error");
      return;
    }
    if (activeRecordDay !== currentSupplyDay) {
      toast("You can add nursing records only for the current hospital day", "error");
      return;
    }

    const numeric = (value: string) => value.trim() === "" ? undefined : Number(value);
    setSaving(true);
    try {
      const response = await fetch("/api/nursing/daily-records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          admissionId,
          patientId,
          status,
          nursingDay: activeRecordDay,
          vitals: {
            bloodPressure: form.bloodPressure || undefined,
            pulse: numeric(form.pulse),
            temperature: numeric(form.temperature),
            respiratoryRate: numeric(form.respiratoryRate),
            oxygenSaturation: numeric(form.oxygenSaturation),
          },
          observations: form.observations,
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.message || "Unable to save daily record");
      }
      toast(status === "Final" ? "Daily record finalized" : "Daily record saved as draft", "success");
      setForm(blank);
      await loadRecords();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Unable to save daily record", "error");
    } finally {
      setSaving(false);
    }
  };

  const submitSupply = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!admissionId || !patientId || !activeSupplyDay) {
      toast("Choose an assigned patient and hospital day before adding supplies", "error");
      return;
    }
    if (activeSupplyDay !== currentSupplyDay) {
      toast("You can add medical supplies only for the current hospital day", "error");
      return;
    }

    setSupplySaving(true);
    try {
      const response = await fetch("/api/nursing/medical-supplies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          admissionId,
          patientId,
          nursingDay: activeSupplyDay,
          category: supplyCategory,
          itemName: supplyName.trim(),
          quantity: Number(supplyQuantity),
          notes: supplyNotes.trim(),
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.message || "Unable to save medical supply");
      }
      toast("Medical supply added", "success");
      setSupplyName("");
      setSupplyQuantity("1");
      setSupplyNotes("");
      await loadSupplies();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Unable to save medical supply", "error");
    } finally {
      setSupplySaving(false);
    }
  };

  const selectedPatient = assignedPatients.find((patient) => patient.admissionId === admissionId);
  const activeTab = daySelection?.admissionId === admissionId ? daySelection.tab : "new";
  const recordDays = visibleRecordDays?.admissionId === admissionId ? visibleRecordDays.days : [];
  const activeRecordDay = recordDaySelection?.admissionId === admissionId
    ? recordDaySelection.day
    : recordDays.at(-1) ?? null;
  const activeDayRecords = activeRecordDay === null
    ? []
    : records.filter((record) => record.nursingDay === activeRecordDay);
  const canRecordActiveDay =
    currentSupplyDay > 0 &&
    activeRecordDay === currentSupplyDay;
  const nextRecordDay = (recordDays.at(-1) ?? 0) + 1;
  const availableSupplyDays = visibleSupplyDays?.admissionId === admissionId ? visibleSupplyDays.days : [];
  const activeSupplyDay = supplyDaySelection?.admissionId === admissionId
    ? supplyDaySelection.day
    : availableSupplyDays.at(-1) ?? null;
  const nextSupplyDay = (availableSupplyDays.at(-1) ?? 0) + 1;
  const filteredAssignedPatients = assignedPatients.filter((patient) =>
    `${patient.name} ${patient.uhid} ${patient.bedNumber}`
      .toLowerCase()
      .includes(patientSearch.trim().toLowerCase())
  );

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <FileText className="h-6 w-6 text-cyan-600" />
            Daily Nursing Records
          </h1>
          <p className="text-sm text-slate-500">Structured, server-authorized records for active admissions.</p>
        </div>
        <Button variant="outline" onClick={() => window.print()} disabled={!admissionId || loading}>
          <Printer className="mr-2 h-4 w-4" />
          Print / Save PDF
        </Button>
      </div>

      <Card className="print:hidden">
        {!selectedPatient && (
          <CardHeader>
            <CardTitle className="text-base">Select an assigned patient</CardTitle>
            <CardDescription>Only your active assigned inpatients are available.</CardDescription>
          </CardHeader>
        )}
        <CardContent>
          {patientsLoading ? (
            <div className="flex items-center gap-2 py-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading assigned patients...
            </div>
          ) : assignedPatients.length === 0 ? (
            <p className="text-sm text-slate-500">No active patients are currently assigned to you.</p>
          ) : selectedPatient ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-medium text-slate-900 dark:text-white">{selectedPatient.name}</p>
                <p className="text-xs text-slate-500">
                  Bed {selectedPatient.bedNumber} · {selectedPatient.uhid}
                </p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => choosePatient("")}>
                Change patient
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <Input
                  type="search"
                  aria-label="Search assigned patients by name"
                  placeholder="Search assigned patients by name..."
                  value={patientSearch}
                  onChange={(event) => setPatientSearch(event.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="max-h-64 space-y-2 overflow-y-auto" aria-label="Assigned patients">
                {filteredAssignedPatients.length === 0 ? (
                  <p className="py-3 text-center text-sm text-slate-500">
                    No assigned patients match that search.
                  </p>
                ) : (
                  filteredAssignedPatients.map((patient) => (
                    <button
                      key={patient.admissionId}
                      type="button"
                      onClick={() => choosePatient(patient.admissionId)}
                      className="flex w-full items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-left text-sm transition hover:border-cyan-300 hover:bg-cyan-50 dark:border-slate-800 dark:hover:bg-cyan-950/30"
                    >
                      <span className="font-medium text-slate-900 dark:text-white">{patient.name}</span>
                      <span className="text-xs text-slate-500">
                        Bed {patient.bedNumber} · {patient.uhid}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {selectedPatient && (
        <div className="space-y-4">
          <div className="print:hidden overflow-x-auto">
            <div
              className="flex min-w-max gap-2 border-b border-slate-200 dark:border-slate-800"
              role="tablist"
              aria-label="Daily nursing record days"
              onKeyDown={(event) => {
                const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
                const currentIndex = event.target instanceof HTMLButtonElement ? tabs.indexOf(event.target) : -1;
                if (currentIndex < 0) return;

                const nextIndex = event.key === "ArrowRight"
                  ? (currentIndex + 1) % tabs.length
                  : event.key === "ArrowLeft"
                    ? (currentIndex - 1 + tabs.length) % tabs.length
                    : event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? tabs.length - 1
                        : -1;
                if (nextIndex < 0) return;

                event.preventDefault();
                if (nextIndex === 0) {
                  setDaySelection(null);
                } else {
                  setDaySelection({ admissionId, tab: "supplies" });
                }
                tabs[nextIndex].focus();
              }}
            >
              <button
                id="nursing-record-new-tab"
                data-tab="new"
                type="button"
                role="tab"
                aria-selected={activeTab === "new"}
                aria-controls="nursing-record-new-panel"
                tabIndex={activeTab === "new" ? 0 : -1}
                onClick={() => setDaySelection(null)}
                className={`border-b-2 px-4 py-2 text-sm font-medium transition ${
                  activeTab === "new"
                    ? "border-cyan-600 text-cyan-700 dark:text-cyan-300"
                    : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                }`}
              >
                New daily record
              </button>
              <button
                id="nursing-record-supplies-tab"
                data-tab="supplies"
                type="button"
                role="tab"
                aria-selected={activeTab === "supplies"}
                aria-controls="nursing-record-supplies-panel"
                tabIndex={activeTab === "supplies" ? 0 : -1}
                onClick={() => setDaySelection({ admissionId, tab: "supplies" })}
                className={`border-b-2 px-4 py-2 text-sm font-medium transition ${
                  activeTab === "supplies"
                    ? "border-cyan-600 text-cyan-700 dark:text-cyan-300"
                    : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                }`}
              >
                Medical Supplies
              </button>
            </div>
          </div>

          {activeTab === "new" && (
            <div
              id="nursing-record-new-panel"
              role="tabpanel"
              aria-labelledby="nursing-record-new-tab"
              tabIndex={0}
            >
              <div className="mb-4 flex flex-wrap items-center gap-2 print:hidden" role="tablist" aria-label="Daily nursing record days">
                {recordDays.map((day) => (
                  <button
                    key={day}
                    type="button"
                    role="tab"
                    aria-selected={activeRecordDay === day}
                    aria-controls="nursing-record-day-panel"
                    onClick={() => {
                      setForm(blank);
                      setRecordDaySelection({ admissionId, day });
                    }}
                    className={`rounded-md border px-3 py-1.5 text-sm transition ${
                      activeRecordDay === day
                        ? "border-cyan-600 bg-cyan-600 text-white"
                        : "border-slate-200 text-slate-700 hover:border-cyan-400 dark:border-slate-700 dark:text-slate-200"
                    }`}
                  >
                    Day {day}
                  </button>
                ))}
                {nextRecordDay <= currentSupplyDay && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={saving || loading || suppliesLoading}
                    onClick={() => {
                      setVisibleRecordDays((current) => {
                        const days = current?.admissionId === admissionId ? current.days : [1];
                        return days.includes(nextRecordDay)
                          ? current
                          : { admissionId, days: [...days, nextRecordDay] };
                      });
                      setRecordDaySelection({ admissionId, day: nextRecordDay });
                      setForm(blank);
                    }}
                  >
                    <Plus className="mr-1 h-4 w-4" />
                    Add Day
                  </Button>
                )}
              </div>

              {loading ? (
                <Card className="print:hidden">
                  <CardContent className="flex items-center justify-center gap-2 py-8 text-sm text-slate-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Checking this day&apos;s records...
                  </CardContent>
                </Card>
              ) : !currentSupplyDayInfo || currentSupplyDayInfo.admissionId !== admissionId ? (
                <Card className="print:hidden">
                  <CardContent className="flex items-center justify-center gap-2 py-8 text-sm text-slate-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Checking the current hospital day...
                  </CardContent>
                </Card>
              ) : !canRecordActiveDay ? (
                <Card className="print:hidden border-emerald-200 dark:border-emerald-900">
                  <CardContent className="py-5 text-sm text-emerald-800 dark:text-emerald-200">
                    Earlier hospital days are read-only. The saved notes for this day are shown below.
                  </CardContent>
                </Card>
              ) : (
                <Card className="print:hidden overflow-hidden">
                  <CardHeader className="border-b bg-slate-50/70 pb-4 dark:bg-slate-900/40">
                    <CardTitle className="text-base">New daily record — Day {activeRecordDay}</CardTitle>
                    <CardDescription>
                      Add a nursing note for this day. You can save multiple entries; the author and time are recorded automatically.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-5">
                  <form className="space-y-5" onSubmit={(event) => void submit(event, "Draft")}>
                    <section className="space-y-3">
                      <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Vitals</h3>
                      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                        {vitalFields.map(([key, label]) => (
                          <div key={key}>
                            <Label htmlFor={`daily-${key}`}>{label}</Label>
                            <Input
                              id={`daily-${key}`}
                              className="mt-1"
                              value={form[key]}
                              onChange={(event) => setField(key, event.target.value)}
                            />
                          </div>
                        ))}
                      </div>
                    </section>
                    <section className="space-y-3 border-t pt-4">
                      <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Care notes</h3>
                      <div>
                        <Label htmlFor="daily-observations">Observations &amp; condition</Label>
                        <Textarea
                          id="daily-observations"
                          className="mt-1.5 min-h-20"
                          value={form.observations}
                          onChange={(event) => setField("observations", event.target.value)}
                          rows={2}
                        />
                      </div>
                    </section>
                    <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
                      <Button type="submit" variant="outline" disabled={saving}>
                        <Save className="mr-2 h-4 w-4" />
                        Save draft
                      </Button>
                      <Button type="button" disabled={saving} onClick={() => void submit(undefined, "Final")}>
                        <Plus className="mr-2 h-4 w-4" />
                        Finalize
                      </Button>
                    </div>
                  </form>
                  </CardContent>
                </Card>
              )}

              <section id="nursing-record-day-panel" role="tabpanel" className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-semibold">Day {activeRecordDay} notes</h2>
                  <span className="text-xs text-slate-500">
                    {loading ? "Loading..." : `${activeDayRecords.length} ${activeDayRecords.length === 1 ? "entry" : "entries"}`}
                  </span>
                </div>
                {loading ? (
                  <div className="flex h-24 items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-cyan-600" />
                  </div>
                ) : activeDayRecords.length === 0 ? (
                  <Card>
                    <CardContent className="py-8 text-center text-sm text-slate-500">
                      No notes recorded for this day yet.
                    </CardContent>
                  </Card>
                ) : (
                  activeDayRecords.map((record) => (
                    <Card key={record._id} className="break-inside-avoid">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base">
                          Day {record.nursingDay}
                          <span className="ml-2 text-xs font-normal text-slate-500">
                            {record.status} · {new Date(record.recordDate).toLocaleString()}
                          </span>
                        </CardTitle>
                        <CardDescription>Recorded by {record.author?.name || "Nurse"}</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3 text-sm">
                        <p>
                          <b>Vitals:</b> BP {record.vitals?.bloodPressure || "—"}; Pulse {record.vitals?.pulse ?? "—"}; Temp {record.vitals?.temperature ?? "—"}; RR {record.vitals?.respiratoryRate ?? "—"}; SpO₂ {record.vitals?.oxygenSaturation ?? "—"}
                        </p>
                        {recordSections.map(([key, label]) => record[key] ? (
                          <div key={key}>
                            <b>{label}</b>
                            <p className="whitespace-pre-wrap text-slate-600">{record[key]}</p>
                          </div>
                        ) : null)}
                      </CardContent>
                    </Card>
                  ))
                )}
              </section>
            </div>
          )}

          {activeTab === "supplies" && (
            <section
              id="nursing-record-supplies-panel"
              role="tabpanel"
              aria-labelledby="nursing-record-supplies-tab"
              tabIndex={0}
              className="space-y-4"
            >
              <Card className="print:hidden">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <PackagePlus className="h-4 w-4 text-cyan-600" />
                    Medical Supplies
                  </CardTitle>
                  <CardDescription>
                    Log medicines, consumables, equipment use or rental, and other supplies for this patient.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {suppliesLoading ? (
                    <div className="flex items-center gap-2 py-2 text-sm text-slate-500">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading supply records...
                    </div>
                  ) : currentSupplyDay === 0 ? (
                    <p className="text-sm text-slate-500">Hospital day information is not available.</p>
                  ) : (
                    <>
                      <div className="mb-5 flex flex-wrap items-center gap-2" role="tablist" aria-label="Medical supply hospital days">
                        {availableSupplyDays.map((day) => (
                          <button
                            key={day}
                            type="button"
                            role="tab"
                            aria-selected={activeSupplyDay === day}
                            aria-controls="medical-supplies-day-panel"
                            onClick={() => setSupplyDaySelection({ admissionId, day })}
                            className={`rounded-md border px-3 py-1.5 text-sm transition ${
                              activeSupplyDay === day
                                ? "border-cyan-600 bg-cyan-600 text-white"
                                : "border-slate-200 text-slate-700 hover:border-cyan-400 dark:border-slate-700 dark:text-slate-200"
                            }`}
                          >
                            Day {day}
                          </button>
                        ))}
                        {nextSupplyDay <= currentSupplyDay && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={suppliesLoading}
                            onClick={() => {
                              setVisibleSupplyDays((current) => {
                                const days = current?.admissionId === admissionId ? current.days : [1];
                                return days.includes(nextSupplyDay)
                                  ? current
                                  : { admissionId, days: [...days, nextSupplyDay] };
                              });
                              setSupplyDaySelection({ admissionId, day: nextSupplyDay });
                            }}
                          >
                            <Plus className="mr-1 h-4 w-4" />
                            Add Day
                          </Button>
                        )}
                      </div>

                      {activeSupplyDay && (
                        <div id="medical-supplies-day-panel" role="tabpanel" className="space-y-5">
                          {activeSupplyDay === currentSupplyDay ? (
                          <form onSubmit={(event) => void submitSupply(event)} className="grid gap-4 md:grid-cols-2">
                            <div>
                              <Label htmlFor="supply-category">Supply category</Label>
                              <select
                                id="supply-category"
                                value={supplyCategory}
                                onChange={(event) => setSupplyCategory(event.target.value as (typeof supplyCategories)[number])}
                                className="mt-1.5 flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
                              >
                                {supplyCategories.map((category) => (
                                  <option key={category} value={category}>{category}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <Label htmlFor="supply-name">Item name</Label>
                              <Input
                                id="supply-name"
                                value={supplyName}
                                onChange={(event) => setSupplyName(event.target.value)}
                                maxLength={200}
                                required
                                className="mt-1.5"
                                placeholder="Enter medicine or supply name"
                              />
                            </div>
                            <div>
                              <Label htmlFor="supply-quantity">Quantity</Label>
                              <Input
                                id="supply-quantity"
                                type="number"
                                min="0.01"
                                max="100000"
                                step="any"
                                value={supplyQuantity}
                                onChange={(event) => setSupplyQuantity(event.target.value)}
                                required
                                className="mt-1.5"
                              />
                            </div>
                            <div>
                              <Label htmlFor="supply-notes">Notes / usage details</Label>
                              <Textarea
                                id="supply-notes"
                                value={supplyNotes}
                                onChange={(event) => setSupplyNotes(event.target.value)}
                                maxLength={2000}
                                rows={2}
                                className="mt-1.5"
                                placeholder="Optional details"
                              />
                            </div>
                            <div className="md:col-span-2 flex justify-end">
                              <Button type="submit" disabled={supplySaving}>
                                {supplySaving ? (
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                  <Plus className="mr-2 h-4 w-4" />
                                )}
                                Add to Day {activeSupplyDay}
                              </Button>
                            </div>
                          </form>
                          ) : (
                            <Card className="border-emerald-200 dark:border-emerald-900">
                              <CardContent className="py-4 text-sm text-emerald-800 dark:text-emerald-200">
                                Earlier hospital days are read-only. The saved supplies for this day are shown below.
                              </CardContent>
                            </Card>
                          )}

                          <div className="space-y-3 border-t pt-4">
                            <div className="flex items-center justify-between">
                              <h3 className="text-sm font-semibold">Day {activeSupplyDay} supplies</h3>
                              <span className="text-xs text-slate-500">
                                {supplies.filter((item) => item.nursingDay === activeSupplyDay).length} items
                              </span>
                            </div>
                            {supplies.filter((item) => item.nursingDay === activeSupplyDay).length === 0 ? (
                              <p className="rounded-lg border border-dashed p-6 text-center text-sm text-slate-500">
                                No supplies recorded for this day.
                              </p>
                            ) : (
                              <div className="space-y-2">
                                {supplies.filter((item) => item.nursingDay === activeSupplyDay).map((item) => (
                                  <div key={item._id} className="flex flex-wrap items-start justify-between gap-3 rounded-lg border p-3">
                                    <div>
                                      <p className="text-sm font-medium">{item.itemName}</p>
                                      <p className="text-xs text-slate-500">
                                        {item.category} · Quantity: {item.quantity}
                                      </p>
                                      {item.notes && <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-300">{item.notes}</p>}
                                    </div>
                                    <p className="text-xs text-slate-500">
                                      {item.author?.name || "Nurse"} · {new Date(item.recordedAt).toLocaleString()}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            </section>
          )}

        </div>
      )}
    </div>
  );
}
