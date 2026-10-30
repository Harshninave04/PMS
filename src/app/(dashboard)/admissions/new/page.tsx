"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  BedDouble,
  Check,
  CheckCircle2,
  ClipboardPlus,
  Info,
  Loader2,
  Search,
  Siren,
  UserPlus,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { useHospitalProfile } from "@/components/hospital-profile/hospital-profile-context";
import { hospitalDateTimeInputToUtc } from "@/lib/hospital-date";
import { PatientDuplicateDialog, type PatientDuplicateMatch, type SharedPhoneRelation } from "@/components/patients/patient-duplicate-dialog";

interface Patient {
  _id: string;
  name: string;
  uhid?: string;
  age: number;
  gender: string;
  contact: string;
  bloodGroup?: string | null;
  allergies?: string[];
  sharedPhoneWithPatientId?: string | { name?: string } | null;
  sharedPhoneRelation?: string;
}

interface Doctor {
  _id: string;
  name: string;
  role?: string;
  department?: string;
  specialization?: string;
}

interface Ward {
  _id: string;
  wardName: string;
  wardType?: string;
  floor?: number;
  availableBeds: number;
}

interface PopulatedWard {
  _id?: string;
  wardName?: string;
  floor?: number;
}

interface Room {
  roomNumber?: string;
  roomType?: string;
  wardId?: string | PopulatedWard | null;
}

interface Bed {
  _id: string;
  bedNumber: string;
  bedType?: string;
  status: string;
  roomId?: string | Room | null;
  pricePerDay?: number;
  dailyCharge?: number;
}

interface ApiResult<T> {
  success: boolean;
  data?: T;
  message?: string;
  matchingPatients?: PatientDuplicateMatch[];
  canConfirmSharedPhone?: boolean;
}

interface NewPatientForm {
  name: string;
  age: string;
  gender: string;
  contact: string;
}

const getBedWardId = (bed: Bed) => {
  const room = bed.roomId && typeof bed.roomId !== "string" ? bed.roomId : null;
  const ward = room?.wardId && typeof room.wardId !== "string" ? room.wardId : null;
  return ward?._id ?? "";
};

const bedTypeLabel = (bedType?: string) => {
  switch (bedType) {
    case "NORMAL":
      return "General";
    case "ELECTRIC":
      return "Electric";
    case "PEDIATRIC":
      return "Pediatric";
    case "ICU":
      return "ICU";
    default:
      return bedType || "General";
  }
};

const isRecordedBloodGroup = (value?: string | null) =>
  Boolean(value && ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].includes(value));

const admissionTypes = [
  { value: "EMERGENCY", label: "Emergency" },
  { value: "ELECTIVE", label: "Elective" },
  { value: "TRANSFER", label: "Transfer" },
  { value: "DAYCARE", label: "Daycare" },
] as const;

function InlineError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">
      <span>{message}</span>
      <Button type="button" variant="outline" size="sm" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}

export default function NewAdmissionPage() {
  const hospital = useHospitalProfile();
  const router = useRouter();
  const { toast } = useToast();
  const patientPickerRef = useRef<HTMLDivElement>(null);

  const [patients, setPatients] = useState<Patient[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [wards, setWards] = useState<Ward[]>([]);
  const [beds, setBeds] = useState<Bed[]>([]);
  const [patientsLoading, setPatientsLoading] = useState(true);
  const [doctorsLoading, setDoctorsLoading] = useState(true);
  const [wardsLoading, setWardsLoading] = useState(true);
  const [bedsLoading, setBedsLoading] = useState(true);
  const [patientsError, setPatientsError] = useState("");
  const [doctorsError, setDoctorsError] = useState("");
  const [wardsError, setWardsError] = useState("");
  const [bedsError, setBedsError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [patientSearch, setPatientSearch] = useState("");
  const [patientListOpen, setPatientListOpen] = useState(false);
  const [newPatientOpen, setNewPatientOpen] = useState(false);
  const [newPatientLoading, setNewPatientLoading] = useState(false);
  const [newPatient, setNewPatient] = useState<NewPatientForm>({
    name: "",
    age: "",
    gender: "MALE",
    contact: "",
  });
  const [duplicatePatients, setDuplicatePatients] = useState<PatientDuplicateMatch[]>([]);
  const [canConfirmSharedPhone, setCanConfirmSharedPhone] = useState(false);
  const [dateChanged, setDateChanged] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [formData, setFormData] = useState({
    patientId: "",
    doctorId: "",
    wardId: "",
    bedId: "",
    admissionDate: "",
    admissionType: "ELECTIVE",
    reasonForAdmission: "",
    notes: "",
  });

  const loadPatients = useCallback(async () => {
    setPatientsLoading(true);
    setPatientsError("");
    try {
      const response = await fetch("/api/admission/patients");
      const result = (await response.json()) as ApiResult<Patient[]>;
      if (!response.ok || !result.success) {
        throw new Error(result.message || "Could not load patients");
      }
      setPatients(result.data ?? []);
    } catch (error) {
      setPatientsError(error instanceof Error ? error.message : "Could not load patients");
    } finally {
      setPatientsLoading(false);
    }
  }, []);

  const loadDoctors = useCallback(async () => {
    setDoctorsLoading(true);
    setDoctorsError("");
    try {
      const response = await fetch("/api/user/directory?role=DOCTOR");
      const result = (await response.json()) as ApiResult<Doctor[]>;
      if (!response.ok || !result.success) {
        throw new Error(result.message || "Could not load doctors");
      }
      setDoctors((result.data ?? []).filter((doctor) => doctor.role?.toUpperCase() === "DOCTOR"));
    } catch (error) {
      setDoctorsError(error instanceof Error ? error.message : "Could not load doctors");
    } finally {
      setDoctorsLoading(false);
    }
  }, []);

  const loadWards = useCallback(async () => {
    setWardsLoading(true);
    setWardsError("");
    try {
      const response = await fetch("/api/admission/wards");
      const result = (await response.json()) as ApiResult<Ward[]>;
      if (!response.ok || !result.success) {
        throw new Error(result.message || "Could not load wards");
      }
      setWards(result.data ?? []);
    } catch (error) {
      setWardsError(error instanceof Error ? error.message : "Could not load wards");
    } finally {
      setWardsLoading(false);
    }
  }, []);

  const loadBeds = useCallback(async () => {
    setBedsLoading(true);
    setBedsError("");
    try {
      const response = await fetch("/api/bed?status=AVAILABLE");
      const result = (await response.json()) as ApiResult<Bed[]>;
      if (!response.ok || !result.success) {
        throw new Error(result.message || "Could not load available beds");
      }
      setBeds((result.data ?? []).filter((bed) => bed.status === "AVAILABLE"));
    } catch (error) {
      setBedsError(error instanceof Error ? error.message : "Could not load available beds");
    } finally {
      setBedsLoading(false);
    }
  }, []);

  const fetchAvailableBeds = useCallback(async () => {
    const response = await fetch("/api/bed?status=AVAILABLE", { cache: "no-store" });
    const result = (await response.json()) as ApiResult<Bed[]>;
    if (!response.ok || !result.success) {
      throw new Error(result.message || "Could not refresh bed availability");
    }
    return (result.data ?? []).filter((bed) => bed.status === "AVAILABLE");
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void Promise.all([loadPatients(), loadDoctors(), loadWards(), loadBeds()]);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadPatients, loadDoctors, loadWards, loadBeds]);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") void loadBeds();
    };
    const timer = window.setInterval(refresh, 15000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [loadBeds]);



  useEffect(() => {
    const closePatientListOnOutsideClick = (event: MouseEvent) => {
      if (
        event.target instanceof Node &&
        !patientPickerRef.current?.contains(event.target)
      ) {
        setPatientListOpen(false);
      }
    };
    document.addEventListener("mousedown", closePatientListOnOutsideClick);
    return () => {
      document.removeEventListener("mousedown", closePatientListOnOutsideClick);
    };
  }, []);

  const selectedPatient = useMemo(
    () => patients.find((patient) => patient._id === formData.patientId),
    [patients, formData.patientId],
  );
  const selectedWard = useMemo(
    () => wards.find((ward) => ward._id === formData.wardId),
    [wards, formData.wardId],
  );

  const filteredPatients = useMemo(() => {
    const query = patientSearch.trim().toLowerCase();
    if (!query) return patients.slice(0, 8);
    return patients
      .filter(
        (patient) =>
          patient.name.toLowerCase().includes(query) ||
          patient.uhid?.toLowerCase().includes(query) ||
          patient.contact.includes(query),
      )
      .slice(0, 8);
  }, [patients, patientSearch]);

  const bedsInWard = useMemo(
    () =>
      beds.filter(
        (bed) => bed.status === "AVAILABLE" && getBedWardId(bed) === formData.wardId,
      ),
    [beds, formData.wardId],
  );

  const missing = [
    !formData.patientId && "patient",
    !formData.doctorId && "doctor",
    !formData.bedId && "bed",
  ].filter((field): field is string => Boolean(field));

  const handleFieldChange = (
    event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = event.target;
    setFormData((previous) => ({ ...previous, [name]: value }));
  };

  const selectPatient = (patient: Patient) => {
    setFormData((previous) => ({ ...previous, patientId: patient._id }));
    setPatientSearch(patient.name);
    setPatientListOpen(false);
  };

  const handleCreatePatient = async (
    event?: React.FormEvent<HTMLFormElement>,
    sharedPhone?: { patient: PatientDuplicateMatch; relation: SharedPhoneRelation },
  ) => {
    event?.preventDefault();
    const emergencyRegistration = formData.admissionType === "EMERGENCY";
    setNewPatientLoading(true);
    try {
      const response = await fetch("/api/admission/patients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newPatient.name.trim(),
          age: Number(newPatient.age),
          gender: newPatient.gender,
          contact: newPatient.contact.trim(),
          emergencyRegistration,
          ...(sharedPhone ? { confirmSharedPhone: true, relatedPatientId: sharedPhone.patient._id, relation: sharedPhone.relation } : {}),
        }),
      });
      const result = (await response.json()) as ApiResult<Patient>;
      if (!response.ok || !result.success || !result.data) {
        if (response.status === 409 && result.matchingPatients) {
          setDuplicatePatients(result.matchingPatients);
          setCanConfirmSharedPhone(result.canConfirmSharedPhone === true);
          return;
        }
        throw new Error(result.message || "Failed to create patient");
      }
      setPatients((previous) => [result.data!, ...previous]);
      setDuplicatePatients([]);
      setCanConfirmSharedPhone(false);
      selectPatient(result.data);
      setNewPatient({ name: "", age: "", gender: "MALE", contact: "" });
      setNewPatientOpen(false);
      toast("Patient created and selected", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Failed to create patient", "error");
    } finally {
      setNewPatientLoading(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting || missing.length > 0) return;

    const admissionInstant = dateChanged && formData.admissionDate
      ? hospitalDateTimeInputToUtc(formData.admissionDate, hospital.timeZone)
      : new Date();
    if (!admissionInstant) {
      toast("Enter a valid admission date and time in the hospital time zone", "error");
      return;
    }

    setSubmitting(true);
    try {
      const availableBeds = await fetchAvailableBeds();
      setBeds(availableBeds);
      if (!availableBeds.some((bed) => bed._id === formData.bedId && getBedWardId(bed) === formData.wardId)) {
        setFormData((previous) => ({ ...previous, bedId: "" }));
        toast("That bed is no longer available. Choose another bed.", "error");
        return;
      }
      const response = await fetch("/api/admission", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId: formData.patientId,
          doctorId: formData.doctorId,
          bedId: formData.bedId,
          admissionDate: admissionInstant.toISOString(),
          admissionType: formData.admissionType,
          status: "ADMITTED",
          reasonForAdmission: formData.reasonForAdmission,
          notes: formData.notes,
        }),
      });
      const result = (await response.json()) as ApiResult<unknown>;
      if (!response.ok || !result.success) {
        throw new Error(result.message || "Failed to create admission");
      }
      toast("Patient admitted successfully", "success");
      router.push("/admissions/current");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Failed to create admission", "error");
      void loadBeds();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-3 pb-24">
      <header>
        <Link href="/admissions" className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-slate-200">
          <ArrowLeft className="h-4 w-4" /> Admissions
        </Link>
        <div className="mt-2 flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"><ClipboardPlus className="h-4 w-4" /></span>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-white">New Admission</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">Register patient and assign care.</p>
          </div>
          <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">Compact</Badge>
        </div>
      </header>

      <form onSubmit={handleSubmit}>
        <Card className="rounded-xl border-slate-200 shadow-sm dark:border-slate-800">
          <CardContent className="space-y-4 p-4 sm:p-5">
            <section className="space-y-2">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">1. Patient</h2>
              <div ref={patientPickerRef} className="relative">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <div className="relative min-w-0 flex-1">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <Input id="patientSearch" role="combobox" aria-label="Search patient by name, UHID, or phone" aria-expanded={patientListOpen} aria-controls="patient-options" aria-autocomplete="list" placeholder="Search by name, UHID, or phone" value={patientSearch} onFocus={() => setPatientListOpen(true)} onChange={(event) => { setPatientSearch(event.target.value); setPatientListOpen(true); setFormData((previous) => ({ ...previous, patientId: "" })); }} onKeyDown={(event) => { if (event.key === "Escape") setPatientListOpen(false); }} autoComplete="off" className="pl-9 focus-visible:ring-emerald-500" />
                    {patientListOpen && <div id="patient-options" role="listbox" className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                      {patientsLoading ? <div className="flex items-center gap-2 px-3 py-4 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading patients...</div> : filteredPatients.length ? filteredPatients.map((patient) => <button key={patient._id} type="button" role="option" aria-selected={patient._id === formData.patientId} onClick={() => selectPatient(patient)} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:hover:bg-emerald-950/40">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">{patient.name.trim().charAt(0).toUpperCase() || "?"}</span>
                        <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-slate-900 dark:text-white">{patient.name}</span><span className="block truncate text-xs text-slate-500">{patient.uhid || "No UHID"} · {patient.age} years · {patient.gender} · {patient.contact}</span></span>
                      </button>) : <p className="px-3 py-4 text-sm text-slate-500">{patientsError ? "Patient list unavailable" : "No matching patients"}</p>}
                    </div>}
                  </div>
                  <Button type="button" variant="outline" className="shrink-0 rounded-lg" onClick={() => setNewPatientOpen(true)}><UserPlus className="mr-2 h-4 w-4" /> New Patient</Button>
                </div>
              </div>
              {patientsError && <InlineError message={patientsError} onRetry={() => void loadPatients()} />}
              {selectedPatient && <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 dark:border-emerald-900 dark:bg-emerald-950/20">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2"><span className="font-semibold text-slate-900 dark:text-white">{selectedPatient.name}</span>{selectedPatient.uhid && <Badge variant="outline">{selectedPatient.uhid}</Badge>}{isRecordedBloodGroup(selectedPatient.bloodGroup) && <Badge variant="outline">Blood group: {selectedPatient.bloodGroup}</Badge>}</div>
                  <p className="text-xs text-slate-600 dark:text-slate-400">{selectedPatient.age} years · {selectedPatient.gender} · {selectedPatient.contact}</p>
                  {typeof selectedPatient.sharedPhoneWithPatientId === "object" && selectedPatient.sharedPhoneWithPatientId?.name && (
                    <p className="text-xs text-slate-500 dark:text-slate-400">Shares phone with: {selectedPatient.sharedPhoneWithPatientId.name} ({selectedPatient.sharedPhoneRelation})</p>
                  )}
                  {selectedPatient.allergies?.length ? <p role="alert" className="flex items-center gap-1.5 text-xs font-semibold text-rose-700 dark:text-rose-300"><Siren className="h-3.5 w-3.5" /> Allergy warning: {selectedPatient.allergies.join(", ")}</p> : <p className="text-xs text-slate-500 dark:text-slate-400">No allergies recorded</p>}
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => window.open(`/patients/profile?id=${selectedPatient._id}`, "_blank", "noopener,noreferrer")}>View Profile</Button>
              </div>}
            </section>

            <section className="space-y-2">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">2. Admission details</h2>
              {doctorsError && <InlineError message={doctorsError} onRetry={() => void loadDoctors()} />}
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="space-y-1.5"><Label htmlFor="doctorId">Attending doctor *</Label><Select id="doctorId" name="doctorId" value={formData.doctorId} onChange={handleFieldChange} disabled={doctorsLoading}><option value="">{doctorsLoading ? "Loading doctors..." : "Select doctor"}</option>{doctors.map((doctor) => { const detail = doctor.department || doctor.specialization; return <option key={doctor._id} value={doctor._id}>Dr. {doctor.name}{detail ? ` — ${detail}` : ""}</option>; })}</Select></div>
                <div className="space-y-1.5"><Label>Admission type *</Label><div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">{admissionTypes.map((type) => { const selected = formData.admissionType === type.value; return <button key={type.value} type="button" aria-pressed={selected} onClick={() => setFormData((previous) => ({ ...previous, admissionType: type.value }))} className={`flex min-h-10 items-center justify-between gap-1 rounded-lg border px-2.5 py-2 text-left text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${selected ? type.value === "EMERGENCY" ? "border-rose-500 bg-rose-50 text-rose-800 ring-1 ring-rose-400 dark:bg-rose-950/40 dark:text-rose-200" : "border-emerald-500 bg-emerald-50 text-emerald-900 ring-1 ring-emerald-500 dark:bg-emerald-950/40 dark:text-emerald-100" : "border-slate-200 bg-white text-slate-700 hover:border-emerald-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"}`}>{type.value === "EMERGENCY" && <Siren className="h-4 w-4" />}{type.label}{selected && <Check className="h-4 w-4" />}</button>; })}</div></div>
                <div className="space-y-1.5">{wardsError ? <InlineError message={wardsError} onRetry={() => void loadWards()} /> : <><Label htmlFor="wardId">Ward *</Label><Select id="wardId" name="wardId" value={formData.wardId} onChange={(event) => setFormData((previous) => ({ ...previous, wardId: event.target.value, bedId: "" }))} disabled={wardsLoading}><option value="">{wardsLoading ? "Loading wards..." : "Select ward"}</option>{wards.map((ward) => <option key={ward._id} value={ward._id} disabled={ward.availableBeds === 0}>{ward.wardName} ({ward.availableBeds} {ward.availableBeds === 1 ? "bed" : "beds"} free)</option>)}</Select></>}</div>
                <div className="space-y-1.5"><div className="flex items-center justify-between"><Label>Available bed *</Label>{bedsLoading && <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />}</div>{bedsError ? <InlineError message={bedsError} onRetry={() => void loadBeds()} /> : !formData.wardId ? <p className="rounded-lg border border-dashed border-slate-300 px-3 py-2.5 text-sm text-slate-500 dark:border-slate-700">Choose a ward to see available beds.</p> : bedsLoading ? <p className="flex items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-2.5 text-sm text-slate-500 dark:border-slate-700"><Loader2 className="h-4 w-4 animate-spin" /> Refreshing beds...</p> : bedsInWard.length ? <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{bedsInWard.map((bed) => { const selected = formData.bedId === bed._id; const room = bed.roomId && typeof bed.roomId !== "string" ? bed.roomId : null; const floor = selectedWard?.floor ?? (room?.wardId && typeof room.wardId !== "string" ? room.wardId.floor : undefined); return <button key={bed._id} type="button" aria-pressed={selected} onClick={() => setFormData((previous) => ({ ...previous, bedId: bed._id }))} className={`rounded-lg border p-2.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${selected ? "border-emerald-500 bg-emerald-50/70 ring-2 ring-emerald-500/30 dark:bg-emerald-950/30" : "border-slate-200 bg-white hover:border-emerald-300 dark:border-slate-700 dark:bg-slate-900"}`}><span className="flex items-center justify-between gap-1"><span className="font-semibold text-slate-900 dark:text-white">Bed {bed.bedNumber}</span>{selected ? <Check className="h-4 w-4 text-emerald-600" /> : <BedDouble className="h-4 w-4 text-slate-400" />}</span><span className="mt-1 block text-xs text-slate-500">Room {room?.roomNumber || "—"}{floor !== undefined ? ` · Floor ${floor}` : ""}</span><span className="mt-1 block text-[11px] text-emerald-700 dark:text-emerald-300">Available · {bedTypeLabel(bed.bedType)}</span></button>; })}</div> : <p className="rounded-lg border border-dashed border-slate-300 px-3 py-2.5 text-sm text-slate-500 dark:border-slate-700">No available beds in this ward. Choose another ward.</p>}</div>
              </div>
            </section>

            <section className="space-y-2">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">3. Reason and notes</h2>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2"><div className="space-y-1.5"><Label htmlFor="reasonForAdmission">Reason for admission</Label><Input id="reasonForAdmission" name="reasonForAdmission" value={formData.reasonForAdmission} onChange={handleFieldChange} placeholder="Enter reason for admission" /></div><div className="space-y-1.5"><Label htmlFor="notes">Notes (optional)</Label><Input id="notes" name="notes" value={formData.notes} onChange={handleFieldChange} placeholder="Optional note" /></div></div>
              {formData.admissionType === "EMERGENCY" && <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200"><Siren className="h-4 w-4 shrink-0" />Emergency selected. Patient name and phone may be added later.</div>}
            </section>

            <details open={advancedOpen} onToggle={(event) => setAdvancedOpen(event.currentTarget.open)} className="rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700">
              <summary className="cursor-pointer list-none text-sm font-medium text-slate-700 dark:text-slate-200">Advanced details <span className="font-normal text-slate-500">· admission date and time</span></summary>
              <div className="mt-3 max-w-sm space-y-1.5"><Label htmlFor="admissionDate">Admission date and time</Label><Input id="admissionDate" type="datetime-local" name="admissionDate" value={formData.admissionDate} onChange={(event) => { handleFieldChange(event); setDateChanged(true); }} /><p className="text-xs text-slate-500">Leave unchanged to use the current time.</p></div>
            </details>
            <p className="flex items-center gap-1.5 text-xs text-slate-500" aria-live="polite"><Info className="h-3.5 w-3.5" />{missing.length ? `Select a ${missing.join(", ")} to continue.` : "Ready to admit."} Bed availability refreshes every 15 seconds.</p>
          </CardContent>
        </Card>
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-lg backdrop-blur dark:border-slate-800 dark:bg-slate-950/95 sm:px-6">
          <div className="mx-auto flex max-w-7xl gap-2"><Button type="button" variant="outline" onClick={() => router.push("/admissions")} className="min-w-24">Cancel</Button><Button type="submit" disabled={submitting || missing.length > 0} className="min-w-0 flex-1 bg-emerald-600 text-white hover:bg-emerald-700">{submitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Confirming...</> : <><CheckCircle2 className="mr-2 h-4 w-4" /> Confirm Admission</>}</Button></div>
        </div>
      </form>
      <Dialog open={newPatientOpen} onOpenChange={setNewPatientOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Patient</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreatePatient} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="newPatientName">Full Name {formData.admissionType === "EMERGENCY" ? "(optional for emergency)" : "*"}</Label>
              <Input
                id="newPatientName"
                required={formData.admissionType !== "EMERGENCY"}
                value={newPatient.name}
                onChange={(event) => setNewPatient((previous) => ({ ...previous, name: event.target.value }))}
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="newPatientAge">Age *</Label>
                <Input
                  id="newPatientAge"
                  type="number"
                  min="0"
                  max="140"
                  required
                  value={newPatient.age}
                  onChange={(event) => setNewPatient((previous) => ({ ...previous, age: event.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="newPatientGender">Gender *</Label>
                <Select
                  id="newPatientGender"
                  value={newPatient.gender}
                  onChange={(event) => setNewPatient((previous) => ({ ...previous, gender: event.target.value }))}
                >
                  <option value="MALE">Male</option>
                  <option value="FEMALE">Female</option>
                  <option value="OTHER">Other</option>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
                <Label htmlFor="newPatientPhone">Phone {formData.admissionType === "EMERGENCY" ? "(optional for emergency)" : "*"}</Label>
              <Input
                id="newPatientPhone"
                type="tel"
                required={formData.admissionType !== "EMERGENCY"}
                value={newPatient.contact}
                onChange={(event) => setNewPatient((previous) => ({ ...previous, contact: event.target.value }))}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setNewPatientOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={newPatientLoading}
                className="bg-emerald-600 text-white hover:bg-emerald-700"
              >
                {newPatientLoading ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</>
                ) : (
                  "Create Patient"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <PatientDuplicateDialog
        patients={duplicatePatients}
        canConfirmSharedPhone={canConfirmSharedPhone}
        onClose={() => { setDuplicatePatients([]); setCanConfirmSharedPhone(false); }}
        onConfirmSharedPhone={(patient, relation) => void handleCreatePatient(undefined, { patient, relation })}
      />
    </div>
  );
}
