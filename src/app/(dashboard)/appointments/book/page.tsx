"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import {
  Calendar as CalendarIcon,
  Clock,
  User,
  Stethoscope,
  Building2,
  FileText,
  CreditCard,
  CheckCircle2,
  AlertCircle,
  Plus,
  Search,
  Sparkles,
  Loader2,
  Phone,
  ShieldCheck,
  PlusCircle,
} from "lucide-react";
import { usePermissions } from "@/components/permissions/permission-context";
import { PatientDuplicateDialog, type PatientDuplicateMatch } from "@/components/patients/patient-duplicate-dialog";

const QUICK_COMPLAINTS = [
  "General Checkup",
  "High Fever & Chills",
  "Chest Pain / Palpitations",
  "Severe Headache / Migraine",
  "Hypertension Follow-up",
  "Joint & Back Pain",
  "Diabetes Monitoring",
  "Post-Op Review",
  "Cough & Cold",
];

export default function BookAppointmentPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { canAny } = usePermissions();
  const canCreateAdmission = canAny("admissions.new:view", "admissions.new:create");
  const [loading, setLoading] = useState(false);
  const [fetchingDeps, setFetchingDeps] = useState(true);

  const [patients, setPatients] = useState<any[]>([]);
  const [doctors, setDoctors] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [selectedDept, setSelectedDept] = useState("");
  const [confirmed, setConfirmed] = useState<any>(null);
  const [duplicatePatients, setDuplicatePatients] = useState<PatientDuplicateMatch[]>([]);

  // Registration mode: 'existing' or 'new'
  const [patientMode, setPatientMode] = useState<"existing" | "new">("existing");
  const [patientSearch, setPatientSearch] = useState("");
  const [debouncedPatientSearch, setDebouncedPatientSearch] = useState("");
  const [patientListOpen, setPatientListOpen] = useState(false);
  const patientSearchRef = useRef<HTMLDivElement>(null);

  const [formData, setFormData] = useState({
    // Existing Patient
    patientId: "",
    // New Patient
    patientName: "",
    contact: "",
    patientAge: "32",
    patientGender: "MALE",
    patientBloodGroup: "O+",
    patientAddress: "",

    // Appointment info
    doctorId: "",
    appointmentDate: new Date().toISOString().split("T")[0],
    type: "NEW" as "NEW" | "FOLLOW_UP" | "EMERGENCY" | "ROUTINE_CHECKUP",
    priority: "NORMAL" as "NORMAL" | "URGENT" | "EMERGENCY",
    reason: "",
    notes: "",
    consultationFee: 500,
    paymentStatus: "PAID" as "PAID" | "PENDING" | "WAIVED",
    paymentMode: "CASH",
  });

  useEffect(() => {
    async function loadDependencies() {
      try {
        setFetchingDeps(true);
        const [pRes, dRes, deptRes] = await Promise.all([
          fetch("/api/patient"),
          fetch("/api/doctor"),
          fetch("/api/department"),
        ]);
        const pJson = await pRes.json();
        const dJson = await dRes.json();
        const deptJson = await deptRes.json();

        if (pJson.success && pJson.data) {
          setPatients(pJson.data);
        }
        if (dJson.success && dJson.data) {
          setDoctors(dJson.data);
        }
        if (deptJson.success && deptJson.data) {
          setDepartments(deptJson.data);
        }
      } catch (err) {
        console.error("Failed to load appointment dependencies", err);
      } finally {
        setFetchingDeps(false);
      }
    }
    loadDependencies();
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedPatientSearch(patientSearch);
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [patientSearch]);

  useEffect(() => {
    if (!patientListOpen) return;

    const closeOnOutsideClick = (event: MouseEvent) => {
      if (event.target instanceof Node && !patientSearchRef.current?.contains(event.target)) {
        setPatientListOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPatientListOpen(false);
    };

    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [patientListOpen]);

  // Filtered patient list for debounced lookup
  const filteredPatients = useMemo(() => {
    const q = debouncedPatientSearch.trim().toLowerCase();
    if (!q) return [];
    return patients.filter(
      (p) =>
        p.name?.toLowerCase().includes(q) ||
        p.contact?.toLowerCase().includes(q) ||
        p.uhid?.toLowerCase().includes(q)
    );
  }, [patients, debouncedPatientSearch]);

  // When doctor changes, update consultation fee and keep department in sync
  const handleDoctorChange = (docId: string) => {
    const doc = doctors.find((d) => d._id === docId);
    setFormData((prev) => ({
      ...prev,
      doctorId: docId,
      consultationFee: doc?.consultationFee || prev.consultationFee,
    }));
    const deptId = doc?.departmentId?._id;
    if (deptId) setSelectedDept(deptId);
  };

  // Department is selected first; changing it clears the doctor and doctor fee.
  const handleDepartmentChange = (deptId: string) => {
    setSelectedDept(deptId);
    setFormData((prev) => ({ ...prev, doctorId: "", consultationFee: 500 }));
  };

  const filteredDoctors = useMemo(() => {
    if (!selectedDept) return [];
    return doctors.filter((d) => d.departmentId?._id === selectedDept);
  }, [doctors, selectedDept]);

  const selectedPatientObj = patients.find((p) => p._id === formData.patientId);
  const selectedDoctorObj = doctors.find((d) => d._id === formData.doctorId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (patientMode === "existing" && !formData.patientId) {
      toast({ title: "Validation Error", description: "Please select a patient.", variant: "destructive" });
      return;
    }
    const emergencyRegistration = formData.priority === "EMERGENCY";
    if (patientMode === "new" && !emergencyRegistration && (!formData.patientName.trim() || !formData.contact.trim())) {
      toast({ title: "Validation Error", description: "Patient name and contact are required.", variant: "destructive" });
      return;
    }
    if (!formData.doctorId) {
      toast({ title: "Validation Error", description: "Please select a consulting doctor.", variant: "destructive" });
      return;
    }
    if (!formData.reason) {
      toast({ title: "Validation Error", description: "Please specify chief complaint or reason for visit.", variant: "destructive" });
      return;
    }

    try {
      setLoading(true);
      const payload: any = {
        doctorId: formData.doctorId,
        appointmentDate: formData.appointmentDate,
        type: formData.type,
        priority: formData.priority,
        reason: formData.reason,
        notes: formData.notes,
        consultationFee: Number(formData.consultationFee),
        paymentStatus: formData.paymentStatus,
        paymentMode: formData.paymentMode,
        emergencyRegistration,
      };

      if (patientMode === "existing") {
        payload.patientId = formData.patientId;
      } else {
        payload.patientName = formData.patientName;
        payload.contact = formData.contact;
        payload.patientAge = formData.patientAge;
        payload.patientGender = formData.patientGender;
        payload.patientBloodGroup = formData.patientBloodGroup;
        payload.patientAddress = formData.patientAddress;
      }

      const res = await fetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setConfirmed(data.data);
        toast({
          title: "Appointment Booked!",
          description: `Token ${data.data?.tokenNumber || "Assigned"} confirmed for ${
            data.data?.patientId?.name || "Patient"
          }.`,
        });
      } else {
        if (res.status === 409 && Array.isArray(data.matchingPatients)) {
          setDuplicatePatients(data.matchingPatients);
          return;
        }
        toast({
          title: "Booking Failed",
          description: data.error || "Unable to complete booking.",
          variant: "destructive",
        });
      }
    } catch (err: any) {
      toast({ title: "Booking Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleBookAnother = () => {
    setConfirmed(null);
    setPatientMode("existing");
    setPatientSearch("");
    setDebouncedPatientSearch("");
    setPatientListOpen(false);
    setSelectedDept("");
    setFormData({
      patientId: "",
      patientName: "",
      contact: "",
      patientAge: "32",
      patientGender: "MALE",
      patientBloodGroup: "O+",
      patientAddress: "",
      doctorId: "",
      appointmentDate: new Date().toISOString().split("T")[0],
      type: "NEW",
      priority: "NORMAL",
      reason: "",
      notes: "",
      consultationFee: 500,
      paymentStatus: "PAID",
      paymentMode: "CASH",
    });
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Book Patient Appointment
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Schedule outpatient consultation, assign daily token, and record triage details.
          </p>
        </div>
        <Button variant="outline" onClick={() => router.push("/appointments/list")}>
          View All Appointments
        </Button>
      </div>

      {fetchingDeps ? (
        <div className="flex justify-center items-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
        </div>
      ) : confirmed ? (
        /* Booking Confirmation: token issued, patient queued */
        <Card className="border-emerald-200 dark:border-emerald-800/60 max-w-2xl mx-auto shadow-sm">
          <CardHeader className="text-center bg-emerald-50/60 dark:bg-emerald-950/30 border-b border-emerald-100 dark:border-emerald-900 pb-4">
            <div className="flex justify-center mb-2">
              <CheckCircle2 className="h-10 w-10 text-emerald-600" />
            </div>
            <CardTitle className="text-lg">Appointment Confirmed</CardTitle>
            <CardDescription>
              Token issued. The patient has been added to today&apos;s OPD waiting queue.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6 space-y-5">
            <div className="text-center">
              <p className="text-[11px] uppercase tracking-widest text-slate-500 font-semibold">Token Number</p>
              <p className="text-5xl font-black font-mono text-emerald-600 dark:text-emerald-400 mt-1">
                {confirmed.tokenNumber || "T-???"}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm border-t border-slate-100 dark:border-slate-800 pt-4">
              <div className="flex justify-between sm:block">
                <span className="text-[11px] uppercase tracking-wider text-slate-500">Patient</span>
                <p className="font-semibold text-slate-900 dark:text-white mt-0.5">
                  {confirmed.patientId?.name || "Patient"}
                </p>
              </div>
              <div className="flex justify-between sm:block">
                <span className="text-[11px] uppercase tracking-wider text-slate-500">Doctor</span>
                <p className="font-semibold text-slate-900 dark:text-white mt-0.5">
                  Dr. {confirmed.doctorId?.userId?.name || confirmed.doctorId?.name || "Doctor"}
                </p>
              </div>
              <div className="flex justify-between sm:block">
                <span className="text-[11px] uppercase tracking-wider text-slate-500">Department</span>
                <p className="font-semibold text-slate-900 dark:text-white mt-0.5">
                  {confirmed.doctorId?.departmentId?.name || "OPD"}
                </p>
              </div>
              <div className="flex justify-between sm:block">
                <span className="text-[11px] uppercase tracking-wider text-slate-500">Date</span>
                <p className="font-semibold text-slate-900 dark:text-white mt-0.5">
                  {new Date(confirmed.appointmentDate).toLocaleDateString()}
                </p>
              </div>
              <div className="flex justify-between sm:block">
                <span className="text-[11px] uppercase tracking-wider text-slate-500">Priority</span>
                <div className="mt-0.5">
                  <Badge
                    variant={
                      confirmed.priority === "EMERGENCY"
                        ? "destructive"
                        : confirmed.priority === "URGENT"
                        ? "default"
                        : "secondary"
                    }
                    className="text-[10px]"
                  >
                    {confirmed.priority || "NORMAL"}
                  </Badge>
                </div>
              </div>
              <div className="flex justify-between sm:block">
                <span className="text-[11px] uppercase tracking-wider text-slate-500">Status</span>
                <div className="mt-0.5">
                  <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 border border-amber-200 dark:border-amber-800 text-[10px] font-bold">
                    {confirmed.queueStatus || "WAITING"}
                  </Badge>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <Button onClick={handleBookAnother} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2">
                <Plus className="h-4 w-4" /> Book Another Appointment
              </Button>
              <Button variant="outline" onClick={() => router.push("/appointments/queue")}>
                View Queue
              </Button>
              <Button variant="outline" onClick={() => router.push("/appointments/list")}>
                All Appointments
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Booking Form (2 Columns) */}
          <div className="lg:col-span-2 space-y-6">
            {/* Step 1: Patient Selection */}
            <Card className="relative z-40 overflow-visible border-slate-200/80 dark:border-slate-800 shadow-sm">
              <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800/80">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-100 dark:bg-emerald-950 text-emerald-600 font-semibold text-xs">
                      1
                    </div>
                    <CardTitle className="text-base">Patient Information</CardTitle>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {canCreateAdmission && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 rounded-lg border-red-300 bg-white px-2.5 text-xs text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-800 dark:bg-slate-950 dark:text-red-400 dark:hover:bg-red-950/40 dark:hover:text-red-300"
                        onClick={() => router.push("/admissions/new")}
                      >
                        <PlusCircle className="mr-1.5 h-3.5 w-3.5" />
                        Emergency Patient
                      </Button>
                    )}
                    <div className="flex h-7 items-center rounded-lg border border-slate-200 dark:border-slate-800 p-0.5 bg-slate-100 dark:bg-slate-800 text-xs">
                      <button
                        type="button"
                        onClick={() => setPatientMode("new")}
                        className={`px-3 py-1 rounded-md transition-colors ${
                          patientMode === "new"
                            ? "bg-white dark:bg-slate-900 font-medium shadow-xs text-emerald-600 dark:text-emerald-400"
                            : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
                        }`}
                      >
                        Regular Patient
                      </button>
                      <button
                        type="button"
                        onClick={() => setPatientMode("existing")}
                        className={`px-3 py-1 rounded-md transition-colors ${
                          patientMode === "existing"
                            ? "bg-white dark:bg-slate-900 font-medium shadow-xs text-emerald-600 dark:text-emerald-400"
                            : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
                        }`}
                      >
                        Registered Patient
                      </button>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                {patientMode === "existing" ? (
                  selectedPatientObj ? (
                    <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-lg border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
                      <div>
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          {selectedPatientObj.name}
                        </span>
                        <span className="text-slate-500 ml-2">
                          ({selectedPatientObj.gender}, {selectedPatientObj.age} yrs, Blood: {selectedPatientObj.bloodGroup})
                        </span>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          UHID: <span className="font-mono">{selectedPatientObj.uhid || "UHID-Pending"}</span> | Phone: {selectedPatientObj.contact}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="default" className="text-[10px]">Verified</Badge>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setFormData((prev) => ({ ...prev, patientId: "" }));
                            setPatientSearch("");
                            setDebouncedPatientSearch("");
                            setPatientListOpen(false);
                          }}
                        >
                          Change
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <Label htmlFor="patientSearch">Search Registered Patient *</Label>
                      <div ref={patientSearchRef} className="relative">
                        <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                        <Input
                          id="patientSearch"
                          role="combobox"
                          aria-label="Search patient by name, phone, or UHID"
                          aria-expanded={patientListOpen && Boolean(patientSearch.trim())}
                          aria-controls="appointment-patient-options"
                          aria-autocomplete="list"
                          placeholder="Search patient by Name, Phone, or UHID..."
                          value={patientSearch}
                          onFocus={() => setPatientListOpen(true)}
                          onKeyDown={(event) => {
                            if (event.key === "Escape") setPatientListOpen(false);
                          }}
                          onChange={(e) => {
                            setPatientSearch(e.target.value);
                            setPatientListOpen(true);
                            setFormData((prev) => ({ ...prev, patientId: "" }));
                          }}
                          className="pl-9 text-xs"
                        />
                        {patientListOpen && patientSearch.trim() && (
                          <div
                            id="appointment-patient-options"
                            role="listbox"
                            className="absolute left-0 right-0 top-full z-50 mt-1 max-h-[280px] overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl dark:border-slate-700 dark:bg-slate-900"
                          >
                            {patientSearch.trim() !== debouncedPatientSearch.trim() ? (
                              <div className="px-3 py-3 text-sm text-slate-500" role="status">
                                Searching patients...
                              </div>
                            ) : filteredPatients.length > 0 ? (
                              filteredPatients.map((patient) => (
                                <button
                                  key={patient._id}
                                  type="button"
                                  role="option"
                                  aria-selected={false}
                                  onClick={() => {
                                    setFormData((prev) => ({ ...prev, patientId: patient._id }));
                                    setPatientSearch("");
                                    setDebouncedPatientSearch("");
                                    setPatientListOpen(false);
                                  }}
                                  className="w-full rounded-lg px-3 py-2 text-left transition hover:bg-slate-100 dark:hover:bg-slate-800"
                                >
                                  <span className="block text-sm font-medium text-slate-900 dark:text-slate-100">
                                    {patient.name}
                                    <span className="ml-2 text-xs font-normal text-slate-500">
                                      {patient.gender}, {patient.age} yrs
                                    </span>
                                  </span>
                                  <span className="mt-0.5 block text-xs text-slate-500">
                                    UHID: {patient.uhid || "UHID-Pending"} | Phone: {patient.contact || "Not recorded"}
                                  </span>
                                </button>
                              ))
                            ) : (
                              <div className="px-3 py-3 text-sm text-slate-500" role="status">
                                No patient found
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                ) : (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label>Full Name {formData.priority === "EMERGENCY" ? "(optional for emergency)" : "*"}</Label>
                        <Input
                          placeholder="e.g. Ramesh Kumar"
                          value={formData.patientName}
                          onChange={(e) => setFormData({ ...formData, patientName: e.target.value })}
                          required={patientMode === "new" && formData.priority !== "EMERGENCY"}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>Phone Number {formData.priority === "EMERGENCY" ? "(optional for emergency)" : "*"}</Label>
                        <Input
                          placeholder="+91 9876543210"
                          value={formData.contact}
                          onChange={(e) => setFormData({ ...formData, contact: e.target.value })}
                          required={patientMode === "new" && formData.priority !== "EMERGENCY"}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <Label>Age *</Label>
                        <Input
                          type="number"
                          min="1"
                          max="120"
                          value={formData.patientAge}
                          onChange={(e) => setFormData({ ...formData, patientAge: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>Gender</Label>
                        <select
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                          value={formData.patientGender}
                          onChange={(e) => setFormData({ ...formData, patientGender: e.target.value })}
                        >
                          <option value="MALE">Male</option>
                          <option value="FEMALE">Female</option>
                          <option value="OTHER">Other</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        <Label>Blood Group</Label>
                        <select
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                          value={formData.patientBloodGroup}
                          onChange={(e) => setFormData({ ...formData, patientBloodGroup: e.target.value })}
                        >
                          {["O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"].map((b) => (
                            <option key={b} value={b}>{b}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <Label>Address / City</Label>
                      <Input
                        placeholder="Residential locality or city"
                        value={formData.patientAddress}
                        onChange={(e) => setFormData({ ...formData, patientAddress: e.target.value })}
                      />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Step 2: Doctor, Department & Date */}
            <Card className="border-slate-200/80 dark:border-slate-800 shadow-sm">
              <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800/80">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-100 dark:bg-blue-950 text-blue-600 font-semibold text-xs">
                    2
                  </div>
                  <CardTitle className="text-base">Department, Doctor, Date & Type</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                <div className="space-y-1.5">
                  <Label>Department *</Label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={selectedDept}
                    onChange={(e) => handleDepartmentChange(e.target.value)}
                    required
                  >
                    <option value="">-- Choose Department --</option>
                    {departments.map((dept) => (
                      <option key={dept._id} value={dept._id}>
                        {dept.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>Consulting Doctor *</Label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={formData.doctorId}
                    onChange={(e) => handleDoctorChange(e.target.value)}
                    disabled={!selectedDept}
                    required
                  >
                    <option value="">-- Choose Doctor --</option>
                    {filteredDoctors.map((d) => (
                      <option key={d._id} value={d._id}>
                        Dr. {d.userId?.name || "Doctor"} • {d.specialization || d.departmentId?.name || "Physician"} • Room {d.roomNumber || "OPD"} • Fee: ₹{d.consultationFee || 500}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Appointment Date *</Label>
                    <Input
                      type="date"
                      required
                      min={new Date().toISOString().split("T")[0]}
                      value={formData.appointmentDate}
                      onChange={(e) => setFormData({ ...formData, appointmentDate: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Consultation Type</Label>
                    <select
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      value={formData.type}
                      onChange={(e) => setFormData({ ...formData, type: e.target.value as any })}
                    >
                      <option value="NEW">New Patient Consultation</option>
                      <option value="EMERGENCY">Emergency / Priority</option>
                      <option value="ROUTINE_CHECKUP">Routine Health Checkup</option>
                    </select>
                  </div>

                  {/* <div className="space-y-1.5">
                    <Label>Priority Level</Label>
                    <select
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      value={formData.priority}
                      onChange={(e) => setFormData({ ...formData, priority: e.target.value as any })}
                    >
                      <option value="NORMAL">Normal Priority</option>
                      <option value="URGENT">Urgent</option>
                      <option value="EMERGENCY">Emergency</option>
                    </select>
                  </div> */}
                </div>
              </CardContent>
            </Card>

            {/* Step 3: Chief Complaints & Clinical Notes */}
            <Card className="border-slate-200/80 dark:border-slate-800 shadow-sm">
              <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800/80">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-md bg-purple-100 dark:bg-purple-950 text-purple-600 font-semibold text-xs">
                    3
                  </div>
                  <CardTitle className="text-base">Chief Complaint & Clinical Notes</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                <div className="space-y-1.5">
                  <Label>Primary Reason / Symptoms *</Label>
                  <Input
                    required
                    placeholder="e.g. Fever, chest congestion, back pain"
                    value={formData.reason}
                    onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                  />
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {QUICK_COMPLAINTS.map((c) => (
                      <button
                        type="button"
                        key={c}
                        onClick={() => setFormData({ ...formData, reason: c })}
                        className="text-[11px] bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-slate-600 dark:text-slate-400 hover:bg-slate-200 hover:text-slate-800 dark:hover:bg-slate-700"
                      >
                        + {c}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>Additional Clinical Notes (Optional)</Label>
                  <textarea
                    rows={3}
                    className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    placeholder="Known allergies, existing medication, triage observations..."
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Column: Billing & Summary Card */}
          <div className="space-y-6">
            <Card className="border-slate-200/80 dark:border-slate-800 shadow-sm sticky top-6">
              <CardHeader className="bg-slate-50/50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800/80 pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="h-4 w-4 text-emerald-600" />
                  Booking Summary Receipt
                </CardTitle>
                <CardDescription>Live appointment validation & fee summary</CardDescription>
              </CardHeader>
              <CardContent className="p-5 space-y-4">
                {/* Doctor Preview */}
                <div className="p-3 bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-800/40 rounded-xl">
                  <div className="text-xs text-emerald-800 dark:text-emerald-300 font-semibold uppercase tracking-wider">
                    Attending Physician
                  </div>
                  <div className="font-bold text-slate-900 dark:text-white mt-1">
                    Dr. {selectedDoctorObj?.userId?.name || "Select Doctor"}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {selectedDoctorObj?.specialization || "General Specialist"} • {selectedDoctorObj?.departmentId?.name || "OPD"}
                  </div>
                  <div className="text-xs text-slate-600 dark:text-slate-400 mt-1 flex items-center gap-1">
                    <span>Room:</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {selectedDoctorObj?.roomNumber || "OPD-101"}
                    </span>
                  </div>
                </div>

                {/* Patient Preview */}
                <div className="space-y-2 text-xs border-y border-slate-100 dark:border-slate-800 py-3">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Patient:</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {patientMode === "existing"
                        ? selectedPatientObj?.name || "Not selected"
                        : formData.patientName || "New Patient"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Date:</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">{formData.appointmentDate}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Department:</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {selectedDoctorObj?.departmentId?.name || "OPD"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Type:</span>
                    <Badge variant="outline" className="text-[10px] uppercase">
                      {formData.type}
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Priority:</span>
                    <Badge
                      variant={
                        formData.priority === "EMERGENCY"
                          ? "destructive"
                          : formData.priority === "URGENT"
                          ? "default"
                          : "secondary"
                      }
                      className="text-[10px]"
                    >
                      {formData.priority}
                    </Badge>
                  </div>
                </div>

                {/* Billing Section */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Consultation Fee (₹)</Label>
                    <Input
                      type="number"
                      min="0"
                      className="w-24 h-8 text-right font-bold text-xs"
                      value={formData.consultationFee}
                      onChange={(e) => setFormData({ ...formData, consultationFee: Number(e.target.value) })}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-[11px]">Payment Mode</Label>
                      <select
                        className="flex h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                        value={formData.paymentMode}
                        onChange={(e) => setFormData({ ...formData, paymentMode: e.target.value })}
                      >
                        <option value="CASH">Cash</option>
                        <option value="CARD">Debit/Credit Card</option>
                        <option value="UPI">UPI / QR Code</option>
                        <option value="INSURANCE">Insurance</option>
                        <option value="PAY_AT_CLINIC">Pay at Counter</option>
                      </select>
                    </div>

                    <div>
                      <Label className="text-[11px]">Payment Status</Label>
                      <select
                        className="flex h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                        value={formData.paymentStatus}
                        onChange={(e) => setFormData({ ...formData, paymentStatus: e.target.value as any })}
                      >
                        <option value="PAID">Paid</option>
                        <option value="PENDING">Pending</option>
                        {/* <option value="WAIVED">Waived / Free</option> */}
                      </select>
                    </div>
                  </div>
                </div>

                <div className="pt-2">
                  <Button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white gap-2 font-medium"
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    Confirm & Issue Token
                  </Button>
                  <p className="text-[11px] text-center text-slate-400 mt-2">
                    Generates daily queue token and sends booking SMS alert.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </form>
      )}
      <PatientDuplicateDialog
        patients={duplicatePatients}
        onClose={() => setDuplicatePatients([])}
        onSelect={(patient) => {
          setPatients((current) => [patient, ...current.filter((item) => item._id !== patient._id)]);
          setPatientMode("existing");
          setFormData((current) => ({ ...current, patientId: patient._id }));
          setPatientSearch(patient.name);
          setDebouncedPatientSearch(patient.name);
        }}
      />
    </div>
  );
}
