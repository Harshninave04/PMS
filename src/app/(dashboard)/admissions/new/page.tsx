"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RegisterNewPatientButton } from "@/components/admissions/register-new-patient-button";
import { useToast } from "@/components/ui/toast";
import { AlertTriangle, ArrowLeft, Bed, CheckCircle2, Loader2, Search, Shield, User, UserPlus } from "lucide-react";
import {
  AdmissionFormValues,
  buildAdmissionCreatePayload,
  buildQuickPatientPayload,
  filterAdmissionPatients,
  filterAvailableAdmissionBeds
} from "@/lib/admission-form";

interface PatientOption {
  _id: string;
  name: string;
  uhid?: string;
  gender?: string;
  age?: number;
  contact?: string;
  bloodGroup?: string;
  allergies?: string[];
  emergencyContact?: string;
}

interface BedOption {
  _id: string;
  bedNumber: string;
  bedType: string;
  status: string;
  roomId?: {
    roomNumber?: string;
    wardId?: { wardName?: string; wardType?: string } | string;
  } | string;
}

const WARD_TYPES = ["GENERAL", "SEMI_PRIVATE", "PRIVATE", "ICU", "EMERGENCY"];
const WARD_LABELS: Record<string, string> = {
  GENERAL: "General",
  SEMI_PRIVATE: "Semi-Private",
  PRIVATE: "Private",
  ICU: "ICU",
  EMERGENCY: "Emergency"
};

const EMPTY_FORM: AdmissionFormValues = {
  patientId: "",
  doctorId: "",
  bedId: "",
  admissionDate: new Date().toISOString().slice(0, 16),
  admissionType: "ELECTIVE",
  wardType: "GENERAL",
  admissionSource: "DIRECT",
  paymentType: "CASH",
  advanceDeposit: "",
  consentSigned: false,
  reasonForAdmission: "",
  notes: "",
  emergencyContactName: "",
  emergencyContactPhone: "",
  emergencyContactRelation: "",
  insuranceProvider: "",
  insurancePolicyNumber: ""
};

function idOf(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "_id" in value) return String((value as { _id: unknown })._id || "");
  return "";
}

export default function NewAdmissionPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [doctors, setDoctors] = useState<any[]>([]);
  const [beds, setBeds] = useState<BedOption[]>([]);
  const [formData, setFormData] = useState<AdmissionFormValues>(EMPTY_FORM);
  const [patientSearch, setPatientSearch] = useState("");
  const [patientDropdownOpen, setPatientDropdownOpen] = useState(false);
  const [emergencyMode, setEmergencyMode] = useState(false);
  const [admissionError, setAdmissionError] = useState("");
  const [registerOpen, setRegisterOpen] = useState(false);
  const [registeringPatient, setRegisteringPatient] = useState(false);
  const [patientError, setPatientError] = useState("");
  const [quickPatient, setQuickPatient] = useState({ name: "", age: "", gender: "MALE", phone: "" });

  useEffect(() => {
    async function fetchData() {
      try {
        const [patientResponse, doctorResponse, bedResponse] = await Promise.all([
          fetch("/api/patient"),
          fetch("/api/user/directory"),
          fetch("/api/bed")
        ]);
        const [patientData, doctorData, bedData] = await Promise.all([
          patientResponse.json(), doctorResponse.json(), bedResponse.json()
        ]);
        if (patientResponse.ok) setPatients(patientData.data || []);
        if (doctorResponse.ok) setDoctors(doctorData.data || []);
        if (bedResponse.ok) setBeds(bedData.data || []);
      } catch {
        toast("Failed to load patient, doctor, and bed data", "error");
      } finally {
        setInitialLoading(false);
      }
    }
    fetchData();
  }, [toast]);

  const selectedPatient = useMemo(
    () => patients.find((patient) => patient._id === formData.patientId),
    [patients, formData.patientId]
  );
  const matchingPatients = useMemo(
    () => filterAdmissionPatients(patients, patientSearch),
    [patients, patientSearch]
  );
  const availableBeds = useMemo(
    () => filterAvailableAdmissionBeds(beds, formData.wardType),
    [beds, formData.wardType]
  );
  const selectedPatientLabel = selectedPatient
    ? `${selectedPatient.name}${selectedPatient.uhid ? ` [${selectedPatient.uhid}]` : ""} - ${selectedPatient.contact || "No phone"}`
    : "";

  const handleChange = (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = event.target;
    setFormData((previous) => ({
      ...previous,
      [name]: value,
      ...(name === "wardType" ? { bedId: "" } : {})
    }));
  };

  const selectPatient = (patient: PatientOption) => {
    setFormData((previous) => ({
      ...previous,
      patientId: patient._id,
      emergencyContactName: patient.emergencyContact || previous.emergencyContactName,
      emergencyContactPhone: patient.contact || previous.emergencyContactPhone
    }));
    setPatientSearch("");
    setPatientDropdownOpen(false);
    setAdmissionError("");
  };

  const openPatientRegistration = () => {
    setPatientError("");
    setPatientDropdownOpen(false);
    setRegisterOpen(true);
  };

  const openEmergencyAdmission = () => {
    setEmergencyMode(true);
    setFormData((previous) => ({ ...previous, admissionType: "EMERGENCY", admissionSource: "EMERGENCY" }));
    setAdmissionError("");
  };

  const registerNewPatient = async (event: React.FormEvent) => {
    event.preventDefault();
    setPatientError("");
    if (!quickPatient.name.trim() || !quickPatient.age || !quickPatient.phone.trim()) {
      setPatientError("Name, age, and phone are required.");
      return;
    }
    const age = Number(quickPatient.age);
    if (!Number.isInteger(age) || age < 0) {
      setPatientError("Enter a valid age.");
      return;
    }

    setRegisteringPatient(true);
    try {
      let branchId = idOf(session?.user?.branch);
      if (!branchId) {
        const organizationResponse = await fetch("/api/org");
        const organizationData = await organizationResponse.json();
        branchId = idOf(organizationData.data?.[0]);
      }
      if (!branchId) {
        setPatientError("A hospital branch is required to register this patient.");
        return;
      }

      const response = await fetch("/api/patient", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildQuickPatientPayload(quickPatient, branchId))
      });
      const result = await response.json();
      if (!response.ok || !result.success || !result.data?._id) {
        setPatientError(result.message || "Failed to register patient.");
        return;
      }

      const createdPatient = result.data as PatientOption;
      setPatients((previous) => [createdPatient, ...previous]);
      setFormData((previous) => ({
        ...previous,
        patientId: createdPatient._id,
        emergencyContactName: createdPatient.emergencyContact || "",
        emergencyContactPhone: createdPatient.contact || quickPatient.phone
      }));
      setRegisterOpen(false);
      setQuickPatient({ name: "", age: "", gender: "MALE", phone: "" });
      toast(`Patient registered${createdPatient.uhid ? ` (${createdPatient.uhid})` : ""}`, "success");
    } catch (error) {
      setPatientError(error instanceof Error ? error.message : "Failed to register patient.");
    } finally {
      setRegisteringPatient(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setAdmissionError("");
    if (!formData.patientId) {
      setAdmissionError("Select a patient to admit.");
      return;
    }
    if (!formData.doctorId) {
      setAdmissionError("Select an attending doctor.");
      return;
    }
    if (!formData.bedId) {
      setAdmissionError("Select an available bed for the chosen ward.");
      return;
    }
    if (!emergencyMode && !formData.admissionDate) {
      setAdmissionError("Admission date and time are required.");
      return;
    }
    if (formData.advanceDeposit.trim() && (!Number.isFinite(Number(formData.advanceDeposit)) || Number(formData.advanceDeposit) < 0)) {
      setAdmissionError("Advance deposit must be a non-negative amount.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/admission", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildAdmissionCreatePayload(formData, emergencyMode))
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        const message = result.message || "Failed to create admission.";
        setAdmissionError(message);
        toast(message, "error");
        return;
      }

      toast(`Patient admitted successfully${result.data?.ipdNumber ? ` · ${result.data.ipdNumber}` : ""}`, "success");
      router.push("/admissions/current");
    } catch (error) {
      const message = error instanceof Error ? error.message : "An error occurred while creating admission.";
      setAdmissionError(message);
      toast(message, "error");
    } finally {
      setLoading(false);
    }
  };

  if (initialLoading) {
    return <div className="flex h-[450px] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-emerald-600" /></div>;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-12">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-slate-500" onClick={() => router.push("/admissions")}>
            <ArrowLeft className="mr-1 h-4 w-4" /> Admissions
          </Button>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            <UserPlus className="h-6 w-6 text-emerald-600 dark:text-emerald-400" /> New Patient Admission
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Assign a patient, attending doctor, ward, and available bed.</p>
        </div>
        <div className="flex items-center gap-2">
          {emergencyMode && <Badge className="bg-rose-100 text-rose-800">Emergency mode</Badge>}
          <Button type="button" variant={emergencyMode ? "outline" : "destructive"} onClick={() => {
            if (emergencyMode) {
              setEmergencyMode(false);
              setFormData((previous) => ({
                ...previous,
                admissionType: previous.admissionType === "EMERGENCY" ? "ELECTIVE" : previous.admissionType,
                admissionSource: previous.admissionSource === "EMERGENCY" ? "DIRECT" : previous.admissionSource
              }));
            } else {
              openEmergencyAdmission();
            }
          }}>
            {emergencyMode ? "Exit Emergency Mode" : "Emergency Admission"}
          </Button>
        </div>
      </div>

      {admissionError && (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {admissionError}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <Card className="relative z-50 overflow-visible border shadow-sm">
          <CardHeader className="border-b pb-3">
            <CardTitle className="flex items-center gap-2 text-base"><User className="h-4 w-4 text-emerald-600" /> 1. Patient Information</CardTitle>
            <CardDescription>Select an existing patient or register a new patient.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 overflow-visible pt-4">
            <div className="grid grid-cols-1 gap-3">
              <div className="relative z-[60] space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label htmlFor="patientId">Select Patient *</Label>
                  <RegisterNewPatientButton onClick={openPatientRegistration} className="shrink-0" />
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <Input
                    id="patientId"
                    role="combobox"
                    aria-expanded={patientDropdownOpen}
                    aria-controls="admission-patient-options"
                    aria-autocomplete="list"
                    placeholder="Search by patient name, UHID, or phone"
                    value={patientDropdownOpen ? patientSearch : selectedPatientLabel || patientSearch}
                    onFocus={() => {
                      setPatientSearch("");
                      setPatientDropdownOpen(true);
                    }}
                    onChange={(event) => {
                      setPatientSearch(event.target.value);
                      setFormData((previous) => ({ ...previous, patientId: "" }));
                    }}
                    onBlur={() => setTimeout(() => setPatientDropdownOpen(false), 120)}
                    className="pl-9"
                  />
                </div>
                {patientDropdownOpen && (
                  <div id="admission-patient-options" role="listbox" className="absolute left-0 top-full z-[100] mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
                    {matchingPatients.length ? matchingPatients.map((patient) => (
                      <button
                        key={patient._id}
                        type="button"
                        role="option"
                        aria-selected={patient._id === formData.patientId}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => selectPatient(patient)}
                        className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-emerald-50 dark:hover:bg-slate-800"
                      >
                        <span className="font-medium">{patient.name}</span>
                        <span className="ml-2 text-xs text-slate-500">{patient.uhid || "No UHID"} · {patient.contact || "No phone"}</span>
                      </button>
                    )) : (
                      <div className="space-y-2 px-2 py-2">
                        <p className="px-1 text-sm text-slate-500">No patients found.</p>
                        <RegisterNewPatientButton onClick={openPatientRegistration} className="w-full justify-center" />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {selectedPatient && (
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 dark:border-emerald-800/50 dark:bg-emerald-950/20">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-base font-bold text-slate-900 dark:text-white">{selectedPatient.name}</span>
                    {selectedPatient.uhid && <Badge variant="outline">{selectedPatient.uhid}</Badge>}
                    <Badge className="bg-emerald-600 text-white">Blood Group: {selectedPatient.bloodGroup || "N/A"}</Badge>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400">Age: {selectedPatient.age} · Gender: {selectedPatient.gender} · Phone: {selectedPatient.contact}</p>
                  {!!selectedPatient.allergies?.length && <p className="flex items-center gap-1 text-xs font-medium text-rose-600"><AlertTriangle className="h-3 w-3" /> Allergies: {selectedPatient.allergies.join(", ")}</p>}
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => window.open(`/patients/profile?id=${selectedPatient._id}`, "_blank")}>View Full Profile</Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border shadow-sm">
          <CardHeader className="border-b pb-3">
            <CardTitle className="flex items-center gap-2 text-base"><Bed className="h-4 w-4 text-emerald-600" /> 2. Ward, Bed & Admission Details</CardTitle>
            <CardDescription>Choose the ward type first; only available beds in that ward are listed.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 pt-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="wardType">Ward Type *</Label>
              <Select id="wardType" name="wardType" value={formData.wardType} onChange={handleChange} required>
                {WARD_TYPES.map((wardType) => <option key={wardType} value={wardType}>{WARD_LABELS[wardType]}</option>)}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bedId">Available Bed * ({availableBeds.length})</Label>
              <Select id="bedId" name="bedId" value={formData.bedId} onChange={handleChange} required>
                <option value="">-- Select Available Bed --</option>
                {availableBeds.map((bed) => {
                  const room = typeof bed.roomId === "object" && bed.roomId ? bed.roomId : undefined;
                  const ward = room && typeof room.wardId === "object" && room.wardId ? room.wardId : undefined;
                  return <option key={bed._id} value={bed._id}>Bed {bed.bedNumber} ({bed.bedType}) · Room {room?.roomNumber || "General"}{ward?.wardName ? ` · ${ward.wardName}` : ""}</option>;
                })}
              </Select>
              {!availableBeds.length && <p className="text-xs text-rose-600">No beds of this ward type are currently marked AVAILABLE.</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="doctorId">Attending Doctor *</Label>
              <Select id="doctorId" name="doctorId" value={formData.doctorId} onChange={handleChange} required>
                <option value="">-- Choose Attending Doctor --</option>
                {doctors.map((doctor) => <option key={doctor._id} value={doctor._id}>Dr. {doctor.name} ({doctor.email})</option>)}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="admissionDate">Admission Date & Time {!emergencyMode && "*"}</Label>
              <Input type="datetime-local" id="admissionDate" name="admissionDate" value={formData.admissionDate} onChange={handleChange} required={!emergencyMode} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="admissionType">Admission Type *</Label>
              <Select id="admissionType" name="admissionType" value={emergencyMode ? "EMERGENCY" : formData.admissionType} onChange={handleChange} required disabled={emergencyMode}>
                <option value="ELECTIVE">Elective / Planned Admission</option>
                <option value="EMERGENCY">Emergency / Casualty</option>
                <option value="TRANSFER">Transfer from Other Facility</option>
                <option value="DAYCARE">Daycare Procedure</option>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="admissionSource">Admission Source</Label>
              <Select id="admissionSource" name="admissionSource" value={emergencyMode ? "EMERGENCY" : formData.admissionSource} onChange={handleChange} disabled={emergencyMode}>
                <option value="OPD">OPD</option>
                <option value="EMERGENCY">Emergency</option>
                <option value="REFERRAL">Referral</option>
                <option value="DIRECT">Direct</option>
              </Select>
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="reasonForAdmission">Reason for Admission</Label>
              <Input id="reasonForAdmission" name="reasonForAdmission" placeholder="Reason for admission (optional)" value={formData.reasonForAdmission} onChange={handleChange} />
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <Card className="border shadow-sm">
            <CardHeader className="border-b pb-3">
              <CardTitle className="flex items-center gap-2 text-base"><User className="h-4 w-4 text-emerald-600" /> 3. Relative / Attendant</CardTitle>
              <CardDescription>Optional relative or attendant contact details.</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 pt-4">
              <div className="space-y-1.5"><Label htmlFor="emergencyContactName">Name</Label><Input id="emergencyContactName" name="emergencyContactName" value={formData.emergencyContactName} onChange={handleChange} placeholder="Relative / attendant name" /></div>
              <div className="space-y-1.5"><Label htmlFor="emergencyContactPhone">Phone</Label><Input id="emergencyContactPhone" name="emergencyContactPhone" value={formData.emergencyContactPhone} onChange={handleChange} placeholder="Contact phone number" /></div>
              <div className="space-y-1.5"><Label htmlFor="emergencyContactRelation">Relationship</Label><Input id="emergencyContactRelation" name="emergencyContactRelation" value={formData.emergencyContactRelation} onChange={handleChange} placeholder="e.g. Spouse, Parent" /></div>
            </CardContent>
          </Card>

          <Card className="border shadow-sm">
            <CardHeader className="border-b pb-3">
              <CardTitle className="flex items-center gap-2 text-base"><Shield className="h-4 w-4 text-emerald-600" /> 4. Payment & Insurance</CardTitle>
              <CardDescription>Record the payment category, optional deposit, and consent.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5"><Label htmlFor="paymentType">Payment Type</Label><Select id="paymentType" name="paymentType" value={formData.paymentType} onChange={handleChange}><option value="CASH">Cash</option><option value="INSURANCE">Insurance</option><option value="CORPORATE">Corporate</option></Select></div>
                <div className="space-y-1.5"><Label htmlFor="advanceDeposit">Advance Deposit (optional)</Label><Input id="advanceDeposit" name="advanceDeposit" type="number" min="0" step="0.01" value={formData.advanceDeposit} onChange={handleChange} placeholder="0.00" /></div>
              </div>
              {formData.paymentType === "INSURANCE" && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5"><Label htmlFor="insuranceProvider">Insurance Provider / TPA</Label><Input id="insuranceProvider" name="insuranceProvider" value={formData.insuranceProvider} onChange={handleChange} placeholder="Provider / TPA" /></div>
                  <div className="space-y-1.5"><Label htmlFor="insurancePolicyNumber">Policy / Card Number</Label><Input id="insurancePolicyNumber" name="insurancePolicyNumber" value={formData.insurancePolicyNumber} onChange={handleChange} placeholder="Policy number" /></div>
                </div>
              )}
              <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                <input type="checkbox" checked={formData.consentSigned} onChange={(event) => setFormData((previous) => ({ ...previous, consentSigned: event.target.checked }))} className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" />
                Consent signed
              </label>
              {emergencyMode && <p className="text-xs text-amber-700 dark:text-amber-300">Emergency admission will be marked consent pending until consent is signed.</p>}
              <div className="space-y-1.5"><Label htmlFor="admittedBy">Admitted By</Label><Input id="admittedBy" value={session?.user?.name || "Signed-in user"} readOnly aria-readonly="true" /></div>
            </CardContent>
          </Card>
        </div>

        <Card className="border shadow-sm">
          <CardHeader className="border-b pb-3"><CardTitle className="text-base">5. Admission Remarks</CardTitle></CardHeader>
          <CardContent className="pt-4">
            <Label htmlFor="notes">Admission Remarks</Label>
            <Textarea id="notes" name="notes" rows={3} placeholder="Special instructions, dietary requirements, etc." value={formData.notes} onChange={handleChange} />
          </CardContent>
        </Card>

        <div className="flex items-center justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={() => router.push("/admissions/current")}>Cancel</Button>
          <Button type="submit" disabled={loading || availableBeds.length === 0} className="min-w-[160px] bg-emerald-600 text-white hover:bg-emerald-700">
            {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Admitting...</> : <><CheckCircle2 className="mr-2 h-4 w-4" /> Complete Admission</>}
          </Button>
        </div>
      </form>

      <Dialog open={registerOpen} onOpenChange={setRegisterOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Register New Patient</DialogTitle>
            <DialogDescription>Enter basic details. The patient will be selected for this admission after registration.</DialogDescription>
          </DialogHeader>
          <form onSubmit={registerNewPatient} className="space-y-4">
            {patientError && <p role="alert" className="rounded-md bg-rose-50 p-2 text-sm text-rose-700 dark:bg-rose-950/30 dark:text-rose-200">{patientError}</p>}
            <div className="space-y-1.5"><Label htmlFor="quickPatientName">Name *</Label><Input id="quickPatientName" value={quickPatient.name} onChange={(event) => setQuickPatient((previous) => ({ ...previous, name: event.target.value }))} required autoFocus /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label htmlFor="quickPatientAge">Age *</Label><Input id="quickPatientAge" type="number" min="0" step="1" value={quickPatient.age} onChange={(event) => setQuickPatient((previous) => ({ ...previous, age: event.target.value }))} required /></div>
              <div className="space-y-1.5"><Label htmlFor="quickPatientGender">Gender *</Label><Select id="quickPatientGender" value={quickPatient.gender} onChange={(event) => setQuickPatient((previous) => ({ ...previous, gender: event.target.value }))}><option value="MALE">Male</option><option value="FEMALE">Female</option><option value="OTHER">Other</option></Select></div>
            </div>
            <div className="space-y-1.5"><Label htmlFor="quickPatientPhone">Phone *</Label><Input id="quickPatientPhone" type="tel" value={quickPatient.phone} onChange={(event) => setQuickPatient((previous) => ({ ...previous, phone: event.target.value }))} required /></div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRegisterOpen(false)} disabled={registeringPatient}>Cancel</Button>
              <Button type="submit" disabled={registeringPatient} className="bg-emerald-600 text-white hover:bg-emerald-700">
                {registeringPatient ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Registering...</> : "Register & Select"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
