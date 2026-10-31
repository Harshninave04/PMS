"use client";

import React from "react";
import { ClipboardList, Loader2, Printer } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FieldIfPresent } from "@/components/clinical/field-if-present";
import { HospitalHeader } from "@/components/print/hospital-header";
import { useHospitalProfile } from "@/components/hospital-profile/hospital-profile-context";
import { formatHospitalDate, formatHospitalDateTime } from "@/lib/hospital-date";
import { formatDoctorName } from "@/lib/name-formatter";

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
  doctorId?: {
    userId?: { name?: string } | string;
    qualification?: string;
    specialization?: string;
    licenseNo?: string;
    departmentId?: { name?: string } | string;
  } | string;
}

interface ClinicalRecord {
  visitedAt?: string;
  chiefComplaint?: string;
  historyOfPresentIllness?: string;
  objectiveFindings?: string;
  notes?: string;
  details?: string;
  followUpDate?: string;
  admitAdvised?: boolean;
  admitReason?: string;
  assessment?: string;
  plan?: string;
  instructions?: string;
}

interface Prescription {
  visitDate?: string;
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

function formatPrescriptionDoctorName(name?: string): string {
  const formatted = formatDoctorName(name);
  const trimmed = name?.trim();
  if (!trimmed || trimmed !== trimmed.toLocaleLowerCase()) return formatted;
  return formatted.replace(/\b[a-z]/g, (letter) => letter.toLocaleUpperCase());
}

export default function CompletedTodayPage() {
  const hospital = useHospitalProfile();
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
  const doctor = typeof details?.appointment.doctorId === "object" ? details.appointment.doctorId : undefined;
  const doctorUser = typeof doctor?.userId === "object" ? doctor.userId : undefined;
  const doctorDepartment = typeof doctor?.departmentId === "object" ? doctor.departmentId : undefined;
  const completedAt = details?.appointment.consultationEndedAt;
  const formattedCompletedAt = formatHospitalDateTime(completedAt, hospital.timeZone);
  const prescriptionNotes = prescription?.notes?.trim();
  const clinicalPlan = clinical?.plan?.trim();
  const showClinicalPlan = Boolean(clinicalPlan && clinicalPlan.localeCompare(prescriptionNotes || "", undefined, { sensitivity: "accent" }) !== 0);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Doctor OPD</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Today&apos;s Completed Patients</h1>
        <p className="mt-1 text-sm text-slate-500">Visits completed by you today.</p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div><CardTitle className="text-base">Completed today</CardTitle><p className="mt-1 text-xs text-slate-500">{loading ? "Loading visitsâ€¦" : `${count} completed ${count === 1 ? "visit" : "visits"}`}</p></div>
          <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">{count}</Badge>
        </CardHeader>
        <CardContent className="space-y-3">
          {error ? <p role="alert" className="py-8 text-center text-sm text-red-600">{error}</p> : loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading today&apos;s completed visits</div>
          ) : appointments.length === 0 ? (
            <div className="py-10 text-center"><ClipboardList className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 text-sm text-slate-500">No patients completed today.</p></div>
          ) : appointments.map((appointment) => (
            <button key={appointment._id} type="button" onClick={() => void openVisit(appointment._id)} className="flex w-full flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-4 text-left transition hover:border-emerald-300 hover:bg-emerald-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:border-slate-800 dark:hover:bg-emerald-950/20">
              <span className="flex min-w-0 items-center gap-3"><span className="shrink-0 rounded-md bg-slate-100 px-2 py-1 font-mono text-xs font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200">{appointment.tokenNumber || "Not recorded"}</span><span className="min-w-0"><span className="block truncate font-semibold text-slate-900 dark:text-white">{appointment.patientId?.name || "Not recorded"}</span><span className="mt-0.5 block text-xs text-slate-500">{appointment.patientId?.uhid || "Not recorded"}</span></span></span>
              <span className="flex flex-wrap items-center gap-3"><span className="text-xs text-slate-500">Completed {formatHospitalDateTime(appointment.consultationEndedAt, hospital.timeZone) || "Not recorded"}</span><Badge variant="outline" className="border-green-200 bg-green-50 text-green-700">Completed</Badge></span>
            </button>
          ))}
          {!loading && appointments.length > 0 && <Button variant="outline" size="sm" onClick={() => void loadAppointments()}>Refresh</Button>}
        </CardContent>
      </Card>

      <Dialog open={Boolean(selectedId)} onOpenChange={closeVisit}>
        <DialogContent className="prescription-dialog-content max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader className="no-print">
            <DialogTitle>{patient?.name || (detailLoading ? "Loading visitâ€¦" : "Completed visit")}</DialogTitle>
            <DialogDescription>Clinical details for this appointment completed today.</DialogDescription>
          </DialogHeader>
          {detailLoading ? <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading visit details</div> : detailError ? (
            <p role="alert" className="py-8 text-sm text-red-600">{detailError}</p>
          ) : details ? (
            <div className="space-y-3">
              {prescription && (
                <div id="print-area" className="prescription-print-area compact-opd-prescription space-y-3 text-sm text-slate-900">
                  <HospitalHeader className="border-slate-800" includeGstin={false} compact />
                  {!hospital.name && <p className="text-xs text-amber-700 no-print">Hospital name is not configured in Settings.</p>}

                  <div className="flex items-end justify-between border-b border-slate-300 pb-2">
                    <div>
                      <h2 className="text-lg font-bold tracking-wide">OPD PRESCRIPTION</h2>
                    </div>
                    <div className="text-right text-[10px]">
                      <FieldIfPresent label="Prescription date" value={formatHospitalDate(prescription.visitDate || completedAt, hospital.timeZone)} />
                      <FieldIfPresent label="Token" value={details.appointment.tokenNumber} />
                    </div>
                  </div>

                  <section className="prescription-keep-together rounded border border-slate-300 p-2">
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
                      <FieldIfPresent label="Patient" value={patient?.name} />
                      <FieldIfPresent label="UHID" value={patient?.uhid} />
                      <FieldIfPresent label="Age / Gender" value={[patient?.age ? `${patient.age} years` : "", patient?.gender].filter(Boolean).join(" / ")} />
                      <FieldIfPresent label="Phone" value={patient?.contact} />
                      <FieldIfPresent label="Blood group" value={patient?.bloodGroup} />
                      <FieldIfPresent label="Allergies" value={patient?.allergies?.join(", ")} />
                    </div>
                  </section>

                  <section className="prescription-keep-together flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-slate-200 pb-2 text-[10px]">
                    <p><span className="font-semibold">Prescribed by:</span> {formatPrescriptionDoctorName(doctorUser?.name) || "Doctor"}{doctor?.qualification ? ` · ${doctor.qualification}` : ""}{doctor?.specialization ? ` · ${doctor.specialization}` : ""}</p>
                    <p className="text-slate-600">{[doctorDepartment?.name, doctor?.licenseNo ? `Reg. ${doctor.licenseNo}` : ""].filter(Boolean).join(" Â· ")}</p>
                  </section>

                  <section className="prescription-keep-together grid grid-cols-2 gap-3 rounded border border-slate-300 p-2">
                    <FieldIfPresent label="Chief complaint" value={clinical?.chiefComplaint || prescription.symptoms} />
                    <FieldIfPresent label="Diagnosis" value={clinical?.assessment || prescription.diagnosis} />
                  </section>

                  {prescription.medications?.length ? (
                    <section>
                      <h3 className="mb-2 font-semibold">Rx / Medicines</h3>
                      <div className="prescription-table-wrap overflow-x-auto rounded border border-slate-300">
                        <table className="w-full min-w-[620px] text-left text-xs">
                          <thead className="bg-slate-100"><tr><th className="p-1.5">#</th><th className="p-1.5">Medicine</th><th className="p-1.5">Dose</th><th className="p-1.5">Frequency</th><th className="p-1.5">Duration</th><th className="p-1.5">Instructions</th></tr></thead>
                          <tbody className="divide-y divide-slate-200">{prescription.medications.map((medicine, index) => (
                            <tr key={`${medicine.name}-${index}`}>
                              <td className="p-1.5">{index + 1}</td><td className="p-1.5 font-medium">{medicine.name || "â€”"}</td><td className="p-1.5">{medicine.dosage || "â€”"}</td><td className="p-1.5">{medicine.frequency || "â€”"}</td><td className="p-1.5">{medicine.duration || "â€”"}</td><td className="p-1.5">{medicine.instructions || "â€”"}</td>
                            </tr>
                          ))}</tbody>
                        </table>
                      </div>
                    </section>
                  ) : <p className="rounded border border-dashed border-slate-300 p-3 text-sm text-slate-500">No medicines were prescribed.</p>}

                  <section className="prescription-keep-together space-y-2 rounded border border-slate-300 p-2">
                    <FieldIfPresent label="Prescription notes" value={prescriptionNotes} />
                    {showClinicalPlan && <FieldIfPresent label="Clinical plan / investigations advised" value={clinicalPlan} />}
                    <FieldIfPresent label="Clinical instructions" value={clinical?.instructions} />
                    <FieldIfPresent label="Follow-up date" value={formatHospitalDate(prescription.followUpDate || clinical?.followUpDate, hospital.timeZone)} />
                    {clinical?.admitAdvised && <FieldIfPresent label="Admission advised" value={clinical.admitReason ? `Yes. Reason: ${clinical.admitReason}` : "Yes"} />}
                  </section>
                </div>
              )}

              {!prescription && <div className="space-y-4 no-print">
                <section className="space-y-3"><h3 className="font-semibold text-slate-900 dark:text-white">Patient information</h3><div className="grid gap-4 rounded-lg bg-slate-50 p-4 sm:grid-cols-3 dark:bg-slate-800/60"><FieldIfPresent label="UHID" value={patient?.uhid} /><FieldIfPresent label="Phone" value={patient?.contact} /><FieldIfPresent label="Email" value={patient?.email} /><FieldIfPresent label="Age / Gender" value={[patient?.age, patient?.gender].filter(Boolean).join(" / ")} /><FieldIfPresent label="Date of birth" value={patient?.dateOfBirth ? formatHospitalDate(patient.dateOfBirth, hospital.timeZone) : undefined} /><FieldIfPresent label="Blood group" value={patient?.bloodGroup} /><FieldIfPresent label="Address" value={patient?.address} /><FieldIfPresent label="Emergency contact" value={patient?.emergencyContact} /><FieldIfPresent label="Marital status" value={patient?.maritalStatus} /><FieldIfPresent label="Guardian" value={[patient?.guardianName, patient?.guardianRelation].filter(Boolean).join(" Â· ")} /><FieldIfPresent label="Allergies" value={patient?.allergies?.join(", ")} /><FieldIfPresent label="Medical history" value={patient?.medicalHistory?.join(", ")} /><FieldIfPresent label="Token" value={details.appointment.tokenNumber} /><FieldIfPresent label="Completed at" value={formattedCompletedAt} /><FieldIfPresent label="Consulting doctor" value={doctorUser?.name} /></div></section>
                <section className="space-y-3"><h3 className="font-semibold text-slate-900 dark:text-white">Consultation</h3><div className="grid gap-4 rounded-lg border border-slate-200 p-4 sm:grid-cols-2 dark:border-slate-800"><FieldIfPresent label="Chief complaint" value={clinical?.chiefComplaint} /><FieldIfPresent label="Diagnosis" value={clinical?.assessment} /><FieldIfPresent label="History / clinical notes" value={clinical?.historyOfPresentIllness || clinical?.details} /><FieldIfPresent label="Objective findings" value={clinical?.objectiveFindings} /><FieldIfPresent label="Clinical plan / investigations" value={clinical?.plan} /><FieldIfPresent label="Clinical instructions" value={clinical?.instructions} /><FieldIfPresent label="Follow-up date" value={clinical?.followUpDate ? formatHospitalDate(clinical.followUpDate, hospital.timeZone) : undefined} />{clinical?.admitAdvised && <FieldIfPresent label="Admission advised" value={`Yes. Reason: ${clinical.admitReason || "Not recorded"}`} />}</div></section>
                <section className="space-y-3"><h3 className="font-semibold text-slate-900 dark:text-white">Prescription</h3><p className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500">No prescription recorded for this visit.</p></section>
              </div>}
            </div>
          ) : null}
          {prescription && <div className="no-print flex justify-end gap-2 border-t pt-3">
            <Button type="button" variant="outline" size="sm" onClick={() => window.print()}><Printer className="mr-2 h-4 w-4" />Print prescription</Button>
            <Button type="button" variant="outline" size="sm" onClick={() => closeVisit(false)}>Close</Button>
          </div>}
        </DialogContent>
      </Dialog>
    </div>
  );
}
