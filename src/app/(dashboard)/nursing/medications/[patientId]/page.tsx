"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Pill,
  RefreshCw,
  Trash2,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";

type Inpatient = {
  patientId: string;
  name: string;
  uhid?: string;
  bedNumber?: string | number;
};

type MedicationOrder = {
  frequency?: string;
  timesOfDay?: string[];
  instructions?: string;
};

type MedicationRecord = {
  _id: string;
  patient?: string | { _id?: string; name?: string; uhid?: string };
  admissionId?: string | { _id?: string; status?: string };
  orderId?: string | MedicationOrder;
  medicationName: string;
  dosage?: string;
  route?: string;
  scheduledTime: string;
  administeredTime?: string;
  administeredBy?: { name?: string };
  status: "GIVEN" | "PENDING" | "WITHHELD" | "REFUSED";
  withheldReason?: string;
  notes?: string;
};

type ApiResult<T> = {
  success: boolean;
  message?: string;
  data: T;
};

function isMedicationOrder(order: MedicationRecord["orderId"]): order is MedicationOrder {
  return Boolean(order && typeof order === "object");
}

function statusLabel(status: MedicationRecord["status"]) {
  if (status === "PENDING") return "Pending";
  if (status === "GIVEN") return "Given";
  if (status === "WITHHELD") return "Withheld";
  return "Refused";
}

function statusClass(status: MedicationRecord["status"]) {
  if (status === "PENDING") return "border-amber-300 bg-amber-100 text-amber-800";
  if (status === "GIVEN") return "border-emerald-300 bg-emerald-100 text-emerald-800";
  return "border-rose-300 bg-rose-100 text-rose-800";
}

export default function PatientMedicationRoundsPage() {
  const { patientId } = useParams<{ patientId: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const [patient, setPatient] = useState<Inpatient | null>(null);
  const [medications, setMedications] = useState<MedicationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currentTime, setCurrentTime] = useState<number | null>(null);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [withholdTarget, setWithholdTarget] = useState<MedicationRecord | null>(null);
  const [withholdReason, setWithholdReason] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const loadPatientData = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    setErrorMessage("");
    try {
      const [rosterResponse, medicationResponse] = await Promise.all([
        fetch("/api/nursing/my-patients"),
        fetch(`/api/nursing/medications?patientId=${encodeURIComponent(patientId)}`),
      ]);
      const [rosterResult, medicationResult] = await Promise.all([
        rosterResponse.json() as Promise<ApiResult<Inpatient[]>>,
        medicationResponse.json() as Promise<ApiResult<MedicationRecord[]>>,
      ]);
      if (!rosterResponse.ok || !rosterResult.success) {
        throw new Error(rosterResult.message || "Unable to verify your patient assignment");
      }

      const assignedPatient = (rosterResult.data ?? []).find(
        (item) => String(item.patientId) === patientId,
      );
      if (!assignedPatient) {
        throw new Error("This patient is not currently assigned to you or is no longer admitted");
      }
      if (!medicationResponse.ok || !medicationResult.success) {
        throw new Error(medicationResult.message || "Unable to load medication records");
      }

      setPatient(assignedPatient);
      setMedications(medicationResult.data ?? []);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load medication records";
      setErrorMessage(message);
      setPatient(null);
      setMedications([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [patientId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadPatientData(), 0);
    return () => window.clearTimeout(timer);
  }, [loadPatientData]);

  useEffect(() => {
    const initialTimer = window.setTimeout(() => setCurrentTime(Date.now()), 0);
    const clockTimer = window.setInterval(() => setCurrentTime(Date.now()), 15000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(clockTimer);
    };
  }, []);

  const recordGiven = async (medication: MedicationRecord) => {
    setWorkingId(medication._id);
    try {
      const response = await fetch(`/api/nursing/medications/${encodeURIComponent(medication._id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "GIVEN", administeredTime: new Date().toISOString() }),
      });
      const result = await response.json() as ApiResult<unknown>;
      if (!response.ok || !result.success) throw new Error(result.message || "Failed to record administration");
      toast(`Administered ${medication.medicationName} successfully!`, "success");
      await loadPatientData(false);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Error recording administration", "error");
    } finally {
      setWorkingId(null);
    }
  };

  const withholdDose = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!withholdTarget || !withholdReason) return;
    setWorkingId(withholdTarget._id);
    try {
      const response = await fetch(`/api/nursing/medications/${encodeURIComponent(withholdTarget._id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "WITHHELD", withheldReason: withholdReason }),
      });
      const result = await response.json() as ApiResult<unknown>;
      if (!response.ok || !result.success) throw new Error(result.message || "Failed to withhold medication");
      toast("Dose marked as withheld", "success");
      setWithholdTarget(null);
      setWithholdReason("");
      await loadPatientData(false);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Error withholding medication", "error");
    } finally {
      setWorkingId(null);
    }
  };

  const deleteSchedule = async (medication: MedicationRecord) => {
    if (!window.confirm("Are you sure you want to delete this medication schedule?")) return;
    setWorkingId(medication._id);
    try {
      const response = await fetch(`/api/nursing/medications/${encodeURIComponent(medication._id)}`, {
        method: "DELETE",
      });
      const result = await response.json() as ApiResult<unknown>;
      if (!response.ok || !result.success) throw new Error(result.message || "Failed to remove medication");
      toast("Medication schedule removed", "success");
      await loadPatientData(false);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Error deleting medication", "error");
    } finally {
      setWorkingId(null);
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
    <div className="space-y-4 pb-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Button type="button" variant="outline" size="sm" onClick={() => router.push("/nursing/medications")}>
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Medication rounds
          </Button>
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 truncate text-xl font-bold tracking-tight text-slate-900 dark:text-white">
              <Pill className="h-5 w-5 shrink-0 text-purple-600" />
              {patient?.name ?? "Patient medication rounds"}
            </h1>
            <p className="truncate text-xs text-slate-500">
              UHID: {patient?.uhid || "—"} · Bed {patient?.bedNumber ?? "—"}
            </p>
          </div>
        </div>
        <Button type="button" variant="outline" size="sm" disabled={refreshing} onClick={() => {
          setRefreshing(true);
          void loadPatientData(false);
        }}>
          {refreshing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Refresh
        </Button>
      </div>

      {errorMessage ? (
        <Card className="border-rose-200 shadow-sm">
          <CardContent className="space-y-3 p-5 text-center">
            <p role="alert" className="text-sm text-rose-700">{errorMessage}</p>
            <Button type="button" variant="outline" size="sm" onClick={() => router.push("/nursing/medications")}>
              Return to Medication Rounds
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Medication records</CardTitle>
            <CardDescription>
              {medications.length} individual doses for this patient. Each dose retains its own schedule, status, and administration record.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Medication ID</TableHead>
                    <TableHead>Due date &amp; time</TableHead>
                    <TableHead>Medicine, dosage &amp; route</TableHead>
                    <TableHead>Doctor&apos;s instructions</TableHead>
                    <TableHead>Administration / withholding</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {medications.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="py-10 text-center text-xs text-slate-500">
                        No medication records found for this patient.
                      </TableCell>
                    </TableRow>
                  ) : medications.map((medication) => {
                    const isPending = medication.status === "PENDING";
                    const isFutureDose = currentTime === null || new Date(medication.scheduledTime).getTime() > currentTime;
                    const order = isMedicationOrder(medication.orderId) ? medication.orderId : null;
                    return (
                      <TableRow key={medication._id} className="align-top text-xs">
                        <TableCell className="max-w-32 break-all font-mono text-[10px] text-slate-500">{medication._id}</TableCell>
                        <TableCell className="whitespace-nowrap text-slate-600">
                          {new Date(medication.scheduledTime).toLocaleString()}
                        </TableCell>
                        <TableCell className="min-w-40">
                          <p className="font-semibold text-slate-900 dark:text-white">{medication.medicationName}</p>
                          <p className="mt-1 text-[11px] text-slate-600 dark:text-slate-300">
                            {medication.dosage?.trim() || "Dose not specified, confirm with doctor"} · {medication.route || "—"}
                          </p>
                        </TableCell>
                        <TableCell className="min-w-48 whitespace-pre-wrap text-[11px] text-slate-600 dark:text-slate-300">
                          {order ? (
                            <>
                              {order.frequency && <p>{order.frequency}{order.timesOfDay?.length ? ` · ${order.timesOfDay.join(", ")}` : ""}</p>}
                              {order.instructions && <p className="mt-1">{order.instructions}</p>}
                            </>
                          ) : null}
                          {medication.notes && <p className="mt-1 text-slate-500">Note: {medication.notes}</p>}
                          {!order?.frequency && !order?.instructions && !medication.notes && "—"}
                        </TableCell>
                        <TableCell className="min-w-48 text-[11px]">
                          {medication.administeredBy?.name ? (
                            <p className="text-emerald-700 dark:text-emerald-400">
                              Given by {medication.administeredBy.name}
                              {medication.administeredTime ? ` · ${new Date(medication.administeredTime).toLocaleString()}` : ""}
                            </p>
                          ) : null}
                          {medication.withheldReason && (
                            <p className="mt-1 text-rose-600">Withheld: {medication.withheldReason}</p>
                          )}
                          {!medication.administeredBy?.name && !medication.withheldReason && "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={statusClass(medication.status)}>
                            {statusLabel(medication.status)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex min-w-36 flex-wrap items-center justify-end gap-1">
                            {isPending && (
                              <>
                                {isFutureDose ? (
                                  <span className="text-right text-[10px] text-slate-500">
                                    Scheduled for {new Date(medication.scheduledTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                  </span>
                                ) : (
                                  <Button size="sm" className="h-8 bg-emerald-600 px-2 text-[10px] text-white hover:bg-emerald-700" disabled={workingId === medication._id} onClick={() => void recordGiven(medication)}>
                                    <CheckCircle2 className="mr-1 h-3 w-3" />
                                    {workingId === medication._id ? "Saving…" : "Record given"}
                                  </Button>
                                )}
                                <Button type="button" variant="outline" size="sm" className="h-8 border-rose-200 px-2 text-[10px] text-rose-600 hover:bg-rose-50" disabled={workingId === medication._id} onClick={() => setWithholdTarget(medication)}>
                                  <XCircle className="mr-1 h-3 w-3" /> Not given
                                </Button>
                              </>
                            )}
                            <Button type="button" variant="ghost" size="sm" aria-label={`Delete ${medication.medicationName} schedule`} className="h-8 px-2 text-rose-600 hover:text-rose-700" disabled={workingId === medication._id} onClick={() => void deleteSchedule(medication)}>
                              {workingId === medication._id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={!!withholdTarget} onOpenChange={(open) => {
        if (!open && !workingId) {
          setWithholdTarget(null);
          setWithholdReason("");
        }
      }}>
        <DialogContent>
          <form onSubmit={withholdDose}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <XCircle className="h-5 w-5 text-rose-600" />
                Withhold medication dose
              </DialogTitle>
              <DialogDescription>
                State the clinical reason for withholding {withholdTarget?.medicationName}.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5 py-4">
              <Label htmlFor="withhold-reason" className="text-xs font-semibold">Clinical reason / contraindication *</Label>
              <Select id="withhold-reason" value={withholdReason} onChange={(event) => setWithholdReason(event.target.value)} required>
                <option value="">-- Choose Reason --</option>
                <option value="Patient NPO for procedure">Patient NPO for procedure</option>
                <option value="Low Blood Pressure (Hypotension)">Low Blood Pressure (Hypotension)</option>
                <option value="Low Heart Rate (Bradycardia)">Low Heart Rate (Bradycardia)</option>
                <option value="Patient Refused">Patient Refused</option>
                <option value="Doctor verbally held dose">Doctor verbally held dose</option>
                <option value="Adverse reaction suspected">Adverse reaction suspected</option>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" disabled={!!workingId} onClick={() => setWithholdTarget(null)}>Cancel</Button>
              <Button type="submit" className="bg-rose-600 text-white hover:bg-rose-700" disabled={!withholdReason || !!workingId}>
                {workingId === withholdTarget?._id && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Confirm Withhold
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
