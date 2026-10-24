"use client";

import { FormEvent, Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FileText, Loader2, Plus, Printer, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";

type RecordForm = {
  bloodPressure: string;
  pulse: string;
  temperature: string;
  respiratoryRate: string;
  oxygenSaturation: string;
  observations: string;
  procedures: string;
  medicationAdministration: string;
  progress: string;
  additionalNotes: string;
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

type AssignedPatient = {
  admissionId: string;
  patientId: string;
  name: string;
  uhid: string;
  bedNumber: string | number;
};

const blank: RecordForm = {
  bloodPressure: "",
  pulse: "",
  temperature: "",
  respiratoryRate: "",
  oxygenSaturation: "",
  observations: "",
  procedures: "",
  medicationAdministration: "",
  progress: "",
  additionalNotes: "",
};

const vitalFields: [keyof RecordForm, string][] = [
  ["bloodPressure", "Blood pressure"],
  ["pulse", "Pulse"],
  ["temperature", "Temperature"],
  ["respiratoryRate", "Resp. rate"],
  ["oxygenSaturation", "Oxygen saturation"],
];

const noteFields: [keyof RecordForm, string][] = [
  ["observations", "Observations & condition"],
  ["procedures", "Care / procedures performed"],
  ["medicationAdministration", "Medication administration"],
  ["progress", "Progress & treatment response"],
  ["additionalNotes", "Additional notes"],
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
  const [records, setRecords] = useState<DailyRecord[]>([]);
  const [form, setForm] = useState<RecordForm>(blank);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadRecords = useCallback(async () => {
    if (!admissionId || !patientId) {
      setRecords([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(
        `/api/nursing/daily-records?admissionId=${encodeURIComponent(admissionId)}&patientId=${encodeURIComponent(patientId)}`
      );
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.message || "Unable to load daily records");
      }
      setRecords(result.data || []);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Unable to load daily records", "error");
    } finally {
      setLoading(false);
    }
  }, [admissionId, patientId, toast]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadRecords(), 0);
    return () => window.clearTimeout(timer);
  }, [loadRecords]);

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
      router.push("/nursing/notes");
      return;
    }
    router.push(`/nursing/notes?patientId=${encodeURIComponent(patient.patientId)}&admissionId=${encodeURIComponent(patient.admissionId)}`);
  };

  const submit = async (event: FormEvent | undefined, status: "Draft" | "Final") => {
    event?.preventDefault();
    if (!admissionId || !patientId) {
      toast("Select an assigned patient before saving a daily record", "error");
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
          vitals: {
            bloodPressure: form.bloodPressure || undefined,
            pulse: numeric(form.pulse),
            temperature: numeric(form.temperature),
            respiratoryRate: numeric(form.respiratoryRate),
            oxygenSaturation: numeric(form.oxygenSaturation),
          },
          observations: form.observations,
          procedures: form.procedures,
          medicationAdministration: form.medicationAdministration,
          progress: form.progress,
          additionalNotes: form.additionalNotes,
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

  const selectedPatient = assignedPatients.find((patient) => patient.admissionId === admissionId);

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
        <CardHeader>
          <CardTitle className="text-base">Select an assigned patient</CardTitle>
          <CardDescription>Only your active assigned inpatients are available.</CardDescription>
        </CardHeader>
        <CardContent>
          {patientsLoading ? (
            <div className="flex items-center gap-2 py-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading assigned patients...
            </div>
          ) : assignedPatients.length === 0 ? (
            <p className="text-sm text-slate-500">No active patients are currently assigned to you.</p>
          ) : (
            <Select
              aria-label="Select an assigned patient"
              value={selectedPatient ? admissionId : ""}
              onChange={(event) => choosePatient(event.target.value)}
            >
              <option value="">Select a patient...</option>
              {assignedPatients.map((patient) => (
                <option key={patient.admissionId} value={patient.admissionId}>
                  Bed {patient.bedNumber} — {patient.name} ({patient.uhid})
                </option>
              ))}
            </Select>
          )}
        </CardContent>
      </Card>

      {selectedPatient && (
        <Card className="print:hidden">
          <CardHeader>
            <CardTitle className="text-base">Add daily record</CardTitle>
            <CardDescription>
              Bed {selectedPatient.bedNumber} — {selectedPatient.name} ({selectedPatient.uhid}). The hospital day and author are derived on the server.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={(event) => void submit(event, "Draft")}>
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
              {noteFields.map(([key, label]) => (
                <div key={key}>
                  <Label htmlFor={`daily-${key}`}>{label}</Label>
                  <Textarea
                    id={`daily-${key}`}
                    className="mt-1"
                    value={form[key]}
                    onChange={(event) => setField(key, event.target.value)}
                    rows={3}
                  />
                </div>
              ))}
              <div className="flex gap-2">
                <Button type="submit" disabled={saving}>
                  <Save className="mr-2 h-4 w-4" />
                  Save draft
                </Button>
                <Button type="button" variant="outline" disabled={saving} onClick={() => void submit(undefined, "Final")}>
                  <Plus className="mr-2 h-4 w-4" />
                  Finalize
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {selectedPatient && (
        <section id="daily-records-print-root" className="space-y-3">
          <h2 className="text-lg font-semibold">Saved records</h2>
          {loading ? (
            <div className="flex h-32 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-cyan-600" />
            </div>
          ) : records.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-slate-500">
                No daily records have been saved for this admission.
              </CardContent>
            </Card>
          ) : (
            records.map((record) => (
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
      )}
    </div>
  );
}
