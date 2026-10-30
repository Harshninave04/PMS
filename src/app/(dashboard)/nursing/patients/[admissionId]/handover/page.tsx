"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  ClipboardList,
  HeartPulse,
  Loader2,
  Pill,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";

type HandoverPatient = {
  admissionId: string;
  patientId: string;
  name: string;
  uhid: string;
  bedNumber: string | number;
  wardName?: string;
  roomNumber?: string | number;
  floor?: string | number;
  doctorName?: string;
  insurance?: string;
  gender?: string;
  age?: number;
  bloodGroup?: string;
  diagnosis?: string;
  admissionDate?: string;
  allergies?: string[];
  discharged?: boolean;
};

type HandoverTimeline = {
  handoverHistory?: Array<{
    _id: string;
    fromNurseId?: { name?: string };
    toNurseId?: { name?: string };
    handedOverAt?: string;
    handoverNote?: string;
  }>;
  tasks?: Array<{
    _id: string;
    title: string;
    status: string;
    authorId?: { name?: string };
  }>;
  medications?: Array<{
    _id: string;
    medicationName?: string;
    dosage?: string;
    status?: string;
    administeredTime?: string;
    administeredBy?: { name?: string };
    withheldReason?: string;
  }>;
  vitals?: Array<{
    _id: string;
    dateRecorded?: string;
    bloodPressure?: string;
    heartRate?: number;
    oxygenSaturation?: number;
    recordedBy?: { name?: string };
  }>;
  visits?: Array<{
    _id: string;
    dateRecorded?: string;
    visitType?: string;
    condition?: string;
    painScore?: number;
    doctor?: { name?: string };
    assessment?: string;
  }>;
  orders?: Array<{
    _id: string;
    medicationName?: string;
    dosage?: string;
    frequency?: string;
    timesOfDay?: string[];
    status?: string;
    doseCounts?: { GIVEN?: number; PENDING?: number };
  }>;
};

export default function ShiftHandoverPage() {
  const { admissionId } = useParams<{ admissionId: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const [patient, setPatient] = useState<HandoverPatient | null>(null);
  const [timeline, setTimeline] = useState<HandoverTimeline | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatingTaskId, setUpdatingTaskId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState("");

  const loadHandover = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const rosterResponse = await fetch("/api/nursing/my-patients");
      const rosterResult = await rosterResponse.json();
      if (!rosterResponse.ok || !rosterResult.success) {
        throw new Error(rosterResult.message || "Unable to verify your patient assignment");
      }

      const assignedPatient = (rosterResult.data as HandoverPatient[]).find(
        (item) => String(item.admissionId) === admissionId,
      );
      if (!assignedPatient) {
        throw new Error("This patient is not currently assigned to you or is no longer admitted");
      }

      const timelineResponse = await fetch(
        `/api/care-tasks/timeline?admissionId=${encodeURIComponent(admissionId)}`,
      );
      const timelineResult = await timelineResponse.json();
      if (!timelineResponse.ok || !timelineResult.success) {
        throw new Error(timelineResult.message || "Unable to load shift handover details");
      }

      setPatient(assignedPatient);
      setTimeline(timelineResult.data as HandoverTimeline);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load shift handover details";
      setLoadError(message);
      setPatient(null);
      setTimeline(null);
      toast(message, "error");
    } finally {
      setLoading(false);
    }
  }, [admissionId, toast]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadHandover(), 0);
    return () => window.clearTimeout(timer);
  }, [loadHandover]);

  const updateTask = async (task: NonNullable<HandoverTimeline["tasks"]>[number], status: string) => {
    setUpdatingTaskId(task._id);
    try {
      const response = await fetch(`/api/care-tasks/${encodeURIComponent(task._id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.message || "Unable to update instruction");
      }
      toast(`Instruction ${status.toLowerCase()}`, "success");
      await loadHandover();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Unable to update instruction", "error");
    } finally {
      setUpdatingTaskId(null);
    }
  };

  const openBedsidePage = (page: string) => {
    if (!patient) return;
    router.push(`/${page}?patientId=${encodeURIComponent(patient.patientId)}&admissionId=${encodeURIComponent(patient.admissionId)}`);
  };

  return (
    <div className="space-y-5 pb-12">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label="Back to My Allotted Inpatients"
            onClick={() => router.push("/nursing/patients")}
          >
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Back
          </Button>
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              <ClipboardList className="h-6 w-6 text-cyan-700" />
              Shift handover{patient ? ` — ${patient.name}` : ""}
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Care instructions, medication, vitals, doctor visits, and handover history for this admission.
            </p>
          </div>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => void loadHandover()} disabled={loading}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Refresh
        </Button>
      </div>

      {loading ? (
        <Card className="border shadow-sm">
          <CardContent className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
            Loading assigned patient and shift handover...
          </CardContent>
        </Card>
      ) : loadError ? (
        <Card className="border shadow-sm">
          <CardContent className="space-y-4 py-8 text-center">
            <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">{loadError}</p>
            <Button type="button" variant="outline" size="sm" onClick={() => router.push("/nursing/patients")}>
              Return to My Allotted Inpatients
            </Button>
          </CardContent>
        </Card>
      ) : patient && timeline ? (
        <>
          <Card className="border shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <CardTitle className="text-base font-semibold">{patient.name}</CardTitle>
                  <CardDescription>
                    UHID: {patient.uhid} · Admission ID: #{patient.admissionId.slice(-6).toUpperCase()}
                  </CardDescription>
                </div>
                <Badge className="bg-emerald-100 text-emerald-800">Bed {patient.bedNumber}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3 rounded-lg border bg-slate-50 p-3 text-xs dark:bg-slate-800/40 sm:grid-cols-3">
                <div>
                  <span className="block text-[10px] font-semibold uppercase text-slate-400">Ward &amp; Room</span>
                  <p className="mt-0.5 font-bold text-slate-900 dark:text-white">{patient.wardName || "—"}</p>
                  <p className="text-[11px] text-slate-500">Room {patient.roomNumber ?? "—"} (Fl {patient.floor ?? "—"})</p>
                </div>
                <div>
                  <span className="block text-[10px] font-semibold uppercase text-slate-400">Attending Doctor</span>
                  <p className="mt-0.5 font-bold text-slate-900 dark:text-white">{patient.doctorName || "—"}</p>
                  <p className="text-[11px] text-slate-500">{patient.insurance || "Self Pay"}</p>
                </div>
                <div>
                  <span className="block text-[10px] font-semibold uppercase text-slate-400">Patient Demographics</span>
                  <p className="mt-0.5 font-bold text-slate-900 dark:text-white">{patient.gender || "—"}, {patient.age ?? "—"} years</p>
                  <p className="text-[11px] text-slate-500">Blood: {patient.bloodGroup || "Unknown"}</p>
                </div>
              </div>

              <div className="space-y-1 rounded-lg border p-3">
                <span className="block text-[10px] font-semibold uppercase text-slate-400">Admitting Diagnosis &amp; Notes</span>
                <p className="text-xs font-medium text-slate-900 dark:text-white">{patient.diagnosis || "Clinical Care"}</p>
                {patient.admissionDate && (
                  <p className="text-[11px] text-slate-500">
                    Admitted on {new Date(patient.admissionDate).toLocaleString([], { dateStyle: "long", timeStyle: "short" })}
                  </p>
                )}
              </div>

              {!!patient.allergies?.length && (
                <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">
                  <ShieldAlert className="h-5 w-5 shrink-0" />
                  <div>
                    <span className="block font-bold">Patient Allergy Alert</span>
                    <span>Contraindications: {patient.allergies.join(", ")}</span>
                  </div>
                </div>
              )}

              <div>
                <p className="mb-2 text-[11px] font-semibold text-slate-500">Direct Bedside Workstations</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <Button variant="outline" size="sm" className="justify-start border-rose-200 text-xs text-rose-600 hover:bg-rose-50" onClick={() => openBedsidePage("nursing/vitals")}>
                    <HeartPulse className="mr-1.5 h-3.5 w-3.5" /> Log Vitals
                  </Button>
                  <Button variant="outline" size="sm" className="justify-start border-purple-200 text-xs text-purple-600 hover:bg-purple-50" onClick={() => openBedsidePage("nursing/medications")}>
                    <Pill className="mr-1.5 h-3.5 w-3.5" /> eMAR Meds
                  </Button>
                  <Button variant="outline" size="sm" className="justify-start border-emerald-200 text-xs text-emerald-700 hover:bg-emerald-50" onClick={() => openBedsidePage("nursing/notes")}>
                    <ClipboardList className="mr-1.5 h-3.5 w-3.5" /> Daily Nursing Records
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border shadow-sm">
            <CardHeader className="px-4 py-3">
              <CardTitle className="text-sm font-semibold">Care timeline</CardTitle>
              <CardDescription className="text-xs">Instructions, medication, observations, and handover history.</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 items-start gap-3 px-4 pb-4 pt-0 text-xs sm:grid-cols-2">
              {(timeline.handoverHistory ?? []).length > 0 && (
                <section className="min-w-0 rounded-lg border border-cyan-200 bg-cyan-50/70 p-3 sm:col-span-2 dark:bg-cyan-950/20">
                  <h2 className="mb-2 text-xs font-semibold text-cyan-900 dark:text-cyan-200">Nurse handover history</h2>
                  {[...(timeline.handoverHistory ?? [])].reverse().slice(0, 3).map((handover) => (
                    <div key={handover._id} className="border-t border-cyan-100 py-2 text-[11px] text-slate-700 first:border-0 dark:text-slate-300">
                      <p className="font-medium leading-5">
                        {handover.fromNurseId?.name ?? "Nurse"} handed over to {handover.toNurseId?.name ?? "Nurse"}
                        {handover.handedOverAt ? ` · ${new Date(handover.handedOverAt).toLocaleString()}` : ""}
                      </p>
                      {handover.handoverNote && <p className="mt-0.5 whitespace-pre-wrap text-slate-600 dark:text-slate-400">{handover.handoverNote}</p>}
                    </div>
                  ))}
                </section>
              )}

              {(timeline.tasks ?? []).length > 0 && (
                <section className="min-w-0 rounded-lg border p-3">
                  <h2 className="mb-2 flex items-center justify-between gap-2 font-semibold">
                    <span>Care instructions</span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-slate-800">{timeline.tasks?.length}</span>
                  </h2>
                  {(timeline.tasks ?? []).slice(0, 5).map((task) => (
                    <div key={task._id} className="flex items-center justify-between gap-2 border-t py-2 first:border-0">
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-slate-800 dark:text-slate-200">{task.title}</span>
                        <span className="text-[10px] text-slate-500">{task.status} · {task.authorId?.name ?? "Doctor"}</span>
                      </span>
                      {task.status === "NEW" && (
                        <div className="flex shrink-0 gap-1">
                          <Button variant="outline" size="sm" className="h-6 px-2 text-[10px]" disabled={updatingTaskId === task._id} onClick={() => void updateTask(task, "ACKNOWLEDGED")}>
                            Acknowledge
                          </Button>
                          <Button variant="outline" size="sm" className="h-6 px-2 text-[10px]" disabled={updatingTaskId === task._id} onClick={() => void updateTask(task, "IN_PROGRESS")}>
                            Start
                          </Button>
                        </div>
                      )}
                      {task.status === "ACKNOWLEDGED" && (
                        <div className="flex shrink-0 gap-1">
                          <Button variant="outline" size="sm" className="h-6 px-2 text-[10px]" disabled={updatingTaskId === task._id} onClick={() => void updateTask(task, "IN_PROGRESS")}>
                            Start
                          </Button>
                          <Button size="sm" className="h-6 bg-emerald-600 px-2 text-[10px] text-white hover:bg-emerald-700" disabled={updatingTaskId === task._id} onClick={() => void updateTask(task, "COMPLETED")}>
                            Complete
                          </Button>
                        </div>
                      )}
                      {task.status === "IN_PROGRESS" && (
                        <Button size="sm" className="h-6 shrink-0 bg-emerald-600 px-2 text-[10px] text-white hover:bg-emerald-700" disabled={updatingTaskId === task._id} onClick={() => void updateTask(task, "COMPLETED")}>
                          Complete
                        </Button>
                      )}
                    </div>
                  ))}
                </section>
              )}

              {(timeline.medications ?? []).length > 0 && (
                <section className="min-w-0 rounded-lg border p-3">
                  <h2 className="mb-2 flex items-center justify-between gap-2 font-semibold">
                    <span>Medication administration</span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-slate-800">{timeline.medications?.length}</span>
                  </h2>
                  {(timeline.medications ?? []).slice(0, 5).map((medication) => (
                    <div key={medication._id} className="border-t py-2 first:border-0">
                      <p className="font-medium text-slate-800 dark:text-slate-200">{medication.medicationName} {medication.dosage}</p>
                      <p className="text-[10px] leading-4 text-slate-500">
                        {medication.status}
                        {medication.administeredTime ? ` · ${new Date(medication.administeredTime).toLocaleString()}` : ""}
                        {medication.administeredBy?.name ? ` · ${medication.administeredBy.name}` : ""}
                        {medication.withheldReason ? ` · ${medication.withheldReason}` : ""}
                      </p>
                    </div>
                  ))}
                </section>
              )}

              {(timeline.vitals ?? []).length > 0 && (
                <section className="min-w-0 rounded-lg border p-3">
                  <h2 className="mb-2 flex items-center justify-between gap-2 font-semibold">
                    <span>Vital signs</span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-slate-800">{timeline.vitals?.length}</span>
                  </h2>
                  {(timeline.vitals ?? []).slice(0, 3).map((vital) => (
                    <div key={vital._id} className="border-t py-2 first:border-0">
                      <p className="font-medium text-slate-800 dark:text-slate-200">BP {vital.bloodPressure ?? "—"} · HR {vital.heartRate ?? "—"} · SpO₂ {vital.oxygenSaturation ?? "—"}%</p>
                      <p className="text-[10px] text-slate-500">
                        {vital.dateRecorded ? new Date(vital.dateRecorded).toLocaleString() : ""}
                        {vital.recordedBy?.name ? ` · ${vital.recordedBy.name}` : ""}
                      </p>
                    </div>
                  ))}
                </section>
              )}

              {(timeline.visits ?? []).length > 0 && (
                <section className="min-w-0 rounded-lg border p-3">
                  <h2 className="mb-2 flex items-center justify-between gap-2 font-semibold">
                    <span>Doctor visits</span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-slate-800">{timeline.visits?.length}</span>
                  </h2>
                  {(timeline.visits ?? []).slice(0, 3).map((visit) => (
                    <div key={visit._id} className="border-t py-2 text-[11px] text-slate-600 first:border-0 dark:text-slate-400">
                      <p className="font-medium text-slate-800 dark:text-slate-200">{visit.visitType ?? "Round"}{visit.condition ? ` · ${visit.condition}` : ""}</p>
                      <p>{visit.dateRecorded ? new Date(visit.dateRecorded).toLocaleString() : ""}
                        {visit.painScore !== undefined && visit.painScore !== null ? ` · pain ${visit.painScore}/10` : ""}
                        {visit.doctor?.name ? ` · Dr. ${visit.doctor.name}` : ""}</p>
                      {visit.assessment && <p className="mt-0.5">{visit.assessment}</p>}
                    </div>
                  ))}
                </section>
              )}

              {(timeline.orders ?? []).length > 0 && (
                <section className="min-w-0 rounded-lg border p-3">
                  <h2 className="mb-2 flex items-center justify-between gap-2 font-semibold">
                    <span>Timed medication orders</span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-slate-800">{timeline.orders?.length}</span>
                  </h2>
                  {(timeline.orders ?? []).slice(0, 4).map((order) => (
                    <div key={order._id} className="border-t py-2 text-[11px] text-slate-600 first:border-0 dark:text-slate-400">
                      <p className="font-medium text-slate-800 dark:text-slate-200">{order.medicationName} {order.dosage}</p>
                      <p>{order.frequency}
                        {order.timesOfDay?.length ? ` · ${order.timesOfDay.join(", ")}` : ""} · {order.status}
                        {order.doseCounts && ` · given ${order.doseCounts.GIVEN ?? 0}, pending ${order.doseCounts.PENDING ?? 0}`}</p>
                    </div>
                  ))}
                </section>
              )}

              {(timeline.tasks ?? []).length === 0 &&
                (timeline.medications ?? []).length === 0 &&
                (timeline.vitals ?? []).length === 0 &&
                (timeline.visits ?? []).length === 0 &&
                (timeline.orders ?? []).length === 0 && (
                  <p className="rounded-lg border border-dashed p-5 text-center text-xs text-slate-500 sm:col-span-2">Nothing recorded for this stay yet.</p>
                )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
