"use client";

import React from "react";
import { ClipboardList, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface PatientSummary {
  _id: string;
  name?: string;
  uhid?: string;
  contact?: string;
  age?: number;
  gender?: string;
  bloodGroup?: string;
  email?: string;
  address?: string;
  emergencyContact?: string;
  dateOfBirth?: string;
  maritalStatus?: string;
  guardianName?: string;
  guardianRelation?: string;
  allergies?: string[];
  medicalHistory?: string[];
}

interface CompletedAppointment {
  _id: string;
  tokenNumber?: string | number;
  appointmentDate?: string;
  appointmentTime?: string;
  consultationEndedAt?: string;
  status?: string;
  queueStatus?: string;
  patientId?: PatientSummary;
}

interface ClinicalRecord {
  chiefComplaint?: string;
  historyOfPresentIllness?: string;
  objectiveFindings?: string;
  assessment?: string;
  plan?: string;
  details?: string;
  instructions?: string;
  followUpDate?: string;
}

interface Prescription {
  symptoms?: string;
  diagnosis?: string;
  notes?: string;
  followUpDate?: string;
  medications?: Array<{ name?: string; dosage?: string; frequency?: string; duration?: string; instructions?: string }>;
}

interface VisitDetails {
  appointment: CompletedAppointment;
  clinicalRecord: ClinicalRecord | null;
  prescription: Prescription | null;
}

function display(value?: string | number | null): string {
  return value === undefined || value === null || value === "" ? "Not recorded" : String(value);
}

function dateTime(value?: string): string {
  if (!value) return "Not recorded";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "Not recorded" : new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(parsed);
}

function DetailField({ label, value }: { label: string; value?: string | number | null }) {
  return <div><p className="text-xs font-medium text-slate-500">{label}</p><p className="mt-1 whitespace-pre-wrap text-sm text-slate-900 dark:text-slate-100">{display(value)}</p></div>;
}

export default function CompletedTodayPage() {
  const [appointments, setAppointments] = React.useState<CompletedAppointment[]>([]);
  const [count, setCount] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [selectedId, setSelectedId] = React.useState("");
  const [details, setDetails] = React.useState<VisitDetails | null>(null);
  const [detailLoading, setDetailLoading] = React.useState(false);
  const [detailError, setDetailError] = React.useState("");

  const loadAppointments = React.useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/appointments/completed-today");
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || "Unable to load completed visits.");
      setAppointments(Array.isArray(result.data) ? result.data : []);
      setCount(typeof result.count === "number" ? result.count : 0);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load completed visits.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { void loadAppointments(); }, [loadAppointments]);

  const openVisit = async (appointmentId: string) => {
    setSelectedId(appointmentId);
    setDetails(null);
    setDetailError("");
    setDetailLoading(true);
    try {
      const response = await fetch(`/api/appointments/completed-today?appointmentId=${encodeURIComponent(appointmentId)}`);
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || "Unable to load visit details.");
      setDetails(result.data as VisitDetails);
    } catch (loadError) {
      setDetailError(loadError instanceof Error ? loadError.message : "Unable to load visit details.");
    } finally {
      setDetailLoading(false);
    }
  };

  const closeVisit = (open: boolean) => {
    if (!open) {
      setSelectedId("");
      setDetails(null);
      setDetailError("");
    }
  };

  const patient = details?.appointment.patientId;
  const clinical = details?.clinicalRecord;
  const prescription = details?.prescription;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Doctor OPD</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Today&apos;s Completed Patients</h1>
        <p className="mt-1 text-sm text-slate-500">Visits completed by you today.</p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div><CardTitle className="text-base">Completed today</CardTitle><p className="mt-1 text-xs text-slate-500">{loading ? "Loading visits…" : `${count} completed ${count === 1 ? "visit" : "visits"}`}</p></div>
          <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">{count}</Badge>
        </CardHeader>
        <CardContent className="space-y-3">
          {error ? <p role="alert" className="py-8 text-center text-sm text-red-600">{error}</p> : loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading today&apos;s completed visits</div>
          ) : appointments.length === 0 ? (
            <div className="py-10 text-center"><ClipboardList className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 text-sm text-slate-500">No patients completed today.</p></div>
          ) : appointments.map((appointment) => (
            <button key={appointment._id} type="button" onClick={() => void openVisit(appointment._id)} className="flex w-full flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-4 text-left transition hover:border-emerald-300 hover:bg-emerald-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:border-slate-800 dark:hover:bg-emerald-950/20">
              <span className="flex min-w-0 items-center gap-3"><span className="shrink-0 rounded-md bg-slate-100 px-2 py-1 font-mono text-xs font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200">{display(appointment.tokenNumber)}</span><span className="min-w-0"><span className="block truncate font-semibold text-slate-900 dark:text-white">{display(appointment.patientId?.name)}</span><span className="mt-0.5 block text-xs text-slate-500">{display(appointment.patientId?.uhid)}</span></span></span>
              <span className="flex items-center gap-3"><span className="text-xs text-slate-500">Completed {dateTime(appointment.consultationEndedAt)}</span><Badge variant="outline" className="border-green-200 bg-green-50 text-green-700">Completed</Badge></span>
            </button>
          ))}
          {!loading && appointments.length > 0 && <Button variant="outline" size="sm" onClick={() => void loadAppointments()}>Refresh</Button>}
        </CardContent>
      </Card>

      <Dialog open={Boolean(selectedId)} onOpenChange={closeVisit}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{patient?.name || (detailLoading ? "Loading visit…" : "Completed visit")}</DialogTitle>
            <DialogDescription>Clinical details for this appointment completed today.</DialogDescription>
          </DialogHeader>
          {detailLoading ? <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading visit details</div> : detailError ? (
            <p role="alert" className="py-8 text-sm text-red-600">{detailError}</p>
          ) : details ? (
            <div className="space-y-6">
              <section className="space-y-3"><h3 className="font-semibold text-slate-900 dark:text-white">Patient information</h3><div className="grid gap-4 rounded-lg bg-slate-50 p-4 sm:grid-cols-3 dark:bg-slate-800/60"><DetailField label="UHID" value={patient?.uhid} /><DetailField label="Phone" value={patient?.contact} /><DetailField label="Email" value={patient?.email} /><DetailField label="Age / Gender" value={[patient?.age, patient?.gender].filter(Boolean).join(" / ")} /><DetailField label="Date of birth" value={patient?.dateOfBirth ? new Date(patient.dateOfBirth).toLocaleDateString() : undefined} /><DetailField label="Blood group" value={patient?.bloodGroup} /><DetailField label="Address" value={patient?.address} /><DetailField label="Emergency contact" value={patient?.emergencyContact} /><DetailField label="Marital status" value={patient?.maritalStatus} /><DetailField label="Guardian" value={[patient?.guardianName, patient?.guardianRelation].filter(Boolean).join(" · ")} /><DetailField label="Allergies" value={patient?.allergies?.join(", ")} /><DetailField label="Medical history" value={patient?.medicalHistory?.join(", ")} /><DetailField label="Token" value={details.appointment.tokenNumber} /><DetailField label="Completed at" value={details.appointment.consultationEndedAt ? new Date(details.appointment.consultationEndedAt).toLocaleString() : undefined} /></div></section>
              <section className="space-y-3"><h3 className="font-semibold text-slate-900 dark:text-white">Consultation</h3><div className="grid gap-4 rounded-lg border border-slate-200 p-4 sm:grid-cols-2 dark:border-slate-800"><DetailField label="Chief complaint" value={clinical?.chiefComplaint || prescription?.symptoms} /><DetailField label="Diagnosis" value={clinical?.assessment || prescription?.diagnosis} /><DetailField label="History / clinical notes" value={clinical?.historyOfPresentIllness || clinical?.details} /><DetailField label="Objective findings" value={clinical?.objectiveFindings} /><DetailField label="Clinical plan / investigations" value={clinical?.plan} /><DetailField label="Clinical instructions" value={clinical?.instructions} /><DetailField label="Follow-up date" value={clinical?.followUpDate ? new Date(clinical.followUpDate).toLocaleDateString() : undefined} /></div></section>
              <section className="space-y-3"><h3 className="font-semibold text-slate-900 dark:text-white">Prescription</h3>{prescription ? <div className="space-y-4 rounded-lg border border-slate-200 p-4 dark:border-slate-800"><DetailField label="Prescription notes" value={prescription.notes} /><div><p className="text-xs font-medium text-slate-500">Medicines</p>{prescription.medications?.length ? <ul className="mt-2 space-y-2">{prescription.medications.map((medicine, index) => <li key={`${medicine.name}-${index}`} className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-800/60"><p className="font-semibold text-slate-900 dark:text-white">{display(medicine.name)}</p><p className="mt-1 text-slate-600 dark:text-slate-300">{[medicine.dosage, medicine.frequency, medicine.duration].filter(Boolean).join(" · ") || "No dosage details"}</p>{medicine.instructions && <p className="mt-1 text-xs text-slate-500">{medicine.instructions}</p>}</li>)}</ul> : <p className="mt-1 text-sm text-slate-500">No medicines recorded.</p>}</div><DetailField label="Prescription follow-up" value={prescription.followUpDate ? new Date(prescription.followUpDate).toLocaleDateString() : undefined} /></div> : <p className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500">No prescription recorded for this visit.</p>}</section>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
