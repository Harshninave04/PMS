"use client";

import React, { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { useHospitalProfile } from "@/components/hospital-profile/hospital-profile-context";
import { HospitalHeader } from "@/components/print/hospital-header";
import { formatHospitalDateTime, formatLengthOfStay, hospitalDateTimeInputToUtc, toHospitalDateTimeInput } from "@/lib/hospital-date";
import { usePermissions } from "@/components/permissions/permission-context";
import { fmtMoney } from "@/lib/money";
import {
  FileText,
  Printer,
  ArrowLeft,
  Loader2
} from "lucide-react";

function dischargeTypeLabel(condition?: string): string {
  switch (condition) {
    case "LAMA": return "LAMA";
    case "TRANSFERRED": return "Referred";
    case "DECEASED": return "Death";
    case "RECOVERED":
    case "IMPROVED":
    case "STABLE":
    case "ON_REQUEST": return "Normal";
    default: return "Not recorded";
  }
}

function splitDischargeAdvice(value?: string) {
  const advice = value?.trim() || "";
  if (!advice) return [] as Array<{ label: string; text: string }>;
  const labelPattern = /(?:^|\n)\s*(Diet|Activity|Warning\s*Signs?|Emergency\s*Warning\s*Signs?)\s*:\s*/gi;
  const matches = [...advice.matchAll(labelPattern)];
  if (!matches.length) return [{ label: "General advice", text: advice }];
  const sections: Array<{ label: string; text: string }> = [];
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const start = (match.index ?? 0) + match[0].length;
    const end = index + 1 < matches.length ? matches[index + 1].index ?? advice.length : advice.length;
    const text = advice.slice(start, end).trim();
    if (!text) continue;
    const heading = (match[1] || "").toLowerCase();
    const label = heading.includes("warning") ? "Warning signs" : heading[0].toUpperCase() + heading.slice(1);
    sections.push({ label, text });
  }
  return sections.length ? sections : [{ label: "General advice", text: advice }];
}

function displayPerson(person: any): string {
  if (typeof person === "string") return person;
  return typeof person?.name === "string" ? person.name : "";
}

export default function DischargeSummaryPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-[450px] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
        </div>
      }
    >
      <DischargeSummaryContent />
    </Suspense>
  );
}

function DischargeSummaryContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlId = searchParams.get("id") || "";
  const { toast } = useToast();
  const hospital = useHospitalProfile();
  const { can } = usePermissions();

  const [dischargedAdmissions, setDischargedAdmissions] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState(urlId);
  const [admission, setAdmission] = useState<any>(null);
  const [clinicalDetails, setClinicalDetails] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [fetchingDetail, setFetchingDetail] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryLoadError, setSummaryLoadError] = useState("");
  const [correctedDischargeDate, setCorrectedDischargeDate] = useState("");
  const [savingDischargeDate, setSavingDischargeDate] = useState(false);

  // Fetch list of discharged admissions
  useEffect(() => {
    async function loadDischarged() {
      try {
        const res = await fetch("/api/admission?status=DISCHARGED");
        const data = await res.json();
        if (data.success && Array.isArray(data.data)) {
          setDischargedAdmissions(data.data);
          // If no id in URL, pick the first one
          if (!urlId && data.data.length > 0) {
            setSelectedId(data.data[0]._id);
          }
        }
      } catch (err) {
        toast("Failed to load discharged patient records", "error");
      } finally {
        setLoading(false);
      }
    }
    loadDischarged();
  }, [urlId]);

  // Fetch full details of the selected admission
  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    async function fetchAdmissionDetail() {
      setFetchingDetail(true);
      setSummaryLoadError("");
      setClinicalDetails(null);
      try {
        const res = await fetch(`/api/admission/${selectedId}`);
        const data = await res.json();
        if (data.success && data.data) {
          if (cancelled) return;
          setAdmission(data.data);
          setCorrectedDischargeDate(data.data.dischargeDate ? toHospitalDateTimeInput(data.data.dischargeDate, hospital.timeZone) : "");
          if (data.data.status === "DISCHARGED") {
            setSummaryLoading(true);
            const summaryResponse = await fetch(`/api/admission/${encodeURIComponent(selectedId)}/treatment-summary`);
            const summaryResult = await summaryResponse.json();
            if (!summaryResponse.ok || !summaryResult.success) throw new Error(summaryResult.message || "Unable to generate the treatment summary.");
            if (!cancelled) {
              const summary = typeof summaryResult.data?.summary === "string" ? summaryResult.data.summary : "";
              setClinicalDetails(summaryResult.data?.details ?? null);
              setAdmission((current: any) => current?._id === selectedId ? { ...current, dischargeSummary: current.dischargeSummary?.trim() || summary } : current);
            }
          }
        } else {
          toast("Failed to load admission details", "error");
        }
      } catch (err) {
        if (!cancelled) setSummaryLoadError(err instanceof Error ? err.message : "Unable to load the treatment summary.");
      } finally {
        if (!cancelled) {
          setSummaryLoading(false);
          setFetchingDetail(false);
        }
      }
    }
    void fetchAdmissionDetail();
    return () => { cancelled = true; };
  }, [selectedId, hospital.timeZone]);

  const handlePrint = () => {
    window.print();
  };

  const getDurationText = (admissionDate: string, dischargeDate?: string) => formatLengthOfStay(admissionDate, dischargeDate);

  const dischargeDateInvalid = Boolean(admission?.dischargeDate && admission?.admissionDate &&
    (Number.isNaN(new Date(admission.dischargeDate).getTime()) || new Date(admission.dischargeDate).getTime() < new Date(admission.admissionDate).getTime()));
  const fullFile = clinicalDetails;
  const procedures = Array.isArray(fullFile?.procedures) ? fullFile.procedures : [];
  const investigations = Array.isArray(fullFile?.investigations) ? fullFile.investigations : [];
  const namedInvestigations = investigations.filter((test: any) => typeof test.testName === "string" && test.testName.trim());
  const stayMedicines = Array.isArray(fullFile?.medicineSummary) ? fullFile.medicineSummary : [];
  const recordedVitals = Array.isArray(fullFile?.vitals) ? fullFile.vitals : [];
  const transfers = Array.isArray(fullFile?.transfers) ? fullFile.transfers : [];
  const adviceSections = splitDischargeAdvice(admission?.dischargeAdvice);
  const bill = fullFile?.billSummary;

  const handleCorrectDischargeDate = async () => {
    if (!admission?._id) return;
    const corrected = hospitalDateTimeInputToUtc(correctedDischargeDate, hospital.timeZone);
    const admitted = new Date(admission.admissionDate);
    if (!corrected || Number.isNaN(admitted.getTime()) || corrected.getTime() < admitted.getTime()) {
      toast("Enter a valid discharge time that is not earlier than admission", "error");
      return;
    }
    setSavingDischargeDate(true);
    try {
      const response = await fetch(`/api/admission/${encodeURIComponent(admission._id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dischargeDate: corrected.toISOString() }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || "Unable to update discharge time.");
      setAdmission((current: any) => current?._id === admission._id ? { ...current, dischargeDate: corrected.toISOString() } : current);
      toast("Discharge time corrected", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Unable to update discharge time.", "error");
    } finally {
      setSavingDischargeDate(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-[450px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-16 max-w-4xl mx-auto">
      {/* Top Action Bar (hidden during printing) */}
      <div className="no-print print:hidden flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-slate-500"
              onClick={() => router.push("/admissions/history")}
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Admission History
            </Button>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2 mt-1">
            <FileText className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
            Clinical Discharge Summary
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Official patient discharge summary sheet ready for review, export, and clean printing.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {admission && (
            <Button
              onClick={handlePrint}
              disabled={summaryLoading}
              className="bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5"
            >
              <Printer className="h-4 w-4" />
              Print Summary
            </Button>
          )}
        </div>
      </div>

      {/* Patient Selector Card (hidden during printing) */}
      <div className="no-print print:hidden">
        <Card className="border shadow-sm p-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-0.5">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Select Discharged Patient
              </span>
              <p className="text-xs text-slate-500">
                Choose from recently discharged patients to preview or print summary.
              </p>
            </div>
            <div className="w-full sm:w-80">
              <Select
                value={selectedId}
                onChange={(e) => {
                  setSelectedId(e.target.value);
                  router.push(`/admissions/summary?id=${e.target.value}`);
                }}
              >
                <option value="">-- Choose Discharged Patient --</option>
                {dischargedAdmissions.map((adm) => (
                  <option key={adm._id} value={adm._id}>
                    {adm.patientId?.name} ({adm.patientId?.uhid || "No UHID"}) —{" "}
                    {adm.dischargeDate ? formatHospitalDateTime(adm.dischargeDate, hospital.timeZone) : ""}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        </Card>
      </div>

      {fetchingDetail ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
        </div>
      ) : !admission ? (
        <Card className="p-12 text-center border">
          <FileText className="h-12 w-12 text-slate-300 mx-auto mb-3" />
          <h3 className="font-semibold text-slate-900 dark:text-white">
            No Discharge Record Selected
          </h3>
          <p className="text-sm text-slate-500 mt-1">
            Please select a discharged patient from the dropdown above to view their clinical discharge summary.
          </p>
        </Card>
      ) : (
        /* THE PRINTABLE DISCHARGE SUMMARY SHEET */
        <div id="print-area" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg p-8 sm:p-10 space-y-6 print:border-none print:shadow-none print:p-0 print:m-0 print:text-black">
          {/* 1. Hospital Letterhead Header */}
          <div className="border-b-2 border-slate-500 pb-4 flex items-start justify-between">
            <div className="space-y-1"><HospitalHeader className="border-0 pb-0" /></div>

            <div className="text-right">
              <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-300 text-xs font-bold px-3 py-1 print:border print:border-black print:text-black">
                DISCHARGE SUMMARY
              </Badge>
              <div className="text-[10px] text-slate-400 print:text-gray-500 mt-1 font-mono">
                Doc ID: {admission._id.slice(-8).toUpperCase()}
              </div>
            </div>
          </div>

          {/* 2. Patient Demographics & Admission Particulars */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60 text-xs print:bg-transparent print:border-gray-300">
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 print:text-gray-500 block">
                Patient Name
              </span>
              <span className="font-bold text-sm text-slate-900 dark:text-white print:text-black">
                {admission.patientId?.name || "Not recorded"}
              </span>
            </div>

            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 print:text-gray-500 block">
                UHID / Medical Record #
              </span>
              <span className="font-semibold font-mono text-emerald-600 dark:text-emerald-400 print:text-black">
                {admission.patientId?.uhid || "Not recorded"}
              </span>
            </div>

            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 print:text-gray-500 block">
                Age / Gender
              </span>
              <span className="font-medium">
                {admission.patientId?.age ? `${admission.patientId.age} yrs` : "Age not recorded"} / {admission.patientId?.gender || "Gender not recorded"}
              </span>
            </div>

            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 print:text-gray-500 block">
                Blood Group
              </span>
              <span className="font-medium">{admission.patientId?.bloodGroup || "Not recorded"}</span>
            </div>

            <div className="sm:col-span-2">
              <span className="text-[10px] uppercase font-bold text-slate-400 print:text-gray-500 block">
                Attending Consultant
              </span>
              <span className="font-semibold text-slate-900 dark:text-white print:text-black">
                {admission.doctorId?.name ? `Dr. ${admission.doctorId.name}` : "Not recorded"}
              </span>
            </div>

            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 print:text-gray-500 block">
                Ward & Bed Vacated
              </span>
              <span className="font-medium">
                Bed {admission.bedId?.bedNumber || "Not recorded"} • Room {admission.bedId?.roomId?.roomNumber || "Not recorded"}
              </span>
              <span className="text-[10px] text-slate-500 print:text-gray-600 block">
                {admission.bedId?.roomId?.wardId?.wardName || "Not recorded"}
              </span>
            </div>

            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 print:text-gray-500 block">
                Contact Phone
              </span>
              <span className="font-medium">{admission.patientId?.contact || "Not recorded"}</span>
            </div>

            <div className="sm:col-span-4">
              <span className="text-[10px] uppercase font-bold text-slate-400 print:text-gray-500 block">
                Allergies
              </span>
              <span className="font-medium text-rose-700 dark:text-rose-300 print:text-black">
                {Array.isArray(admission.patientId?.allergies) && admission.patientId.allergies.length > 0
                  ? admission.patientId.allergies.join(", ")
                  : "No allergies are documented in this record"}
              </span>
            </div>

            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 print:text-gray-500 block">
                Date of Admission
              </span>
              <span className="font-medium">
                {formatHospitalDateTime(admission.admissionDate, hospital.timeZone)}
              </span>
            </div>

            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 print:text-gray-500 block">
                Date of Discharge
              </span>
              <span className="font-medium text-emerald-600 dark:text-emerald-400 print:text-black font-semibold">
                {dischargeDateInvalid ? (
                  <><span className="hidden print:inline">Not recorded</span><span className="print:hidden">{formatHospitalDateTime(admission.dischargeDate, hospital.timeZone) || "Not recorded"}</span></>
                ) : admission.dischargeDate ? formatHospitalDateTime(admission.dischargeDate, hospital.timeZone) : "Not recorded"}
              </span>
              {dischargeDateInvalid && <div className="no-print mt-1 text-[10px] font-semibold text-amber-700">Discharge time invalid, please correct</div>}
            </div>

            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 print:text-gray-500 block">
                Total Length of Stay
              </span>
              <span className="font-medium font-mono">
                {getDurationText(admission.admissionDate, admission.dischargeDate)}
              </span>
            </div>

            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 print:text-gray-500 block">
                Condition at Discharge
              </span>
              <span className="font-bold text-emerald-700 dark:text-emerald-400 print:text-black">
                {admission.dischargeCondition || "Not recorded"}
              </span>
            </div>
          </div>

          {dischargeDateInvalid && (
            <div className="no-print rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
              <p className="font-semibold">Discharge time invalid, please correct</p>
              {can("admissions.current:update") && <div className="mt-2 flex flex-wrap items-end gap-2">
                <label className="grid gap-1">Correct discharge date and time
                  <input type="datetime-local" required className="h-8 rounded-md border border-amber-300 bg-white px-2 text-xs" min={toHospitalDateTimeInput(admission.admissionDate, hospital.timeZone)} value={correctedDischargeDate} onChange={(event) => setCorrectedDischargeDate(event.target.value)} />
                </label>
                <Button type="button" size="sm" onClick={() => void handleCorrectDischargeDate()} disabled={savingDischargeDate}>
                  {savingDischargeDate ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}Save corrected time
                </Button>
              </div>}
            </div>
          )}

          {/* 3. Diagnoses Block */}
          <div className="space-y-3">
            <div className="p-3 bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/40 rounded-lg print:border-gray-400 print:bg-gray-50">
              <div className="text-[11px] font-bold text-emerald-800 dark:text-emerald-300 print:text-black uppercase tracking-wider">
                Final Confirmed Diagnosis
              </div>
              <div className="font-bold text-base text-slate-900 dark:text-white print:text-black mt-0.5">
                {admission.finalDiagnosis || "Not recorded"}
              </div>
            </div>

            {admission.initialDiagnosis && admission.finalDiagnosis !== admission.initialDiagnosis && (
              <div className="text-xs text-slate-600 dark:text-slate-400">
                <span className="font-semibold">Provisional / Admitting Diagnosis: </span>
                {admission.initialDiagnosis}
              </div>
            )}

            {admission.reasonForAdmission && (
              <div className="text-xs text-slate-600 dark:text-slate-400">
                <span className="font-semibold">Chief Complaints / Presenting Symptoms: </span>
                {admission.reasonForAdmission}
              </div>
            )}
          </div>

          {/* 4. Clinical Course & Treatment Summary */}
          <div className="space-y-1.5 text-xs">
            <h4 className="font-bold uppercase tracking-wider text-[11px] text-slate-800 dark:text-slate-200 border-b pb-1 print:border-black">
              Hospital Treatment Summary & Clinical Course
            </h4>
            {admission.dischargeSummary ? (
              <p className="whitespace-pre-line text-slate-700 dark:text-slate-300 print:text-black leading-relaxed">
                {admission.dischargeSummary}
              </p>
            ) : summaryLoading ? (
              <p className="no-print italic text-slate-500">Generating treatment summary…</p>
            ) : summaryLoadError ? (
              <p className="italic text-slate-500 print:text-gray-600">Treatment summary could not be generated: {summaryLoadError}</p>
            ) : (
              <p className="italic text-slate-500 print:text-gray-600">No treatment summary or linked treatment records were found.</p>
            )}
          </div>

          <section className="summary-section space-y-1 text-xs">
            <h4 className="summary-section-title">1. Discharge Type</h4>
            <p className="font-semibold">{dischargeTypeLabel(admission.dischargeCondition)}</p>
          </section>

          {procedures.length > 0 && <section className="summary-section space-y-1 text-xs">
            <h4 className="summary-section-title">2. Procedures / Operations</h4>
            <table className="compact-table"><thead><tr><th>Date and time</th><th>Procedure / operation</th></tr></thead><tbody>
              {procedures.map((procedure: any, index: number) => <tr key={`${procedure.date}-${index}`}><td>{procedure.date ? formatHospitalDateTime(procedure.date, hospital.timeZone) : ""}</td><td>{procedure.title || ""}</td></tr>)}
            </tbody></table>
          </section>}

          {namedInvestigations.length > 0 && <section className="summary-section space-y-1 text-xs">
            <h4 className="summary-section-title">3. Investigations</h4>
            <table className="compact-table"><thead><tr><th>Test</th><th>Date and time</th><th>Status</th><th>Recorded result</th></tr></thead><tbody>
              {namedInvestigations.map((test: any, index: number) => <tr key={`${test.date}-${index}`}><td>{test.testName}</td><td>{test.date ? formatHospitalDateTime(test.date, hospital.timeZone) : ""}</td><td>{test.status || ""}</td><td>{test.result || ""}</td></tr>)}
            </tbody></table>
          </section>}

          {stayMedicines.length > 0 && <section className="summary-section space-y-1 text-xs">
            <h4 className="summary-section-title">4. Medicines Used During Stay</h4>
            <table className="compact-table"><thead><tr><th>Medicine</th><th>Dose</th><th>Route</th><th>Given count</th><th>Last given</th></tr></thead><tbody>
              {stayMedicines.map((medicine: any, index: number) => <tr key={`${medicine.name}-${index}`}><td>{medicine.name}</td><td>{medicine.dose || ""}</td><td>{medicine.route || ""}</td><td>{medicine.givenCount || "0"}</td><td>{medicine.lastGivenAt ? formatHospitalDateTime(medicine.lastGivenAt, hospital.timeZone) : ""}</td></tr>)}
            </tbody></table>
          </section>}

          {recordedVitals.length > 0 && <section className="summary-section space-y-1 text-xs">
            <h4 className="summary-section-title">5. Vitals</h4>
            <table className="compact-table"><thead><tr><th>Record</th><th>Date and time</th><th>Vitals</th></tr></thead><tbody>
              {[{ ...recordedVitals[0], label: "First recorded" }, { ...recordedVitals[recordedVitals.length - 1], label: "Last recorded" }].map((vital: any, index: number) => <tr key={`${vital.date}-${index}`}><td>{vital.label}</td><td>{formatHospitalDateTime(vital.date, hospital.timeZone)}</td><td>{vital.detail}</td></tr>)}
            </tbody></table>
          </section>}

          {(adviceSections.length > 0 || admission.followUpDate || admission.followUpInstructions) && <section className="summary-section space-y-1 text-xs">
            <h4 className="summary-section-title">6. Discharge Advice and Follow-up</h4>
            {adviceSections.map((advice, index) => <p key={`${advice.label}-${index}`}><b>{advice.label}:</b> {advice.text}</p>)}
            {admission.followUpDate && <p><b>Follow-up date:</b> {formatHospitalDateTime(admission.followUpDate, hospital.timeZone)}</p>}
            {admission.followUpInstructions && <p className="whitespace-pre-line"><b>Follow-up instructions:</b> {admission.followUpInstructions}</p>}
          </section>}

          {bill && <section className="summary-section space-y-1 text-xs">
            <h4 className="summary-section-title">7. Bill Summary</h4>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1"><p>Total: <b>{fmtMoney(bill.total)}</b></p><p>Advance adjusted: <b>{fmtMoney(bill.advanceAdjusted)}</b></p><p>Paid: <b>{fmtMoney(bill.paid)}</b></p><p>Balance due: <b>{fmtMoney(bill.balance)}</b></p></div>
            {bill.invoiceNumber && <p className="text-[10px]">Invoice: {bill.invoiceNumber}</p>}
          </section>}

          {(() => {
            const patientAddress = admission.patientId?.address?.trim();
            const emergency = [
              admission.emergencyContact?.name,
              admission.emergencyContact?.relation,
              admission.emergencyContact?.phone,
              typeof admission.patientId?.emergencyContact === "string" ? admission.patientId.emergencyContact : "",
            ].filter(Boolean).join(" · ");
            const doctorTeam = [...new Set([displayPerson(admission.doctorId), ...(fullFile?.careTeam?.doctors || []).map(displayPerson)].filter(Boolean))];
            const nurseTeam = [...new Set((fullFile?.careTeam?.nurses || []).map(displayPerson).filter(Boolean))];
            const insurance = [admission.insurance?.provider, admission.insurance?.policyNumber ? `Policy ${admission.insurance.policyNumber}` : ""].filter(Boolean).join(" · ");
            const hasDetails = admission.admissionType || patientAddress || emergency || transfers.length || doctorTeam.length || nurseTeam.length || insurance;
            if (!hasDetails) return null;
            const bedName = (bed: any) => bed?.bedNumber || bed?.roomId?.roomNumber || "";
            return <section className="summary-section space-y-1 text-xs">
              <h4 className="summary-section-title">8. Admission and Patient Details</h4>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                {admission.admissionType && <p><b>Admission type:</b> {admission.admissionType}</p>}
                {patientAddress && <p><b>Address:</b> {patientAddress}</p>}
                {emergency && <p><b>Emergency contact:</b> {emergency}</p>}
                {doctorTeam.length > 0 && <p><b>Doctors:</b> {doctorTeam.join(", ")}</p>}
                {nurseTeam.length > 0 && <p><b>Nurses:</b> {nurseTeam.join(", ")}</p>}
                {insurance && <p><b>Insurance / TPA:</b> {insurance}</p>}
              </div>
              {transfers.length > 0 && <div><b>Bed transfers:</b><ul className="ml-4 list-disc">{transfers.map((transfer: any, index: number) => <li key={transfer._id || index}>{transfer.transferDate ? formatHospitalDateTime(transfer.transferDate, hospital.timeZone) : ""} {bedName(transfer.fromBedId)} → {bedName(transfer.toBedId)}{transfer.reason ? ` · ${transfer.reason}` : ""}</li>)}</ul></div>}
            </section>;
          })()}

          <section className="summary-section signature-section space-y-1 text-xs">
            <h4 className="summary-section-title">9. Signatures</h4>
            <div className="grid grid-cols-3 gap-3 pt-3">
              {[
                { label: "Doctor", name: admission.doctorId?.name ? `Dr. ${admission.doctorId.name}` : "Not recorded" },
                { label: "Patient / Attendant", name: admission.patientId?.name || "Not recorded" },
                { label: "Hospital Authority", name: hospital.name || "Not recorded" },
              ].map((signer) => <div key={signer.label} className="signature-cell"><div className="signature-line"/><b>{signer.name}</b><div>{signer.label}</div><div>Date/time: {dischargeDateInvalid ? "Not recorded" : admission.dischargeDate ? formatHospitalDateTime(admission.dischargeDate, hospital.timeZone) : "Not recorded"}</div></div>)}
            </div>
          </section>
        </div>
      )}
      <style>{`
        .summary-section-title { margin: 0 0 3px; border-bottom: 1px solid #64748b; padding-bottom: 2px; font-size: 10px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; }
        .compact-table { width: 100%; border-collapse: collapse; font-size: 10px; }
        .compact-table th, .compact-table td { border: 1px solid #cbd5e1; padding: 3px 5px; text-align: left; vertical-align: top; }
        .compact-table th { background: #f1f5f9; font-weight: 700; }
        .compact-table tbody tr:nth-child(even) { background: #f8fafc; }
        .signature-cell { min-width: 0; font-size: 9px; }
        .signature-line { height: 18px; margin-bottom: 3px; border-bottom: 1px solid #64748b; }
        @page { size: A4; margin: 8mm; }
        @media print {
          #print-area { font-size: 8pt !important; line-height: 1.2 !important; padding: 0 !important; margin: 0 !important; border: 0 !important; box-shadow: none !important; }
          #print-area > * { margin-top: 4px !important; margin-bottom: 4px !important; }
          #print-area .summary-section { break-inside: avoid; page-break-inside: avoid; margin-top: 5px !important; }
          #print-area .summary-section-title { font-size: 8pt !important; }
          #print-area .compact-table { font-size: 7.5pt !important; }
          #print-area .compact-table th, #print-area .compact-table td { padding: 2px 4px !important; }
          #print-area .compact-table tr { break-inside: avoid; page-break-inside: avoid; }
          #print-area .signature-cell { font-size: 7.5pt !important; }
          #print-area .signature-line { height: 12px; }
        }
      `}</style>
    </div>
  );
}
