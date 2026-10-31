"use client";

import React, { useEffect, useState, useMemo, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { MedicineAutocomplete } from "@/components/pharmacy/medicine-autocomplete";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useHospitalProfile } from "@/components/hospital-profile/hospital-profile-context";
import { formatHospitalDateTime, formatLengthOfStay, hospitalDateTimeInputToUtc, toHospitalDateTimeInput } from "@/lib/hospital-date";
import {
  LogOut,
  Bed,
  Search,
  Plus,
  Trash2,
  CheckCircle2,
  Calendar,
  Clock,
  User,
  AlertCircle,
  RefreshCw,
  Loader2
} from "lucide-react";

interface MedicationItem {
  medicineName: string;
  isCatalogueMedicine: boolean | null;
  dosage: string;
  frequency: string;
  duration: string;
  instructions: string;
}

export default function DischargePage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-[450px] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
        </div>
      }
    >
      <DischargeContent />
    </Suspense>
  );
}

function DischargeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialAdmissionId = searchParams.get("admissionId") || "";
  const { toast } = useToast();
  const hospital = useHospitalProfile();

  const [admissions, setAdmissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  // Discharge Dialog State
  const [dischargeOpen, setDischargeOpen] = useState(false);
  const [selectedAdmission, setSelectedAdmission] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const activeSummaryAdmissionId = React.useRef("");

  // Form Fields
  const [dischargeDate, setDischargeDate] = useState("");
  const [dischargeCondition, setDischargeCondition] = useState("");
  const [finalDiagnosis, setFinalDiagnosis] = useState("");
  const [dischargeSummary, setDischargeSummary] = useState("");
  const [followUpDate, setFollowUpDate] = useState("");
  const [followUpInstructions, setFollowUpInstructions] = useState("");
  const [dischargeAdvice, setDischargeAdvice] = useState("");
  const [medications, setMedications] = useState<MedicationItem[]>([]);

  useEffect(() => {
    setDischargeDate(toHospitalDateTimeInput(new Date(), hospital.timeZone));
  }, [hospital.timeZone]);

  const fetchAdmissions = async () => {
    try {
      const res = await fetch("/api/admission?status=ACTIVE");
      const result = await res.json();
      if (res.ok && result.success) {
        const list = result.data || [];
        setAdmissions(list);
        if (initialAdmissionId) {
          const match = list.find((a: any) => a._id === initialAdmissionId);
          if (match) {
            handleDischargeClick(match);
          }
        }
      } else {
        toast(result.message || "Failed to fetch admissions", "error");
      }
    } catch (err: any) {
      toast("An error occurred while fetching admissions", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAdmissions();
  }, []);

  const handleDischargeClick = (admission: any) => {
    activeSummaryAdmissionId.current = admission._id;
    setSelectedAdmission(admission);
    setDischargeDate(toHospitalDateTimeInput(new Date(), hospital.timeZone));
    setDischargeCondition("");
    setFinalDiagnosis("");
    setDischargeSummary("");
    setSummaryLoading(true);
    setFollowUpDate("");
    setFollowUpInstructions("");
    setDischargeAdvice("");
    setMedications([]);
    setDischargeOpen(true);
    fetch(`/api/admission/${encodeURIComponent(admission._id)}/discharge-draft`)
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error(result.message || "Unable to prepare treatment summary.");
        return result.data?.summary as string | undefined;
      })
      .then((summary) => {
        if (activeSummaryAdmissionId.current === admission._id && summary?.trim()) {
          setDischargeSummary((current) => current.trim() ? current : summary);
        }
      })
      .catch((error: unknown) => {
        if (activeSummaryAdmissionId.current === admission._id) {
          toast(error instanceof Error ? error.message : "Unable to prepare treatment summary.", "error");
        }
      })
      .finally(() => {
        if (activeSummaryAdmissionId.current === admission._id) setSummaryLoading(false);
      });
  };

  // Medication row management
  const addMedicationRow = () => {
    setMedications((prev) => [
      ...prev,
      { medicineName: "", isCatalogueMedicine: null, dosage: "", frequency: "", duration: "", instructions: "" }
    ]);
  };

  const removeMedicationRow = (index: number) => {
    setMedications((prev) => prev.filter((_, i) => i !== index));
  };

  const updateMedication = (index: number, field: Exclude<keyof MedicationItem, "isCatalogueMedicine">, val: string) => {
    setMedications((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: val, ...(field === "medicineName" ? { isCatalogueMedicine: null } : {}) };
      return copy;
    });
  };

  const handleMedicineSelection = (index: number, medicineName: string, isCatalogueMedicine: boolean | null) => {
    setMedications((prev) => prev.map((medicine, row) =>
      row === index ? { ...medicine, medicineName, isCatalogueMedicine } : medicine
    ));
  };

  const handleDischargeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAdmission) return;

    if (!finalDiagnosis.trim()) {
      toast("Please enter the final confirmed diagnosis", "error");
      return;
    }

    const dischargeInstant = hospitalDateTimeInputToUtc(dischargeDate, hospital.timeZone);
    if (!dischargeInstant) {
      toast("Enter a valid discharge date and time in the hospital time zone", "error");
      return;
    }
    const admissionInstant = new Date(selectedAdmission.admissionDate);
    if (Number.isNaN(admissionInstant.getTime()) || dischargeInstant.getTime() < admissionInstant.getTime()) {
      toast("Discharge date and time cannot be earlier than admission", "error");
      return;
    }

    const incompleteMedication = medications.find((medication) => {
      const hasAnyValue = [
        medication.medicineName,
        medication.dosage,
        medication.frequency,
        medication.duration,
        medication.instructions,
      ].some((value) => value.trim());
      return hasAnyValue && (!medication.medicineName.trim() || !medication.dosage.trim() || !medication.frequency.trim() || !medication.duration.trim());
    });
    if (incompleteMedication) {
      toast("Complete the medicine name, dosage, frequency, and duration for each medicine, or remove the empty row", "error");
      return;
    }
    if (medications.some((medicine) => medicine.medicineName.trim() && medicine.isCatalogueMedicine === null)) {
      toast("Choose a catalogue medicine or explicitly select Use as typed for each medicine", "error");
      return;
    }

    setSubmitting(true);
    try {
      const validMedications = medications.filter((m) => m.medicineName.trim() !== "");

      const payload: any = {
        admissionId: selectedAdmission._id,
        dischargeDate: dischargeInstant.toISOString(),
        dischargeCondition,
        finalDiagnosis,
        dischargeSummary,
        dischargeMedications: validMedications,
        followUpInstructions,
        dischargeAdvice
      };

      if (followUpDate) {
        const followUpInstant = hospitalDateTimeInputToUtc(`${followUpDate}T00:00`, hospital.timeZone);
        if (!followUpInstant) {
          toast("Enter a valid follow-up date", "error");
          setSubmitting(false);
          return;
        }
        payload.followUpDate = followUpInstant.toISOString();
      }

      const res = await fetch("/api/admission/discharge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const result = await res.json();
      if (res.ok && result.success) {
        toast("Patient discharged successfully. Bed is now available.", "success");
        router.push(`/admissions/${selectedAdmission._id}/discharge-packet`);
      } else {
        toast(result.message || "Failed to discharge patient", "error");
      }
    } catch (err: any) {
      toast("An error occurred while discharging patient", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const filteredAdmissions = useMemo(() => {
    if (!searchQuery.trim()) return admissions;
    const q = searchQuery.toLowerCase().trim();
    return admissions.filter(
      (a) =>
        a.patientId?.name?.toLowerCase().includes(q) ||
        a.patientId?.uhid?.toLowerCase().includes(q) ||
        a.bedId?.bedNumber?.toLowerCase().includes(q) ||
        a.doctorId?.name?.toLowerCase().includes(q)
    );
  }, [admissions, searchQuery]);

  const getDurationText = (admissionDate: string) => formatLengthOfStay(admissionDate);

  if (loading) {
    return (
      <div className="flex h-[450px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <LogOut className="h-6 w-6 text-rose-600 dark:text-rose-400" />
            Patient Discharge Processing
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Process patient discharges, record final diagnoses, prescribe discharge medications, and free hospital beds.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => fetchAdmissions()}
          className="flex items-center gap-1.5"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      {/* Search & Active Patient Roster */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <CardTitle className="text-base font-semibold">Active Patients Eligible for Discharge</CardTitle>
            <CardDescription>
              Select an admitted patient to initiate their clinical discharge workflow ({admissions.length} active).
            </CardDescription>
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search by patient name, UHID, or bed"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 text-xs"
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Patient Details</TableHead>
                  <TableHead>Ward & Bed</TableHead>
                  <TableHead>Attending Doctor</TableHead>
                  <TableHead>Admitted</TableHead>
                  <TableHead>Length of Stay</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAdmissions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-slate-500 py-12 text-xs">
                      No admitted patients found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredAdmissions.map((adm) => (
                    <TableRow key={adm._id} className="text-xs hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <TableCell>
                        <div className="font-semibold text-slate-900 dark:text-white">
                          {adm.patientId?.name || "Not recorded"}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {adm.patientId?.uhid || adm.patientId?.contact} • {adm.patientId?.gender},{" "}
                          {adm.patientId?.age}y
                        </div>
                      </TableCell>

                      <TableCell>
                        <div className="font-semibold text-emerald-600">
                          Bed {adm.bedId?.bedNumber || "Not recorded"}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {adm.bedId?.roomId?.wardId?.wardName || "Not recorded"}
                        </div>
                      </TableCell>

                      <TableCell>
                        <div className="font-medium text-slate-800 dark:text-slate-200">
                          Dr. {adm.doctorId?.name || "Attending"}
                        </div>
                      </TableCell>

                      <TableCell className="text-slate-500">
                        {formatHospitalDateTime(adm.admissionDate, hospital.timeZone)}
                      </TableCell>

                      <TableCell>
                        <Badge variant="outline" className="font-mono text-[10px]">
                          {getDurationText(adm.admissionDate)}
                        </Badge>
                      </TableCell>

                      <TableCell className="text-right">
                        <Button
                          variant="destructive"
                          size="sm"
                          className="h-7 px-3 text-xs"
                          onClick={() => handleDischargeClick(adm)}
                        >
                          <LogOut className="h-3 w-3 mr-1" />
                          Initiate Discharge
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Complete Discharge Processing Modal */}
      <Dialog open={dischargeOpen} onOpenChange={setDischargeOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          {selectedAdmission && (
            <form onSubmit={handleDischargeSubmit}>
              <DialogHeader>
                <DialogTitle className="text-lg font-bold flex items-center gap-2">
                  <LogOut className="h-5 w-5 text-rose-600" />
                  Process Patient Discharge
                </DialogTitle>
                <DialogDescription>
                  Completing this form will mark the patient as discharged, free Bed{" "}
                  {selectedAdmission.bedId?.bedNumber}, and create the discharge record.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-4 text-xs">
                {/* Patient Summary Card */}
                <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-lg grid grid-cols-2 sm:grid-cols-4 gap-3 border">
                  <div>
                    <span className="text-slate-500 block">Patient</span>
                    <span className="font-bold text-slate-900 dark:text-white">
                      {selectedAdmission.patientId?.name}
                    </span>
                    <div className="text-[10px] text-slate-400">{selectedAdmission.patientId?.uhid}</div>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Bed Vacated</span>
                    <span className="font-bold text-emerald-600">
                      Bed {selectedAdmission.bedId?.bedNumber}
                    </span>
                    <div className="text-[10px] text-slate-400">
                      {selectedAdmission.bedId?.roomId?.wardId?.wardName || "General"}
                    </div>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Stay Duration</span>
                    <span className="font-bold font-mono">
                      {getDurationText(selectedAdmission.admissionDate)}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Physician</span>
                    <span className="font-bold">Dr. {selectedAdmission.doctorId?.name}</span>
                  </div>
                </div>

                {/* Section 1: Discharge Date & Condition */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="dischargeDate" className="text-xs font-semibold">
                      Discharge Date & Time *
                    </Label>
                    <Input
                      type="datetime-local"
                      id="dischargeDate"
                      value={dischargeDate}
                      min={selectedAdmission?.admissionDate ? toHospitalDateTimeInput(selectedAdmission.admissionDate, hospital.timeZone) : undefined}
                      onChange={(e) => setDischargeDate(e.target.value)}
                      required
                      className="h-8 text-xs"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="dischargeCondition" className="text-xs font-semibold">
                      Condition at Discharge *
                    </Label>
                    <Select
                      id="dischargeCondition"
                      value={dischargeCondition}
                      onChange={(e) => setDischargeCondition(e.target.value)}
                      required
                      className="h-8 text-xs"
                    >
                      <option value="">Select discharge condition</option>
                      <option value="RECOVERED">Recovered (Full recovery)</option>
                      <option value="IMPROVED">Improved (Significant clinical progress)</option>
                      <option value="STABLE">Stable (Discharge on oral medications)</option>
                      <option value="TRANSFERRED">Transferred to another facility</option>
                      <option value="LAMA">LAMA (Left Against Medical Advice)</option>
                      <option value="ON_REQUEST">Discharged on Family Request</option>
                      <option value="DECEASED">Deceased / Expired</option>
                    </Select>
                  </div>
                </div>

                {/* Section 2: Final Diagnosis */}
                <div className="space-y-1">
                  <Label htmlFor="finalDiagnosis" className="text-xs font-semibold">
                    Final Confirmed Diagnosis *
                  </Label>
                  <Input
                    id="finalDiagnosis"
                    placeholder="Enter the final confirmed diagnosis"
                    value={finalDiagnosis}
                    onChange={(e) => setFinalDiagnosis(e.target.value)}
                    required
                    className="h-8 text-xs font-medium"
                  />
                </div>

                {/* Section 3: Summary of Hospital Treatment */}
                <div className="space-y-1">
                  <Label htmlFor="dischargeSummary" className="text-xs font-semibold">
                    Clinical Hospital Course & Treatment Summary
                  </Label>
                  <p className="text-[10px] text-slate-500">
                    {summaryLoading ? "Compiling recorded rounds, procedures, orders and medicines…" : "Auto-filled from available clinical records; review and edit as needed."}
                  </p>
                  <Textarea
                    id="dischargeSummary"
                    rows={3}
                    placeholder="No rounds, procedures, orders or medicines are recorded for this admission. Enter the treatment summary."
                    value={dischargeSummary}
                    onChange={(e) => setDischargeSummary(e.target.value)}
                    className="text-xs"
                  />
                </div>

                {/* Section 4: Discharge Medications */}
                <div className="space-y-2 border rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-900 dark:text-white">
                      Discharge Medications & Prescriptions
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={addMedicationRow}
                      className="h-7 text-xs flex items-center gap-1"
                    >
                      <Plus className="h-3 w-3" />
                      Add Medicine
                    </Button>
                  </div>

                  <div className="space-y-2">
                    {medications.map((med, idx) => (
                      <div key={idx} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center bg-slate-50 dark:bg-slate-800/40 p-2 rounded border">
                        <div className="sm:col-span-3">
                          <MedicineAutocomplete
                            ariaLabel={`Discharge medicine ${idx + 1} name and strength`}
                            placeholder="Search medicine catalogue"
                            value={med.medicineName}
                            isCatalogueMedicine={med.isCatalogueMedicine}
                            onChange={(medicineName, isCatalogueMedicine) => handleMedicineSelection(idx, medicineName, isCatalogueMedicine)}
                            className="[&_input]:h-7 [&_input]:text-xs"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <Input
                            placeholder="Dosage"
                            value={med.dosage}
                            onChange={(e) => updateMedication(idx, "dosage", e.target.value)}
                            className="h-7 text-xs"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <Input
                            placeholder="Frequency"
                            value={med.frequency}
                            onChange={(e) => updateMedication(idx, "frequency", e.target.value)}
                            className="h-7 text-xs"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <Input
                            placeholder="Duration"
                            value={med.duration}
                            onChange={(e) => updateMedication(idx, "duration", e.target.value)}
                            className="h-7 text-xs"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <Input
                            placeholder="Instructions (optional)"
                            value={med.instructions}
                            onChange={(e) => updateMedication(idx, "instructions", e.target.value)}
                            className="h-7 text-xs"
                          />
                        </div>
                        <div className="sm:col-span-1 text-center">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-rose-500 hover:text-rose-700"
                            onClick={() => removeMedicationRow(idx)}
                            aria-label={`Remove medicine ${idx + 1}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Section 5: Advice & Follow-up */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="followUpDate" className="text-xs font-semibold">
                      Follow-up Appointment Date
                    </Label>
                    <Input
                      type="date"
                      id="followUpDate"
                      value={followUpDate}
                      onChange={(e) => setFollowUpDate(e.target.value)}
                      className="h-8 text-xs"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="followUpInstructions" className="text-xs font-semibold">
                      Follow-up & Emergency Warning Signs
                    </Label>
                    <Input
                      id="followUpInstructions"
                      placeholder="Enter clinician-provided follow-up and warning-sign instructions"
                      value={followUpInstructions}
                      onChange={(e) => setFollowUpInstructions(e.target.value)}
                      className="h-8 text-xs"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="dischargeAdvice" className="text-xs font-semibold">
                    Dietary & Lifestyle Advice
                  </Label>
                  <Textarea
                    id="dischargeAdvice"
                    rows={2}
                    placeholder="Enter clinician-provided dietary and activity advice"
                    value={dischargeAdvice}
                    onChange={(e) => setDischargeAdvice(e.target.value)}
                    className="text-xs"
                  />
                </div>
              </div>

              <DialogFooter className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setDischargeOpen(false)} disabled={submitting}>
                  Cancel
                </Button>
                <Button type="submit" variant="destructive" disabled={submitting} className="min-w-[150px]">
                  {submitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Discharging...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      Confirm & Discharge
                    </>
                  )}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

    </div>
  );
}
