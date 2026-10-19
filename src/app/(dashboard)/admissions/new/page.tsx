"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowLeftRight,
  BedDouble,
  CalendarCheck,
  Check,
  CheckCircle2,
  Clock3,
  ClipboardPlus,
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
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";

interface Patient {
  _id: string;
  name: string;
  uhid?: string;
  age: number;
  gender: string;
  contact: string;
  bloodGroup?: string | null;
  allergies?: string[];
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
}

interface NewPatientForm {
  name: string;
  age: string;
  gender: string;
  contact: string;
}

const toLocalInput = (date = new Date()) =>
  new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);

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
  {
    value: "EMERGENCY",
    label: "Emergency",
    hint: "Emergency / Casualty",
    icon: Siren,
  },
  {
    value: "ELECTIVE",
    label: "Elective",
    hint: "Planned admission",
    icon: CalendarCheck,
  },
  {
    value: "TRANSFER",
    label: "Transfer",
    hint: "Referred from another facility",
    icon: ArrowLeftRight,
  },
  {
    value: "DAYCARE",
    label: "Daycare",
    hint: "Short stay procedure",
    icon: Clock3,
  },
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
  const [canManageBeds, setCanManageBeds] = useState(false);
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
  const [localNow, setLocalNow] = useState<Date | null>(null);
  const [dateChanged, setDateChanged] = useState(false);
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

  useEffect(() => {
    void Promise.all([loadPatients(), loadDoctors(), loadWards(), loadBeds()]);
    void fetch("/api/me/permissions")
      .then(async (response) => {
        if (!response.ok) return;
        const result = (await response.json()) as ApiResult<{
          isSuperAdmin?: boolean;
          roleName?: string;
        }>;
        const roleName = result.data?.roleName?.toLowerCase() ?? "";
        setCanManageBeds(Boolean(result.data?.isSuperAdmin || roleName.includes("admin")));
      })
      .catch(() => undefined);
    setLocalNow(new Date());
  }, [loadPatients, loadDoctors, loadWards, loadBeds]);

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
  const selectedDoctor = useMemo(
    () => doctors.find((doctor) => doctor._id === formData.doctorId),
    [doctors, formData.doctorId],
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

  const handleCreatePatient = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
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
        }),
      });
      const result = (await response.json()) as ApiResult<Patient>;
      if (!response.ok || !result.success || !result.data) {
        throw new Error(result.message || "Failed to create patient");
      }
      setPatients((previous) => [result.data!, ...previous]);
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

    setSubmitting(true);
    try {
      const response = await fetch("/api/admission", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId: formData.patientId,
          doctorId: formData.doctorId,
          bedId: formData.bedId,
          admissionDate: dateChanged
            ? new Date(formData.admissionDate).toISOString()
            : new Date().toISOString(),
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
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5 pb-10">
      <header>
        <Link
          href="/admissions"
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-slate-200"
        >
          <ArrowLeft className="h-4 w-4" /> Admissions
        </Link>
        <div className="mt-3 flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
            <ClipboardPlus className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Admit New Patient
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Assign a patient, attending doctor, and available bed.
            </p>
          </div>
        </div>
      </header>

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          <Card className="rounded-2xl border-slate-200 shadow-sm dark:border-slate-800">
            <CardContent className="space-y-6 p-5 sm:p-6">
              <section className="space-y-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                  Patient
                </p>
                <div ref={patientPickerRef} className="relative">
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <div className="relative min-w-0 flex-1">
                      <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                      <Input
                        id="patientSearch"
                        role="combobox"
                        aria-label="Search patient by name, UHID, or phone"
                        aria-expanded={patientListOpen}
                        aria-controls="patient-options"
                        aria-autocomplete="list"
                        placeholder="Search name, UHID, or phone"
                        value={patientSearch}
                        onFocus={() => setPatientListOpen(true)}
                        onChange={(event) => {
                          setPatientSearch(event.target.value);
                          setPatientListOpen(true);
                          setFormData((previous) => ({ ...previous, patientId: "" }));
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Escape") setPatientListOpen(false);
                        }}
                        autoComplete="off"
                        className="pl-9 transition focus-visible:ring-emerald-500"
                      />
                      {patientListOpen && (
                        <div
                          id="patient-options"
                          role="listbox"
                          className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl dark:border-slate-700 dark:bg-slate-900"
                        >
                          {patientsLoading ? (
                            <div className="flex items-center gap-2 px-3 py-4 text-sm text-slate-500">
                              <Loader2 className="h-4 w-4 animate-spin" /> Loading patients...
                            </div>
                          ) : filteredPatients.length ? (
                            filteredPatients.map((patient) => (
                              <button
                                key={patient._id}
                                type="button"
                                role="option"
                                aria-selected={patient._id === formData.patientId}
                                onClick={() => selectPatient(patient)}
                                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:hover:bg-emerald-950/40"
                              >
                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
                                  {patient.name.trim().charAt(0).toUpperCase() || "?"}
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-sm font-medium text-slate-900 dark:text-white">
                                    {patient.name}
                                  </span>
                                  <span className="block truncate text-xs text-slate-500">
                                    {patient.uhid || "No UHID"} · {patient.age} years · {patient.gender} · {patient.contact}
                                  </span>
                                </span>
                              </button>
                            ))
                          ) : (
                            <p className="px-3 py-4 text-sm text-slate-500">
                              {patientsError ? "Patient list unavailable" : "No matching patients"}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      className="shrink-0 rounded-lg"
                      onClick={() => setNewPatientOpen(true)}
                    >
                      <UserPlus className="mr-2 h-4 w-4" /> New Patient
                    </Button>
                  </div>
                </div>

                {patientsError && <InlineError message={patientsError} onRetry={() => void loadPatients()} />}

                {selectedPatient && (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3.5 dark:border-emerald-900 dark:bg-emerald-950/20">
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-slate-900 dark:text-white">
                          {selectedPatient.name}
                        </span>
                        {selectedPatient.uhid && (
                          <Badge variant="outline">{selectedPatient.uhid}</Badge>
                        )}
                        {isRecordedBloodGroup(selectedPatient.bloodGroup) ? (
                          <Badge variant="outline" className="border-emerald-200 text-emerald-800 dark:border-emerald-800 dark:text-emerald-200">
                            Blood group: {selectedPatient.bloodGroup}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-slate-500">
                            Blood group not recorded
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-400">
                        {selectedPatient.age} years · {selectedPatient.gender} · {selectedPatient.contact}
                      </p>
                      {selectedPatient.allergies?.length ? (
                        <p className="text-xs font-medium text-rose-600 dark:text-rose-400">
                          Allergies: {selectedPatient.allergies.join(", ")}
                        </p>
                      ) : null}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        window.open(`/patients/profile?id=${selectedPatient._id}`, "_blank", "noopener,noreferrer")
                      }
                    >
                      View Full Profile
                    </Button>
                  </div>
                )}
              </section>

              <div className="border-t border-slate-100 dark:border-slate-800" />

              <section className="space-y-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                  Clinical
                </p>
                {doctorsError && <InlineError message={doctorsError} onRetry={() => void loadDoctors()} />}
                <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="doctorId">Doctor *</Label>
                      <Select
                        id="doctorId"
                        name="doctorId"
                        value={formData.doctorId}
                        onChange={handleFieldChange}
                        disabled={doctorsLoading}
                      >
                        <option value="">
                          {doctorsLoading ? "Loading doctors..." : "Select doctor"}
                        </option>
                        {doctors.map((doctor) => {
                          const detail = doctor.department || doctor.specialization;
                          return (
                            <option key={doctor._id} value={doctor._id}>
                              Dr. {doctor.name}{detail ? ` — ${detail}` : ""}
                            </option>
                          );
                        })}
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Admission type *</Label>
                      <div className="grid grid-cols-2 gap-2">
                        {admissionTypes.map((type) => {
                          const Icon = type.icon;
                          const selected = formData.admissionType === type.value;
                          return (
                            <button
                              key={type.value}
                              type="button"
                              aria-pressed={selected}
                              onClick={() => setFormData((previous) => ({ ...previous, admissionType: type.value }))}
                              className={`min-h-[76px] rounded-xl border p-3 text-left transition hover:border-emerald-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${selected ? "border-emerald-500 bg-emerald-50 text-emerald-900 ring-1 ring-emerald-500 dark:bg-emerald-950/40 dark:text-emerald-100" : "border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"}`}
                            >
                              <span className="flex items-center gap-2 text-sm font-semibold">
                                <Icon className="h-4 w-4" /> {type.label}
                                {selected && <Check className="ml-auto h-4 w-4" />}
                              </span>
                              <span className="mt-1 block text-[11px] leading-4 opacity-75">
                                {type.hint}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                </div>
              </section>

              <div className="border-t border-slate-100 dark:border-slate-800" />

              <section className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                    Bed
                  </p>
                  {wardsLoading && <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />}
                </div>
                {wardsError ? (
                  <InlineError message={wardsError} onRetry={() => void loadWards()} />
                ) : (
                  <div className="space-y-1.5">
                    <Label htmlFor="wardId">Ward *</Label>
                    <Select
                      id="wardId"
                      name="wardId"
                      value={formData.wardId}
                      onChange={(event) =>
                        setFormData((previous) => ({
                          ...previous,
                          wardId: event.target.value,
                          bedId: "",
                        }))
                      }
                      disabled={wardsLoading}
                    >
                      <option value="">{wardsLoading ? "Loading wards..." : "Select ward"}</option>
                      {wards.map((ward) => (
                        <option key={ward._id} value={ward._id} disabled={ward.availableBeds === 0}>
                          {ward.wardName} ({ward.availableBeds} {ward.availableBeds === 1 ? "bed" : "beds"} free)
                        </option>
                      ))}
                    </Select>
                    {!wardsLoading && wards.length === 0 && !wardsError && (
                      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/70 p-4 dark:border-slate-700 dark:bg-slate-900/50">
                        <p className="text-sm font-medium text-slate-800 dark:text-slate-200">No wards set up yet.</p>
                        {canManageBeds ? (
                          <Link href="/wards/list" className="mt-2 inline-flex text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-300">Create Ward</Link>
                        ) : (
                          <p className="mt-1 text-xs text-slate-500">Please ask the administrator to set up wards and beds.</p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {!wardsLoading && !wardsError && wards.length > 0 && wards.every((ward) => ward.availableBeds === 0) && (
                  <p className="rounded-lg border border-dashed border-slate-300 px-3 py-4 text-sm text-slate-500 dark:border-slate-700">
                    No wards have free beds right now. Please contact the ward in-charge.
                    {canManageBeds && (
                      <Link href="/wards/beds" className="ml-1 font-medium text-emerald-700 hover:underline dark:text-emerald-300">
                        Manage beds
                      </Link>
                    )}
                  </p>
                )}

                {bedsError ? (
                  <InlineError message={bedsError} onRetry={() => void loadBeds()} />
                ) : !bedsLoading && formData.wardId && bedsInWard.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-slate-300 px-3 py-4 text-sm text-slate-500 dark:border-slate-700">
                    No free beds in this ward. Try another ward.
                    {canManageBeds && (
                      <Link href="/wards/beds" className="ml-1 font-medium text-emerald-700 hover:underline dark:text-emerald-300">
                        Manage beds
                      </Link>
                    )}
                  </p>
                ) : bedsLoading ? (
                  <div className="flex items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-4 text-sm text-slate-500 dark:border-slate-700">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading beds...
                  </div>
                ) : null}

                {!bedsError && !bedsLoading && bedsInWard.length > 0 && (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                    {bedsInWard.map((bed) => {
                      const selected = formData.bedId === bed._id;
                      const room = bed.roomId && typeof bed.roomId !== "string" ? bed.roomId : null;
                      const roomWard = room?.wardId && typeof room.wardId !== "string" ? room.wardId : null;
                      const floor = selectedWard?.floor ?? roomWard?.floor;
                      const charge = bed.pricePerDay ?? bed.dailyCharge;
                      return (
                        <button
                          key={bed._id}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => setFormData((previous) => ({ ...previous, bedId: bed._id }))}
                          className={`rounded-xl border p-3 text-left transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${selected ? "border-emerald-500 bg-emerald-50/70 ring-2 ring-emerald-500/30 dark:bg-emerald-950/30" : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"}`}
                        >
                          <span className="flex items-start justify-between gap-2">
                            <span className="text-base font-bold text-slate-900 dark:text-white">
                              Bed {bed.bedNumber}
                            </span>
                            <span className="flex items-center gap-1">
                              <Badge variant="outline" className="shrink-0">{bedTypeLabel(bed.bedType)}</Badge>
                              {selected && <Check className="h-4 w-4 text-emerald-600" />}
                            </span>
                          </span>
                          <span className="mt-2 block text-xs text-slate-500 dark:text-slate-400">
                            Room {room?.roomNumber || "—"}{floor !== undefined ? ` · Floor ${floor}` : ""}
                          </span>
                          {typeof charge === "number" && (
                            <span className="mt-1 block text-xs text-slate-500">
                              ₹{charge.toLocaleString()} / day
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>

              <div className="border-t border-slate-100 dark:border-slate-800" />

              <section className="space-y-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Notes</p>
                <div className="space-y-1.5">
                  <Label htmlFor="reasonForAdmission">Reason (optional)</Label>
                  <Input
                    id="reasonForAdmission"
                    name="reasonForAdmission"
                    value={formData.reasonForAdmission}
                    onChange={handleFieldChange}
                    placeholder="Reason for admission"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="notes">Notes (optional)</Label>
                  <Textarea
                    id="notes"
                    name="notes"
                    rows={2}
                    value={formData.notes}
                    onChange={handleFieldChange}
                    placeholder="Additional admission notes"
                  />
                </div>
              </section>

              <div className="flex flex-col-reverse items-end justify-between gap-3 border-t border-slate-100 pt-4 dark:border-slate-800 sm:flex-row sm:items-center">
                <p className="text-xs text-slate-500" aria-live="polite">
                  {missing.length ? `Select a ${missing.join(", ")} to continue.` : "Ready to admit."}
                </p>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={() => router.push("/admissions")}>
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={submitting || missing.length > 0}
                    className="min-w-[170px] bg-emerald-600 text-white hover:bg-emerald-700"
                  >
                    {submitting ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Admitting...</>
                    ) : (
                      <><CheckCircle2 className="mr-2 h-4 w-4" /> Complete Admission</>
                    )}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-slate-200 shadow-sm dark:border-slate-800 lg:sticky lg:top-4">
            <CardContent className="space-y-5 p-5">
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                  <BedDouble className="h-4 w-4" />
                </span>
                <div>
                  <h2 className="font-semibold text-slate-900 dark:text-white">Admission Summary</h2>
                  <p className="text-xs text-slate-500">Review before completing</p>
                </div>
              </div>

              <div className="space-y-3 text-sm">
                <SummaryItem label="Patient" value={selectedPatient ? `${selectedPatient.name}${selectedPatient.uhid ? ` · ${selectedPatient.uhid}` : ""}` : "Not selected"} />
                <SummaryItem label="Doctor" value={selectedDoctor ? `Dr. ${selectedDoctor.name}${selectedDoctor.department ? ` · ${selectedDoctor.department}` : ""}` : "Not selected"} />
                <div className="flex items-center justify-between gap-3">
                  <span className="shrink-0 text-xs text-slate-500">Type</span>
                  <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
                    {admissionTypes.find((type) => type.value === formData.admissionType)?.label || "Elective"}
                  </Badge>
                </div>
                <SummaryItem label="Ward" value={selectedWard?.wardName || "Not selected"} />
                <SummaryItem
                  label="Bed"
                  value={bedsInWard.find((bed) => bed._id === formData.bedId)?.bedNumber
                    ? `Bed ${bedsInWard.find((bed) => bed._id === formData.bedId)?.bedNumber}`
                    : "Not selected"}
                />
                <SummaryItem
                  label="Admission time"
                  value={dateChanged && formData.admissionDate
                    ? new Date(formData.admissionDate).toLocaleString()
                    : localNow?.toLocaleString() || "Now"}
                />
              </div>

              <div className="border-t border-slate-100 pt-4 dark:border-slate-800">
                <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                  Admission checklist
                </p>
                <ul className="space-y-2">
                  {[
                    ["Patient selected", Boolean(formData.patientId)],
                    ["Doctor assigned", Boolean(formData.doctorId)],
                    ["Available bed selected", Boolean(formData.bedId)],
                  ].map(([label, complete]) => (
                    <li key={String(label)} className="flex items-center gap-2 text-xs">
                      <span className={`flex h-5 w-5 items-center justify-center rounded-full ${complete ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "bg-slate-100 text-slate-400 dark:bg-slate-800"}`}>
                        {complete ? <Check className="h-3 w-3" /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
                      </span>
                      <span className={complete ? "text-slate-700 dark:text-slate-300" : "text-slate-500"}>
                        {String(label)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-lg bg-slate-50 px-3 py-2.5 text-xs text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
                {dateChanged ? (
                  <div className="flex items-center gap-2">
                    <Input
                      aria-label="Admission date and time"
                      type="datetime-local"
                      name="admissionDate"
                      value={formData.admissionDate}
                      onChange={handleFieldChange}
                      required
                      className="h-8"
                    />
                  </div>
                ) : (
                  <span className="flex items-center justify-between gap-2">
                    <span>Admitting now · local time</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-emerald-700 dark:text-emerald-300"
                      onClick={() => {
                        const now = new Date();
                        setLocalNow(now);
                        setFormData((previous) => ({ ...previous, admissionDate: toLocalInput(now) }));
                        setDateChanged(true);
                      }}
                    >
                      Change
                    </Button>
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </form>

      <Dialog open={newPatientOpen} onOpenChange={setNewPatientOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Patient</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreatePatient} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="newPatientName">Full Name *</Label>
              <Input
                id="newPatientName"
                required
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
              <Label htmlFor="newPatientPhone">Phone *</Label>
              <Input
                id="newPatientPhone"
                type="tel"
                required
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
    </div>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="shrink-0 text-xs text-slate-500">{label}</span>
      <span className="text-right text-xs font-medium text-slate-800 dark:text-slate-200">
        {value}
      </span>
    </div>
  );
}
