"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { usePermissions } from "@/components/permissions/permission-context";
import { isReceptionistRole } from "@/lib/rbac/roles";
import { PatientDuplicateDialog, type PatientDuplicateMatch, type SharedPhoneRelation } from "@/components/patients/patient-duplicate-dialog";
import { AlertCircle, CalendarDays, CheckCircle2, ChevronDown, Clock3, FileText, Loader2, Plus, Search, UserRound } from "lucide-react";

type PatientMode = "new" | "existing";
type PaymentStatus = "PENDING" | "PAID";
type Gender = "MALE" | "FEMALE" | "OTHER" | "";
type PatientOption = {
  _id: string; name: string; contact?: string; uhid?: string; age?: number; gender?: Gender;
  bloodGroup?: string; address?: string; sharedPhoneWithPatientId?: { name?: string }; sharedPhoneRelation?: string;
};
type DoctorOption = {
  _id: string; userId?: { name?: string }; departmentId?: { _id?: string; name?: string } | string;
  specialization?: string; roomNumber?: string; consultationFee?: number; status?: string;
};
type DepartmentOption = { _id: string; name: string };
type Availability = { available: boolean; unavailableReason?: string; queueCount: number; bookedSlots: string[]; slots: string[] };
type Errors = Record<string, string>;
type Triage = { temperature: string; bloodPressure: string; pulse: string; spo2: string; weight: string };
type ConfirmedAppointment = {
  tokenNumber?: string;
  appointmentDate?: string | Date;
  priority?: string;
  queueStatus?: string;
  patientId?: { name?: string };
  doctorId?: { name?: string; userId?: { name?: string }; departmentId?: { name?: string } };
};

const inputClass = "h-10 rounded-lg border-slate-300 bg-white text-sm shadow-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-1 dark:border-slate-700 dark:bg-slate-950";
const selectClass = `${inputClass} w-full appearance-none px-3 pr-9`;
const selectWrapClass = "relative";
const quickComplaints = ["General Checkup", "High Fever & Chills", "Chest Pain / Palpitations", "Severe Headache / Migraine", "Hypertension Follow-up", "Joint & Back Pain", "Diabetes Monitoring", "Post-Op Review", "Cough & Cold"];

function parseDate(value: string): Date | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  if (!match) return null;
  const [, day, month, year] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day), 12, 0, 0);
  return date.getDate() === Number(day) && date.getMonth() === Number(month) - 1 && date.getFullYear() === Number(year) ? date : null;
}

function displayDate(value: string): string {
  const date = parseDate(value);
  return date ? new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }).format(date) : "—";
}

function displayPatientAge(age?: number): string {
  if (age == null) return "Age —";
  if (age > 0 && age < 1) return `${Math.min(11, Math.max(1, Math.round(age * 12)))} months`;
  return `${age} yrs`;
}

function SelectField({ id, value, onChange, children, disabled, invalid, describedBy, className = "", onBlur }: {
  id: string; value: string; onChange: (value: string) => void; children: React.ReactNode;
  disabled?: boolean; invalid?: boolean; describedBy?: string; className?: string; onBlur?: () => void;
}) {
  return <div className={`${selectWrapClass} ${className}`}>
    <select id={id} value={value} onChange={(event) => onChange(event.target.value)} onBlur={onBlur} disabled={disabled} aria-invalid={invalid || undefined} aria-describedby={describedBy} className={`${selectClass} ${invalid ? "border-red-500 focus-visible:ring-red-500" : ""}`}>
      {children}
    </select>
    <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
  </div>;
}

function FieldError({ id, children }: { id: string; children?: string }) {
  return children ? <p id={id} className="mt-1 text-xs font-medium text-red-700 dark:text-red-300" role="alert">{children}</p> : null;
}

export default function BookAppointmentPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { isSuperAdmin, roleName } = usePermissions();
  const isReceptionist = isReceptionistRole(roleName);
  const canOverrideFee = isSuperAdmin || roleName?.toUpperCase() === "ADMIN";
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [doctors, setDoctors] = useState<DoctorOption[]>([]);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [patientMode, setPatientMode] = useState<PatientMode>("new");
  const [patientSearch, setPatientSearch] = useState("");
  const [patientListOpen, setPatientListOpen] = useState(false);
  const patientSearchRef = useRef<HTMLDivElement>(null);
  const [selectedDept, setSelectedDept] = useState("");
  const [confirmed, setConfirmed] = useState<ConfirmedAppointment | null>(null);
  const [duplicatePatients, setDuplicatePatients] = useState<PatientDuplicateMatch[]>([]);
  const [canConfirmSharedPhone, setCanConfirmSharedPhone] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [moreDetailsOpen, setMoreDetailsOpen] = useState(false);
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [slotChoice, setSlotChoice] = useState("");
  const [tokenPreference, setTokenPreference] = useState("");
  const [formData, setFormData] = useState({
    patientId: "", patientName: "", contact: "", patientAge: "", ageUnit: "years" as "years" | "months",
    patientGender: "" as Gender, patientBloodGroup: "", patientAddress: "", doctorId: "", appointmentDate: "",
    priority: "NORMAL" as "NORMAL" | "EMERGENCY", reason: "", notes: "", consultationFee: "",
    paymentStatus: "PENDING" as PaymentStatus, paymentMode: "",
  });
  const [triage, setTriage] = useState<Triage>({ temperature: "", bloodPressure: "", pulse: "", spo2: "", weight: "" });

  useEffect(() => {
    let active = true;
    async function loadDependencies() {
      try {
        const [patientResponse, doctorResponse, departmentResponse] = await Promise.all([
          fetch("/api/patient"), fetch("/api/doctor"), fetch("/api/department"),
        ]);
        const [patientJson, doctorJson, departmentJson] = await Promise.all([patientResponse.json(), doctorResponse.json(), departmentResponse.json()]);
        if (!active) return;
        if (patientJson.success && Array.isArray(patientJson.data)) setPatients(patientJson.data as PatientOption[]);
        if (doctorJson.success && Array.isArray(doctorJson.data)) setDoctors(doctorJson.data as DoctorOption[]);
        if (departmentJson.success && Array.isArray(departmentJson.data)) setDepartments(departmentJson.data as DepartmentOption[]);
      } catch {
        toast({ title: "Unable to load booking data", description: "Refresh the page and try again.", variant: "destructive" });
      } finally {
        if (active) setFetching(false);
      }
    }
    void loadDependencies();
    return () => { active = false; };
  }, [toast]);

  useEffect(() => {
    if (!patientListOpen) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (event.target instanceof Node && !patientSearchRef.current?.contains(event.target)) setPatientListOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setPatientListOpen(false); };
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => { document.removeEventListener("mousedown", closeOnOutsideClick); document.removeEventListener("keydown", closeOnEscape); };
  }, [patientListOpen]);

  const filteredPatients = useMemo(() => {
    const query = patientSearch.trim().toLowerCase();
    if (!query) return [];
    return patients.filter((patient) => patient.name.toLowerCase().includes(query) || patient.contact?.includes(query) || patient.uhid?.toLowerCase().includes(query)).slice(0, 10);
  }, [patients, patientSearch]);
  const selectedPatient = patients.find((patient) => patient._id === formData.patientId);
  const selectedDoctor = doctors.find((doctor) => doctor._id === formData.doctorId);
  const filteredDoctors = useMemo(() => selectedDept ? doctors.filter((doctor) => typeof doctor.departmentId === "object" && doctor.departmentId?._id === selectedDept && doctor.status !== "INACTIVE") : [], [doctors, selectedDept]);
  const emergency = formData.priority === "EMERGENCY";
  const phoneValid = /^[6-9]\d{9}$/.test(formData.contact);
  const parsedAppointmentDate = parseDate(formData.appointmentDate);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const selectedDateIsPast = Boolean(parsedAppointmentDate && parsedAppointmentDate < today);
  const availabilityRequestKey = formData.doctorId && parsedAppointmentDate
    ? `${formData.doctorId}:${parsedAppointmentDate.getFullYear()}-${String(parsedAppointmentDate.getMonth() + 1).padStart(2, "0")}-${String(parsedAppointmentDate.getDate()).padStart(2, "0")}`
    : "";
  const [availabilityKey, setAvailabilityKey] = useState("");
  const currentAvailability = availabilityKey === availabilityRequestKey ? availability : null;
  const availabilityLoading = Boolean(availabilityRequestKey && !currentAvailability);

  useEffect(() => {
    let active = true;
    if (!availabilityRequestKey) return;
    const [doctorId, date] = availabilityRequestKey.split(":");
    const query = new URLSearchParams({ doctorId, date });
    fetch(`/api/appointments/availability?${query.toString()}`)
      .then(async (response) => ({ response, json: await response.json() }))
      .then(({ response, json }) => {
        if (active) {
          setAvailability(response.ok && json.success ? json.data as Availability : { available: false, unavailableReason: json.error || "Could not load availability.", queueCount: 0, bookedSlots: [], slots: [] });
          setAvailabilityKey(availabilityRequestKey);
        }
      })
      .catch(() => {
        if (active) {
          setAvailability({ available: false, unavailableReason: "Could not load availability.", queueCount: 0, bookedSlots: [], slots: [] });
          setAvailabilityKey(availabilityRequestKey);
        }
      });
    return () => { active = false; };
  }, [availabilityRequestKey]);

  const validate = useCallback((): Errors => {
    const next: Errors = {};
    if (patientMode === "existing" && !formData.patientId) next.patientSearch = "Select a patient from the results.";
    if (patientMode === "new") {
      if (!emergency && !formData.patientName.trim()) next.patientName = "Enter the patient’s name.";
      if (!emergency && !formData.contact) next.contact = "Enter a 10-digit mobile number.";
      if (formData.contact && !phoneValid) next.contact = "Enter 10 digits; the first digit must be 6–9.";
      if (!emergency && !formData.patientAge) next.patientAge = "Enter the patient’s age.";
      if (formData.patientAge) {
        const age = Number(formData.patientAge);
        const valid = formData.ageUnit === "years" ? age >= 0 && age <= 120 && Number.isInteger(age) : age >= 0 && age <= 11 && Number.isInteger(age);
        if (!valid) next.patientAge = formData.ageUnit === "years" ? "Age must be between 0 and 120 years." : "Age must be between 0 and 11 months.";
      }
      if (!emergency && !formData.patientGender) next.patientGender = "Choose a gender.";
    }
    if (!selectedDept) next.department = "Choose a department.";
    if (!formData.doctorId) next.doctorId = "Choose a doctor.";
    if (!formData.appointmentDate || !parsedAppointmentDate) next.appointmentDate = "Enter a valid date as DD/MM/YYYY.";
    else if (selectedDateIsPast && !emergency) next.appointmentDate = "Choose today or a future date.";
    if (!formData.reason.trim()) next.reason = "Enter the chief complaint.";
    if (triage.temperature && (Number(triage.temperature) < 30 || Number(triage.temperature) > 45)) next.temperature = "Use a temperature between 30 and 45 °C.";
    if (triage.bloodPressure) {
      const bloodPressure = /^\s*(\d{2,3})\s*\/\s*(\d{2,3})\s*$/.exec(triage.bloodPressure);
      if (!bloodPressure) next.bloodPressure = "Enter systolic/diastolic, for example 120/80.";
      else if (Number(bloodPressure[1]) < 40 || Number(bloodPressure[1]) > 300 || Number(bloodPressure[2]) < 20 || Number(bloodPressure[2]) > 200) next.bloodPressure = "Use systolic 40–300 and diastolic 20–200 mmHg.";
    }
    if (triage.pulse && (Number(triage.pulse) < 20 || Number(triage.pulse) > 250)) next.pulse = "Pulse must be between 20 and 250 bpm.";
    if (triage.spo2 && (Number(triage.spo2) < 50 || Number(triage.spo2) > 100)) next.spo2 = "SpO₂ must be between 50 and 100%.";
    if (triage.weight && (Number(triage.weight) < 0.3 || Number(triage.weight) > 400)) next.weight = "Weight must be between 0.3 and 400 kg.";
    if (!emergency && availabilityRequestKey && !currentAvailability) next.availability = "Checking the doctor’s schedule…";
    if (!emergency && currentAvailability && !currentAvailability.available) next.availability = currentAvailability.unavailableReason || "This doctor is unavailable on the selected date.";
    if (!emergency && currentAvailability?.available && !slotChoice && tokenPreference !== "NEXT") next.slotChoice = "Choose a time slot or the next available token.";
    if (!formData.paymentMode) next.paymentMode = "Choose a payment mode.";
    if (!selectedDoctor || formData.consultationFee === "" || Number(formData.consultationFee) < 0) next.consultationFee = "Select a doctor with a configured fee.";
    return next;
  }, [patientMode, formData, emergency, phoneValid, selectedDept, parsedAppointmentDate, selectedDateIsPast, triage, availabilityRequestKey, currentAvailability, slotChoice, tokenPreference, selectedDoctor]);
  const errors = validate();
  const showError = (field: string) => submitAttempted || touched[field];
  const displayedError = (field: string) => showError(field) ? errors[field] : undefined;
  const markTouched = (field: string) => setTouched((previous) => ({ ...previous, [field]: true }));

  const updateDoctor = (doctorId: string) => {
    const doctor = doctors.find((item) => item._id === doctorId);
    setFormData((previous) => ({ ...previous, doctorId, consultationFee: doctor?.consultationFee != null ? String(doctor.consultationFee) : "" }));
    setAvailability(null);
    setSlotChoice("");
    setTokenPreference("");
    markTouched("doctorId");
  };

  const choosePatient = (patient: PatientOption) => {
    setFormData((previous) => ({ ...previous, patientId: patient._id, patientName: patient.name, contact: patient.contact || "", patientAge: patient.age == null ? "" : String(patient.age > 0 && patient.age < 1 ? Math.round(patient.age * 12) : patient.age), ageUnit: patient.age != null && patient.age > 0 && patient.age < 1 ? "months" : "years", patientGender: patient.gender || "", patientBloodGroup: patient.bloodGroup || "", patientAddress: patient.address || "" }));
    setPatientSearch(""); setPatientListOpen(false); markTouched("patientSearch");
  };

  const clearPatient = () => {
    setFormData((previous) => ({ ...previous, patientId: "", patientName: "", contact: "", patientAge: "", patientGender: "", patientBloodGroup: "", patientAddress: "" }));
    setPatientSearch(""); setPatientListOpen(false);
  };

  const setEmergency = (active: boolean) => {
    setFormData((previous) => ({ ...previous, priority: active ? "EMERGENCY" : "NORMAL" }));
    if (active) setTokenPreference("EMERGENCY"); else if (tokenPreference === "EMERGENCY") setTokenPreference("");
  };

  const submitBooking = async (event?: React.FormEvent, sharedPhone?: { patient: PatientDuplicateMatch; relation: SharedPhoneRelation }) => {
    event?.preventDefault();
    setSubmitAttempted(true);
    setTouched((previous) => ({ ...previous, patientSearch: true, patientName: true, contact: true, patientAge: true, patientGender: true, department: true, doctorId: true, appointmentDate: true, reason: true, paymentMode: true, consultationFee: true, slotChoice: true }));
    if (loading) return;
    const currentErrors = validate();
    if (Object.keys(currentErrors).length > 0) {
      document.getElementById(Object.keys(currentErrors)[0])?.focus();
      return;
    }
    setLoading(true);
    try {
      const ageYears = formData.patientAge ? (formData.ageUnit === "months" ? Number(formData.patientAge) / 12 : Number(formData.patientAge)) : undefined;
      const appointmentDate = parsedAppointmentDate?.toISOString();
      const payload: Record<string, unknown> = {
        doctorId: formData.doctorId, appointmentDate, appointmentTime: slotChoice || undefined,
        type: patientMode === "new" ? "NEW" : "FOLLOW_UP", priority: emergency ? "EMERGENCY" : "NORMAL",
        reason: formData.reason.trim(), notes: formData.notes,
        triage: Object.fromEntries(Object.entries(triage).filter(([, value]) => value.trim()).map(([key, value]) => [key, key === "bloodPressure" ? value : Number(value)])),
        paymentStatus: formData.paymentStatus, paymentMode: formData.paymentMode,
        ...(canOverrideFee ? { consultationFee: Number(formData.consultationFee) } : {}),
        tokenPreference: tokenPreference || (slotChoice ? "SCHEDULED" : "NEXT"),
        ...(sharedPhone ? { confirmSharedPhone: true, relatedPatientId: sharedPhone.patient._id, relation: sharedPhone.relation } : {}),
      };
      if (patientMode === "existing") payload.patientId = formData.patientId;
      else {
        payload.patientName = formData.patientName.trim(); payload.contact = formData.contact;
        if (ageYears != null) payload.patientAge = ageYears;
        if (formData.patientGender) payload.patientGender = formData.patientGender;
        if (formData.patientBloodGroup) payload.patientBloodGroup = formData.patientBloodGroup;
        if (formData.patientAddress.trim()) payload.patientAddress = formData.patientAddress.trim();
      }
      const response = await fetch("/api/appointments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json();
      if (response.ok && result.success) {
        setDuplicatePatients([]); setCanConfirmSharedPhone(false); setConfirmed(result.data as ConfirmedAppointment);
        toast({ title: "Appointment booked", description: `Token ${(result.data as { tokenNumber?: string }).tokenNumber || "assigned"} confirmed.` });
      } else if (response.status === 409 && Array.isArray(result.matchingPatients)) {
        setDuplicatePatients(result.matchingPatients as PatientDuplicateMatch[]); setCanConfirmSharedPhone(result.canConfirmSharedPhone === true);
      } else toast({ title: "Booking failed", description: result.error || "Unable to complete booking.", variant: "destructive" });
    } catch (error) {
      toast({ title: "Booking error", description: error instanceof Error ? error.message : "Unable to complete booking.", variant: "destructive" });
    } finally { setLoading(false); }
  };

  const bookAnother = () => {
    setConfirmed(null); setPatientMode("new"); setPatientSearch(""); setPatientListOpen(false); setSelectedDept("");
    setTouched({}); setSubmitAttempted(false); setAvailability(null); setSlotChoice(""); setTokenPreference(""); setMoreDetailsOpen(false);
    setFormData({ patientId: "", patientName: "", contact: "", patientAge: "", ageUnit: "years", patientGender: "", patientBloodGroup: "", patientAddress: "", doctorId: "", appointmentDate: "", priority: "NORMAL", reason: "", notes: "", consultationFee: "", paymentStatus: "PENDING", paymentMode: "" });
    setTriage({ temperature: "", bloodPressure: "", pulse: "", spo2: "", weight: "" });
  };

  const renderStep = (number: number, title: string, color: string) => <div className="flex items-center gap-2"><span className={`flex h-7 w-7 items-center justify-center rounded-md ${color} text-xs font-semibold`}>{number}</span><CardTitle className="text-base">{title}</CardTitle></div>;

  if (fetching) return <div className="flex items-center justify-center py-24"><Loader2 className="h-8 w-8 animate-spin text-slate-500" aria-label="Loading booking data" /></div>;
  if (confirmed) return <Card className="mx-auto max-w-2xl border-emerald-200 shadow-sm dark:border-emerald-800"><CardHeader className="border-b bg-emerald-50/60 text-center dark:bg-emerald-950/30"><CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" /><CardTitle>Appointment Confirmed</CardTitle><CardDescription>Token issued. The patient has been added to today&apos;s OPD waiting queue.</CardDescription></CardHeader><CardContent className="space-y-5 p-6"><div className="text-center"><p className="text-xs font-semibold uppercase tracking-widest text-slate-600">Token Number</p><p className="font-mono text-5xl font-black text-emerald-600">{confirmed.tokenNumber || "T-???"}</p></div><div className="grid grid-cols-1 gap-x-6 gap-y-3 border-y border-slate-100 py-4 text-sm dark:border-slate-800 sm:grid-cols-2"><div><span className="text-xs uppercase tracking-wider text-slate-600">Patient</span><p className="mt-0.5 font-semibold text-slate-900 dark:text-white">{confirmed.patientId?.name || "Patient"}</p></div><div><span className="text-xs uppercase tracking-wider text-slate-600">Doctor</span><p className="mt-0.5 font-semibold text-slate-900 dark:text-white">Dr. {confirmed.doctorId?.userId?.name || confirmed.doctorId?.name || "Doctor"}</p></div><div><span className="text-xs uppercase tracking-wider text-slate-600">Department</span><p className="mt-0.5 font-semibold text-slate-900 dark:text-white">{confirmed.doctorId?.departmentId?.name || "OPD"}</p></div><div><span className="text-xs uppercase tracking-wider text-slate-600">Date</span><p className="mt-0.5 font-semibold text-slate-900 dark:text-white">{confirmed.appointmentDate ? new Date(confirmed.appointmentDate).toLocaleDateString() : "—"}</p></div><div><span className="text-xs uppercase tracking-wider text-slate-600">Priority</span><div className="mt-1"><Badge variant={confirmed.priority === "EMERGENCY" ? "destructive" : "secondary"}>{confirmed.priority || "NORMAL"}</Badge></div></div><div><span className="text-xs uppercase tracking-wider text-slate-600">Status</span><div className="mt-1"><Badge className="border border-amber-200 bg-amber-100 text-[10px] font-bold text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">{confirmed.queueStatus || "WAITING"}</Badge></div></div></div><div className="flex flex-wrap gap-2 pt-1"><Button onClick={bookAnother} className="gap-2 bg-emerald-600 text-white hover:bg-emerald-700"><Plus className="h-4 w-4" />Book Another Appointment</Button>{!isReceptionist && <Button variant="outline" onClick={() => router.push("/appointments/queue")}>View Queue</Button>}<Button variant="outline" onClick={() => router.push("/appointments/list")}>All Appointments</Button></div></CardContent></Card>;

  return <div className="mx-auto max-w-6xl space-y-6 pb-12">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Book Patient Appointment</h1><p className="text-sm text-slate-600 dark:text-slate-300">Schedule outpatient consultation, assign a daily token, and record triage details.</p></div><Button type="button" variant="outline" onClick={() => router.push("/appointments/list")}>View All Appointments</Button></div>
    <form noValidate onSubmit={(event) => void submitBooking(event)} onFocusCapture={(event) => { const fieldId = (event.target as HTMLElement).id; if (fieldId) markTouched(fieldId); }} className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <Card className="relative z-30 overflow-visible border-slate-200/80 shadow-sm dark:border-slate-800"><CardHeader className="border-b border-slate-100 pb-3 dark:border-slate-800">{renderStep(1, "Patient Information", "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300")}</CardHeader><CardContent className="space-y-5 pt-5">
          <div className="flex flex-wrap items-center justify-between gap-3"><div role="group" aria-label="Patient type" className="inline-flex rounded-lg border border-slate-300 bg-slate-100 p-1 dark:border-slate-700 dark:bg-slate-800">{(["new", "existing"] as const).map((mode) => <button key={mode} type="button" aria-pressed={patientMode === mode} onClick={() => { setPatientMode(mode); clearPatient(); }} className={`rounded-md px-3 py-1.5 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${patientMode === mode ? "bg-white text-emerald-700 shadow-sm dark:bg-slate-950 dark:text-emerald-300" : "text-slate-700 hover:text-slate-950 dark:text-slate-300"}`}>{mode === "new" ? "New Patient" : "Existing Patient"}</button>)}</div>
            <button type="button" aria-pressed={emergency} onClick={() => setEmergency(!emergency)} className={`rounded-lg border px-3 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 ${emergency ? "border-red-700 bg-red-600 text-white shadow-sm hover:bg-red-700" : "border-red-300 bg-white text-red-700 hover:bg-red-50 dark:border-red-900 dark:bg-slate-950 dark:text-red-300"}`}>{emergency ? "Emergency Patient · Active" : "Emergency Patient"}</button>
          </div>
          {emergency && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">Emergency priority is active. Age, address, and blood group can be updated later; name and phone are optional.</p>}
          {patientMode === "existing" ? <div className="space-y-2">{selectedPatient ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900"><div><p className="font-semibold text-slate-900 dark:text-white">{selectedPatient.name}</p><p className="mt-1 text-sm text-slate-700 dark:text-slate-300">{selectedPatient.gender || "Gender —"} · {displayPatientAge(selectedPatient.age)} · {selectedPatient.contact || "Phone —"}</p><p className="mt-1 text-xs text-slate-600 dark:text-slate-300">UHID: {selectedPatient.uhid || "—"} {selectedPatient.bloodGroup ? `· Blood: ${selectedPatient.bloodGroup}` : ""}</p></div><button type="button" className="text-sm font-semibold text-emerald-700 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:text-emerald-300" onClick={clearPatient}>Change patient</button></div> : <><Label htmlFor="patientSearch">Search by phone, name or patient ID <span className="text-red-700">*</span></Label><div ref={patientSearchRef} className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-500" /><Input id="patientSearch" value={patientSearch} onChange={(event) => { setPatientSearch(event.target.value); setPatientListOpen(true); markTouched("patientSearch"); setFormData((previous) => ({ ...previous, patientId: "" })); }} onFocus={() => setPatientListOpen(true)} role="combobox" aria-expanded={patientListOpen && Boolean(patientSearch.trim())} aria-controls="patient-results" aria-autocomplete="list" aria-invalid={Boolean(displayedError("patientSearch"))} aria-describedby={displayedError("patientSearch") ? "patientSearch-error" : undefined} placeholder="Phone, patient name or UHID" className={`${inputClass} pl-9`} />{patientListOpen && Boolean(patientSearch.trim()) && <div id="patient-results" role="listbox" className="absolute left-0 right-0 top-full z-50 mt-1 max-h-64 overflow-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl dark:border-slate-700 dark:bg-slate-900">{filteredPatients.length ? filteredPatients.map((patient) => <button type="button" role="option" aria-selected="false" key={patient._id} onClick={() => choosePatient(patient)} className="w-full rounded-lg px-3 py-2 text-left hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:hover:bg-slate-800"><span className="block font-medium text-slate-900 dark:text-white">{patient.name}</span><span className="text-xs text-slate-600 dark:text-slate-300">{patient.contact || "No phone"} · {patient.uhid || "No ID"}</span></button>) : <p role="status" className="px-3 py-3 text-sm text-slate-700 dark:text-slate-300">No patient found.</p>}</div>}</div><FieldError id="patientSearch-error">{displayedError("patientSearch")}</FieldError></>}</div> : <div className="space-y-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="patientName">Full Name {!emergency && <span className="text-red-700">*</span>}</Label><Input id="patientName" value={formData.patientName} readOnly={Boolean(selectedPatient)} onChange={(event) => setFormData((previous) => ({ ...previous, patientName: event.target.value }))} onBlur={() => markTouched("patientName")} placeholder={emergency ? "Optional for emergency" : "Patient full name"} aria-invalid={Boolean(displayedError("patientName"))} aria-describedby={displayedError("patientName") ? "patientName-error" : undefined} className={inputClass} />{emergency && <p className="text-xs text-slate-700 dark:text-slate-300">Can be updated later.</p>}<FieldError id="patientName-error">{displayedError("patientName")}</FieldError></div><div className="space-y-2"><Label htmlFor="contact">Phone Number {!emergency && <span className="text-red-700">*</span>}</Label><div className="flex"><span className="inline-flex h-10 items-center rounded-l-lg border border-r-0 border-slate-300 bg-slate-100 px-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">+91</span><Input id="contact" inputMode="numeric" autoComplete="tel-national" maxLength={10} value={formData.contact} readOnly={Boolean(selectedPatient)} onChange={(event) => setFormData((previous) => ({ ...previous, contact: event.target.value.replace(/\D/g, "").slice(0, 10) }))} onBlur={() => markTouched("contact")} placeholder="9876543210" aria-invalid={Boolean(displayedError("contact"))} aria-describedby="contact-hint contact-error" className={`${inputClass} rounded-l-none`} /></div><p id="contact-hint" className="text-xs text-slate-700 dark:text-slate-300">Enter 10 digits; the first digit must be 6–9.</p><FieldError id="contact-error">{displayedError("contact")}</FieldError>{patientMode === "new" && formData.contact.length === 10 && patients.some((patient) => patient.contact?.replace(/\D/g, "").slice(-10) === formData.contact) && <p className="text-xs font-medium text-amber-800 dark:text-amber-300" role="status">A patient with this phone number already exists. Select Existing Patient to avoid a duplicate.</p>}</div></div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="patientAge">Age {!emergency && <span className="text-red-700">*</span>}</Label><div className="flex gap-2"><Input id="patientAge" type="number" min="0" max={formData.ageUnit === "years" ? "120" : "11"} step="1" value={formData.patientAge} onChange={(event) => setFormData((previous) => ({ ...previous, patientAge: event.target.value }))} onBlur={() => markTouched("patientAge")} placeholder={emergency ? "Optional" : "Enter age"} aria-invalid={Boolean(displayedError("patientAge"))} aria-describedby={displayedError("patientAge") ? "patientAge-error" : undefined} className={inputClass} /><div role="group" aria-label="Age unit" className="flex shrink-0 rounded-lg border border-slate-300 p-1 dark:border-slate-700">{(["years", "months"] as const).map((unit) => <button key={unit} type="button" aria-pressed={formData.ageUnit === unit} onClick={() => setFormData((previous) => ({ ...previous, ageUnit: unit, patientAge: "" }))} className={`rounded-md px-2 text-xs font-medium capitalize focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${formData.ageUnit === unit ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" : "text-slate-700 dark:text-slate-300"}`}>{unit}</button>)}</div></div><FieldError id="patientAge-error">{displayedError("patientAge")}</FieldError></div><div className="space-y-2"><Label htmlFor="patientGender">Gender {!emergency && <span className="text-red-700">*</span>}</Label><SelectField id="patientGender" value={formData.patientGender} onChange={(value) => { setFormData((previous) => ({ ...previous, patientGender: value as Gender })); markTouched("patientGender"); }} invalid={Boolean(displayedError("patientGender"))} describedBy={displayedError("patientGender") ? "patientGender-error" : undefined}><option value="" disabled>Select</option><option value="MALE">Male</option><option value="FEMALE">Female</option><option value="OTHER">Other</option></SelectField><FieldError id="patientGender-error">{displayedError("patientGender")}</FieldError></div></div>
            <div><button type="button" aria-expanded={moreDetailsOpen} onClick={() => setMoreDetailsOpen(!moreDetailsOpen)} className="flex items-center gap-2 text-sm font-semibold text-emerald-800 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:text-emerald-300">More details (optional)<ChevronDown className={`h-4 w-4 transition-transform ${moreDetailsOpen ? "rotate-180" : ""}`} /></button>{moreDetailsOpen && <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="patientBloodGroup">Blood Group</Label><SelectField id="patientBloodGroup" value={formData.patientBloodGroup} onChange={(value) => setFormData((previous) => ({ ...previous, patientBloodGroup: value }))}><option value="" disabled>Select</option>{["O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"].map((blood) => <option key={blood} value={blood}>{blood}</option>)}</SelectField></div><div className="space-y-2"><Label htmlFor="patientAddress">Address</Label><Input id="patientAddress" value={formData.patientAddress} onChange={(event) => setFormData((previous) => ({ ...previous, patientAddress: event.target.value }))} placeholder="Residential locality or city" className={inputClass} /></div></div>}</div>
          </div>}
        </CardContent></Card>

        <Card className="border-slate-200/80 shadow-sm dark:border-slate-800"><CardHeader className="border-b border-slate-100 pb-3 dark:border-slate-800">{renderStep(2, "Department, Doctor & Date", "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300")}</CardHeader><CardContent className="space-y-5 pt-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="department">Department <span className="text-red-700">*</span></Label><SelectField id="department" value={selectedDept} onChange={(value) => { setSelectedDept(value); setFormData((previous) => ({ ...previous, doctorId: "", consultationFee: "" })); setAvailability(null); setSlotChoice(""); setTokenPreference(""); markTouched("department"); }} invalid={Boolean(displayedError("department"))} describedBy={displayedError("department") ? "department-error" : undefined}><option value="" disabled>Select department</option>{departments.map((department) => <option key={department._id} value={department._id}>{department.name}</option>)}</SelectField><FieldError id="department-error">{displayedError("department")}</FieldError></div><div className="space-y-2"><Label htmlFor="doctorId">Doctor <span className="text-red-700">*</span></Label><SelectField id="doctorId" value={formData.doctorId} onChange={updateDoctor} disabled={!selectedDept} invalid={Boolean(displayedError("doctorId"))} describedBy={displayedError("doctorId") ? "doctorId-error" : undefined}><option value="" disabled>{selectedDept ? "Select doctor" : "Select department first"}</option>{filteredDoctors.map((doctor) => <option key={doctor._id} value={doctor._id}>Dr. {doctor.userId?.name || "Doctor"} · {doctor.specialization || "Physician"}</option>)}</SelectField><FieldError id="doctorId-error">{displayedError("doctorId")}</FieldError></div></div>
            <div className="space-y-2"><Label htmlFor="appointmentDate">Appointment Date <span className="text-red-700">*</span></Label><div className="relative"><CalendarDays className="absolute left-3 top-3 h-4 w-4 text-slate-500" /><Input id="appointmentDate" inputMode="numeric" placeholder="DD/MM/YYYY" maxLength={10} value={formData.appointmentDate} onChange={(event) => { const raw = event.target.value.replace(/[^\d]/g, "").slice(0, 8); const formatted = raw.length > 4 ? `${raw.slice(0, 2)}/${raw.slice(2, 4)}/${raw.slice(4)}` : raw.length > 2 ? `${raw.slice(0, 2)}/${raw.slice(2)}` : raw; setFormData((previous) => ({ ...previous, appointmentDate: formatted })); setSlotChoice(""); setTokenPreference(""); }} onBlur={() => markTouched("appointmentDate")} aria-invalid={Boolean(displayedError("appointmentDate"))} aria-describedby="date-hint date-error" className={`${inputClass} pl-9`} /><p id="date-hint" className="mt-1 text-xs text-slate-700 dark:text-slate-300">Enter day/month/year, for example 06/11/2026.</p><FieldError id="date-error">{displayedError("appointmentDate")}</FieldError></div></div>
          {formData.doctorId && parsedAppointmentDate && <div className="space-y-3 rounded-lg border border-slate-200 p-4 dark:border-slate-700"><div className="flex items-center justify-between gap-3"><p className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white"><Clock3 className="h-4 w-4 text-emerald-700" />Available time slots</p>{currentAvailability && <Badge variant="outline">Queue: {currentAvailability.queueCount}</Badge>}</div>{availabilityLoading ? <p className="text-sm text-slate-700 dark:text-slate-300">Loading schedule…</p> : currentAvailability && !currentAvailability.available ? <p role="status" className="flex items-start gap-2 text-sm font-medium text-amber-800 dark:text-amber-300"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{currentAvailability.unavailableReason || "Doctor unavailable on this date."}{emergency && <span>Emergency booking can continue with an emergency token.</span>}</p> : currentAvailability?.available ? <div className="flex flex-wrap gap-2">{currentAvailability.slots.map((slot) => { const booked = currentAvailability.bookedSlots.includes(slot); return <button key={slot} type="button" disabled={booked} aria-pressed={slotChoice === slot} onClick={() => { setSlotChoice(slot); setTokenPreference(""); markTouched("slotChoice"); }} className={`rounded-lg border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${booked ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-500 line-through dark:border-slate-700 dark:bg-slate-800" : slotChoice === slot ? "border-emerald-700 bg-emerald-600 text-white" : "border-slate-300 text-slate-800 hover:border-emerald-600 dark:border-slate-700 dark:text-slate-200"}`}>{slot}</button>; })}</div> : null}
            {!emergency && <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-800 dark:text-slate-200"><input type="checkbox" checked={tokenPreference === "NEXT"} onChange={(event) => { setTokenPreference(event.target.checked ? "NEXT" : ""); setSlotChoice(""); markTouched("slotChoice"); }} className="mt-0.5 h-4 w-4 accent-emerald-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500" />Issue the next available token without choosing a time</label>}
            {emergency && <p className="text-sm font-medium text-red-800 dark:text-red-300">Emergency booking uses the next token and skips future-slot restrictions.</p>}
            <FieldError id="slotChoice-error">{submitAttempted || touched.slotChoice || currentAvailability ? errors.availability || errors.slotChoice : undefined}</FieldError>
          </div>}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="type">Type</Label><div id="type" className="flex h-10 items-center rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">{patientMode === "new" ? "NEW" : "EXISTING"}</div></div><div className="space-y-2"><Label>Priority</Label><div className="flex h-10 items-center"><Badge variant={emergency ? "destructive" : "secondary"}>{emergency ? "EMERGENCY" : "NORMAL"}</Badge></div></div></div>
        </CardContent></Card>

        <Card className="border-slate-200/80 shadow-sm dark:border-slate-800"><CardHeader className="border-b border-slate-100 pb-3 dark:border-slate-800">{renderStep(3, "Triage Details", "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300")}</CardHeader><CardContent className="space-y-5 pt-5"><div className="space-y-2"><Label htmlFor="reason">Chief Complaint <span className="text-red-700">*</span></Label><Input id="reason" value={formData.reason} onChange={(event) => setFormData((previous) => ({ ...previous, reason: event.target.value }))} onBlur={() => markTouched("reason")} placeholder="Main concern or symptoms" aria-invalid={Boolean(displayedError("reason"))} aria-describedby={displayedError("reason") ? "reason-error" : undefined} className={inputClass} /><FieldError id="reason-error">{displayedError("reason")}</FieldError><div className="flex flex-wrap gap-2">{quickComplaints.map((complaint) => <button type="button" key={complaint} onClick={() => setFormData((previous) => ({ ...previous, reason: complaint }))} className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-800 hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:bg-slate-800 dark:text-slate-200">+ {complaint}</button>)}</div></div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">{([ ["temperature", "Temperature", "°C", "30", "45"], ["bloodPressure", "Blood Pressure", "mmHg", "", ""], ["pulse", "Pulse", "bpm", "20", "250"], ["spo2", "SpO₂", "%", "50", "100"], ["weight", "Weight", "kg", "0.3", "400"] ] as const).map(([key, label, unit, min, max]) => <div key={key} className="space-y-2"><Label htmlFor={key}>{label} <span className="font-normal text-slate-600">({unit})</span></Label><Input id={key} type={key === "bloodPressure" ? "text" : "number"} min={min || undefined} max={max || undefined} step={key === "weight" || key === "temperature" ? "0.1" : "1"} value={triage[key]} onChange={(event) => setTriage((previous) => ({ ...previous, [key]: event.target.value }))} onBlur={() => markTouched(key)} placeholder={key === "bloodPressure" ? "120/80" : "Optional"} aria-invalid={Boolean(displayedError(key))} aria-describedby={displayedError(key) ? `${key}-error` : undefined} className={inputClass} /><FieldError id={`${key}-error`}>{displayedError(key)}</FieldError></div>)}</div>
          <div className="space-y-2"><Label htmlFor="notes">Additional Clinical Notes (Optional)</Label><textarea id="notes" rows={3} value={formData.notes} onChange={(event) => setFormData((previous) => ({ ...previous, notes: event.target.value }))} className={`${inputClass} h-auto min-h-20 py-2`} placeholder="Relevant context for the consultation" /></div>
        </CardContent></Card>
      </div>

      <aside className="space-y-6 lg:sticky lg:top-6 lg:self-start"><Card className="border-slate-200/80 shadow-sm dark:border-slate-800"><CardHeader className="border-b border-slate-100 bg-slate-50/70 pb-3 dark:border-slate-800 dark:bg-slate-900/50"><CardTitle className="flex items-center gap-2 text-base"><FileText className="h-4 w-4 text-emerald-700" />Booking Summary</CardTitle><CardDescription className="text-slate-700 dark:text-slate-300">Review the appointment before confirming.</CardDescription></CardHeader><CardContent className="space-y-4 p-5"><div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900">{selectedDoctor ? <><p className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">Attending Physician</p><p className="mt-1 font-bold text-slate-900 dark:text-white">Dr. {selectedDoctor.userId?.name || "Doctor"}</p><p className="mt-1 text-xs text-slate-700 dark:text-slate-300">{selectedDoctor.specialization || "Physician"} · {typeof selectedDoctor.departmentId === "object" ? selectedDoctor.departmentId?.name || "—" : "—"}</p><p className="mt-2 text-xs text-slate-700 dark:text-slate-300">Room: <span className="font-semibold text-slate-900 dark:text-white">{selectedDoctor.roomNumber || "—"}</span></p></> : <div className="py-2 text-center"><UserRound className="mx-auto h-7 w-7 text-slate-500" /><p className="mt-2 text-sm text-slate-700 dark:text-slate-300">Select a doctor to see details</p></div>}</div>
        <div className="space-y-3 border-y border-slate-200 py-4 text-sm dark:border-slate-700">{([["Patient", patientMode === "existing" ? selectedPatient?.name || "—" : formData.patientName.trim() || "—"], ["Department", selectedDept ? departments.find((department) => department._id === selectedDept)?.name || "—" : "—"], ["Doctor", selectedDoctor?.userId?.name ? `Dr. ${selectedDoctor.userId.name}` : "—"], ["Room", selectedDoctor?.roomNumber || "—"], ["Date", displayDate(formData.appointmentDate)], ["Type", patientMode === "new" ? "NEW" : "EXISTING"]] as const).map(([label, value]) => <div className="flex items-start justify-between gap-3" key={label}><span className="text-slate-700 dark:text-slate-300">{label}</span><span className="max-w-[65%] text-right font-semibold text-slate-900 dark:text-white">{value}</span></div>)}<div className="flex justify-between"><span className="text-slate-700 dark:text-slate-300">Priority</span><Badge variant={emergency ? "destructive" : "secondary"}>{emergency ? "EMERGENCY" : "NORMAL"}</Badge></div></div>
        <div className="space-y-4"><div className="space-y-2"><Label htmlFor="consultationFee">Consultation Fee (₹)</Label><Input id="consultationFee" type="number" min="0" step="1" placeholder={selectedDoctor ? "Configured fee" : "Select a doctor"} readOnly={!canOverrideFee} value={formData.consultationFee} onChange={(event) => setFormData((previous) => ({ ...previous, consultationFee: event.target.value }))} onBlur={() => markTouched("consultationFee")} aria-invalid={Boolean(displayedError("consultationFee"))} aria-describedby={displayedError("consultationFee") ? "consultationFee-error" : undefined} className={`${inputClass} text-right font-bold ${canOverrideFee ? "" : "bg-slate-100 dark:bg-slate-900"}`} />{canOverrideFee && <p className="text-xs text-slate-700 dark:text-slate-300">Admin edits are recorded in the audit log.</p>}<FieldError id="consultationFee-error">{displayedError("consultationFee")}</FieldError></div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2"><div className="space-y-2"><Label htmlFor="paymentMode">Payment Mode</Label><SelectField id="paymentMode" value={formData.paymentMode} onChange={(value) => { setFormData((previous) => ({ ...previous, paymentMode: value })); markTouched("paymentMode"); }} invalid={Boolean(displayedError("paymentMode"))} describedBy={displayedError("paymentMode") ? "paymentMode-error" : undefined}><option value="" disabled>Select</option><option value="CASH">Cash</option><option value="CARD">Debit/Credit Card</option><option value="UPI">UPI / QR Code</option><option value="INSURANCE">Insurance</option><option value="PAY_AT_CLINIC">Pay at Counter</option></SelectField><FieldError id="paymentMode-error">{displayedError("paymentMode")}</FieldError></div><div className="space-y-2"><Label htmlFor="paymentStatus">Payment Status</Label><SelectField id="paymentStatus" value={formData.paymentStatus} onChange={(value) => setFormData((previous) => ({ ...previous, paymentStatus: value as PaymentStatus }))}><option value="PENDING">Pending</option><option value="PAID">Paid</option></SelectField></div></div></div>
        <div className="pt-1"><Button type="submit" disabled={loading || Object.keys(errors).length > 0} className="w-full gap-2 bg-emerald-600 font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}{loading ? "Booking…" : "Confirm & Issue Token"}</Button><p className="mt-2 text-center text-xs text-slate-700 dark:text-slate-300">Creates the daily queue token and booking record.</p>{submitAttempted && Object.keys(errors).length > 0 && <p className="mt-2 text-center text-xs font-medium text-red-700 dark:text-red-300" role="status">Complete the required fields to continue.</p>}</div>
      </CardContent></Card></aside>
    </form>
    <PatientDuplicateDialog patients={duplicatePatients} canConfirmSharedPhone={canConfirmSharedPhone} onClose={() => { setDuplicatePatients([]); setCanConfirmSharedPhone(false); }} onConfirmSharedPhone={(patient, relation) => void submitBooking(undefined, { patient, relation })} />
  </div>;
}
