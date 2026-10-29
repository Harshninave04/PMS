"use client";

import React, { useEffect, useState, useMemo, Suspense, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import {
  HeartPulse,
  Search,
  Plus,
  RefreshCw,
  Download,
  CheckCircle2,
  Loader2,
  ChevronDown,
  ChevronRight
} from "lucide-react";

type PatientReference = string | {
  _id?: string;
  name?: string;
  uhid?: string;
};

type VitalRecord = {
  _id: string;
  patient: PatientReference;
  admissionId?: string;
  bloodPressure?: string;
  heartRate?: number;
  oxygenSaturation?: number;
  respiratoryRate?: number;
  temperature?: number;
  dateRecorded?: string;
  createdAt?: string;
};

type Inpatient = {
  patientId: string;
  admissionId?: string;
  name?: string;
  uhid?: string;
  bedNumber?: string | number;
};

type PatientVitalGroup = {
  key: string;
  patientId: string;
  name: string;
  uhid: string;
  bedNumber?: string | number;
  records: VitalRecord[];
};

function patientIdOf(vital: VitalRecord): string {
  return typeof vital.patient === "string" ? vital.patient : vital.patient?._id || "";
}

function patientNameOf(vital: VitalRecord): string {
  return typeof vital.patient === "string" ? "Unknown patient" : vital.patient?.name?.trim() || "Unknown patient";
}

function patientUhidOf(vital: VitalRecord): string {
  return typeof vital.patient === "string" ? "" : vital.patient?.uhid || "";
}

function observationTime(vital: VitalRecord): number {
  const timestamp = new Date(vital.dateRecorded || vital.createdAt || "").getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export default function NursingVitalsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-[450px] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
        </div>
      }
    >
      <NursingVitalsContent />
    </Suspense>
  );
}

function NursingVitalsContent() {
  const searchParams = useSearchParams();
  const initialPatientId = searchParams.get("patientId") || "";
  const initialAdmissionId = searchParams.get("admissionId") || "";
  const { toast } = useToast();

  const [vitals, setVitals] = useState<VitalRecord[]>([]);
  const [inpatients, setInpatients] = useState<Inpatient[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedPatientKey, setExpandedPatientKey] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPatientFilter, setSelectedPatientFilter] = useState(initialPatientId || "ALL");

  // Record Vitals Modal
  const [createOpen, setCreateOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    patient: initialPatientId,
    bloodPressure: "120/80",
    heartRate: "76",
    oxygenSaturation: "98",
    respiratoryRate: "16",
    temperature: "36.8",
    bloodSugar: "110",
    painScore: "0"
  });

  const loadData = useCallback(async () => {
    try {
      const [vitsRes, ptsRes] = await Promise.all([
        fetch("/api/clinical/vitals"),
        fetch("/api/nursing/my-patients")
      ]);

      const [vitsData, ptsData] = await Promise.all([
        vitsRes.json(),
        ptsRes.json()
      ]);

      if (vitsData.success) setVitals(vitsData.data || []);
      if (ptsData.success) {
        setInpatients(ptsData.data || []);
        if (initialPatientId) setCreateOpen(true);
      }
    } catch {
      toast("Failed to load bedside vitals logs", "error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [initialPatientId, toast]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadData(), 0);
    return () => window.clearTimeout(timer);
  }, [loadData]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.patient) {
      toast("Please select an admitted patient", "error");
      return;
    }

    setSubmitting(true);
    try {
      const stayId =
        initialAdmissionId ||
        inpatients.find((p) => p.patientId === formData.patient)?.admissionId ||
        undefined;
      const payload = {
        patient: formData.patient,
        admissionId: stayId,
        bloodPressure: formData.bloodPressure,
        heartRate: formData.heartRate ? parseFloat(formData.heartRate) : undefined,
        oxygenSaturation: formData.oxygenSaturation ? parseFloat(formData.oxygenSaturation) : undefined,
        respiratoryRate: formData.respiratoryRate ? parseFloat(formData.respiratoryRate) : undefined,
        temperature: formData.temperature ? parseFloat(formData.temperature) : undefined,
        dateRecorded: new Date().toISOString()
      };

      const res = await fetch("/api/clinical/vitals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast("Bedside vital signs recorded successfully!", "success");
        setCreateOpen(false);
        setFormData({
          patient: selectedPatientFilter !== "ALL" ? selectedPatientFilter : "",
          bloodPressure: "120/80",
          heartRate: "76",
          oxygenSaturation: "98",
          respiratoryRate: "16",
          temperature: "36.8",
          bloodSugar: "110",
          painScore: "0"
        });
        loadData();
      } else {
        toast(data.error || "Failed to log vitals", "error");
      }
    } catch {
      toast("An error occurred while logging vitals", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const getDeteriorationStatus = (v: VitalRecord) => {
    const spo2 = v.oxygenSaturation;
    const hr = v.heartRate;
    const temp = v.temperature;

    if ((spo2 && spo2 < 92) || (hr && (hr > 125 || hr < 48)) || (temp && temp > 39)) {
      return { label: "CRITICAL", color: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border-rose-300" };
    }
    if ((spo2 && spo2 < 95) || (hr && (hr > 105 || hr < 58)) || (temp && temp > 37.8)) {
      return { label: "WARNING", color: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-amber-300" };
    }
    return { label: "STABLE", color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-300" };
  };

  const filteredVitals = useMemo(() => {
    return vitals.filter((v) => {
      const q = searchQuery.toLowerCase().trim();
      const patName = patientNameOf(v).toLowerCase();
      const uhid = patientUhidOf(v).toLowerCase();
      const bp = (v.bloodPressure || "").toLowerCase();

      const matchesSearch = !q || patName.includes(q) || uhid.includes(q) || bp.includes(q);

      let matchesPatient = true;
      if (selectedPatientFilter !== "ALL") {
        matchesPatient = patientIdOf(v) === selectedPatientFilter;
      }

      return matchesSearch && matchesPatient;
    });
  }, [vitals, searchQuery, selectedPatientFilter]);

  const groupedVitals = useMemo(() => {
    const groups = new Map<string, PatientVitalGroup>();
    for (const vital of filteredVitals) {
      const patientId = patientIdOf(vital);
      const name = patientNameOf(vital);
      const normalizedName = name.toLocaleLowerCase().replace(/\s+/g, " ");
      const key = patientId ? `${normalizedName}:${patientId}` : normalizedName;
      const patient = typeof vital.patient === "string" ? undefined : vital.patient;
      let group = groups.get(key);
      if (!group) {
        const inpatient = inpatients.find((item) => item.patientId === patientId);
        group = {
          key,
          patientId,
          name,
          uhid: patient?.uhid || inpatient?.uhid || "",
          bedNumber: inpatient?.bedNumber,
          records: [],
        };
        groups.set(key, group);
      }
      group.records.push(vital);
    }

    return Array.from(groups.values())
      .map((group) => ({
        ...group,
        records: [...group.records].sort((a, b) => observationTime(a) - observationTime(b)),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [filteredVitals, inpatients]);

  const exportCSV = () => {
    if (filteredVitals.length === 0) {
      toast("No vitals to export", "error");
      return;
    }

    const headers = [
      "Timestamp",
      "Patient Name",
      "UHID",
      "Blood Pressure (mmHg)",
      "Heart Rate (bpm)",
      "SpO2 (%)",
      "Resp Rate (/min)",
      "Temp (°C)",
      "Status"
    ];

    const rows = filteredVitals.map((v) => [
      `"${observationTime(v) ? new Date(observationTime(v)).toLocaleString() : ""}"`,
      `"${patientNameOf(v)}"`,
      `"${patientUhidOf(v)}"`,
      `"${v.bloodPressure || "N/A"}"`,
      v.heartRate || "",
      v.oxygenSaturation || "",
      v.respiratoryRate || "",
      v.temperature || "",
      getDeteriorationStatus(v).label
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Bedside_Vitals_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast("Bedside vitals exported successfully", "success");
  };

  if (loading) {
    return (
      <div className="flex h-[450px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <HeartPulse className="h-6 w-6 text-rose-600 dark:text-rose-400" />
            Bedside Vital Signs Monitoring
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Rapid bedside vitals capture, early warning scoring, oxygenation saturation monitoring, and trend analysis.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-1.5"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={exportCSV}
            className="flex items-center gap-1.5"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </Button>

          <Button
            size="sm"
            className="bg-rose-600 hover:bg-rose-700 text-white flex items-center gap-1.5"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="h-4 w-4" />
            Log Vital Signs
          </Button>
        </div>
      </div>

      {/* Filter Bar */}
      <Card className="border shadow-sm">
        <CardContent className="p-3">
          <div className="flex flex-col sm:flex-row items-center gap-3">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search patient name, UHID, blood pressure reading..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9 text-xs"
              />
            </div>

            <div className="w-full sm:w-60">
              <Select
                value={selectedPatientFilter}
                onChange={(e) => setSelectedPatientFilter(e.target.value)}
                className="h-9 text-xs"
              >
                <option value="ALL">All Inpatients</option>
                {inpatients.map((p) => (
                  <option key={p.patientId} value={p.patientId}>
                    Bed {p.bedNumber} - {p.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Vitals Table */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Vital Signs Observation Ledger</CardTitle>
          <CardDescription>
            Showing {groupedVitals.length} of {new Set(vitals.map((vital) => {
              const patientId = patientIdOf(vital);
              const name = patientNameOf(vital).toLocaleLowerCase().replace(/\s+/g, " ");
              return patientId ? `${name}:${patientId}` : name;
            })).size} patients · {filteredVitals.length} observations
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Patient particulars</TableHead>
                  <TableHead>Bed</TableHead>
                  <TableHead className="text-center">Observations</TableHead>
                  <TableHead>Latest observation</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groupedVitals.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-slate-500 py-12 text-xs">
                      No vital signs records found matching filter criteria.
                    </TableCell>
                  </TableRow>
                ) : (
                  groupedVitals.map((group) => {
                    const latest = group.records.at(-1)!;
                    const expanded = expandedPatientKey === group.key;
                    return (
                      <React.Fragment key={group.key}>
                        <TableRow
                          className="cursor-pointer text-xs hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                          aria-expanded={expanded}
                          onClick={() => setExpandedPatientKey(expanded ? null : group.key)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              setExpandedPatientKey(expanded ? null : group.key);
                            }
                          }}
                          role="button"
                          tabIndex={0}
                        >
                          <TableCell>
                            <div className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white">
                              {expanded ? <ChevronDown className="h-4 w-4 text-rose-600" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
                              {group.name}
                            </div>
                            <div className="ml-6 text-[10px] font-mono text-slate-400">{group.uhid || "UHID unavailable"}</div>
                          </TableCell>
                          <TableCell>{group.bedNumber ?? "—"}</TableCell>
                          <TableCell className="text-center">
                            <Badge className="border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                              {group.records.length}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-mono text-slate-500 whitespace-nowrap">
                            {observationTime(latest) ? new Date(observationTime(latest)).toLocaleString([], { dateStyle: "short", timeStyle: "short" }) : "Date unavailable"}
                          </TableCell>
                        </TableRow>
                        {expanded && (
                          <TableRow>
                            <TableCell colSpan={4} className="bg-slate-50/70 p-3 dark:bg-slate-900/40">
                              <div className="overflow-x-auto rounded-md border bg-white dark:bg-slate-950">
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead>Observation time</TableHead>
                                      <TableHead className="text-center">BP (mmHg)</TableHead>
                                      <TableHead className="text-center">Pulse (bpm)</TableHead>
                                      <TableHead className="text-center">SpO2 (%)</TableHead>
                                      <TableHead className="text-center">Resp (/min)</TableHead>
                                      <TableHead className="text-center">Temp (°C)</TableHead>
                                      <TableHead>Deterioration alert</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {group.records.map((vital, index) => {
                                      const status = getDeteriorationStatus(vital);
                                      const isLatest = index === group.records.length - 1;
                                      return (
                                        <TableRow key={vital._id} className={`text-xs ${isLatest ? "bg-rose-50/70 dark:bg-rose-950/20" : ""}`}>
                                          <TableCell className="whitespace-nowrap font-mono text-slate-500">
                                            {observationTime(vital) ? new Date(observationTime(vital)).toLocaleString([], { dateStyle: "short", timeStyle: "short" }) : "Date unavailable"}
                                            {isLatest && <Badge className="ml-2 border-rose-300 bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">Latest</Badge>}
                                          </TableCell>
                                          <TableCell className="text-center font-mono font-bold">{vital.bloodPressure || "—"}</TableCell>
                                          <TableCell className="text-center font-mono">{vital.heartRate ?? "—"}</TableCell>
                                          <TableCell className="text-center font-mono font-bold text-emerald-600">{vital.oxygenSaturation != null ? `${vital.oxygenSaturation}%` : "—"}</TableCell>
                                          <TableCell className="text-center font-mono">{vital.respiratoryRate ?? "—"}</TableCell>
                                          <TableCell className="text-center font-mono">{vital.temperature != null ? `${vital.temperature}°` : "—"}</TableCell>
                                          <TableCell><Badge className={`text-[10px] ${status.color}`}>{status.label}</Badge></TableCell>
                                        </TableRow>
                                      );
                                    })}
                                  </TableBody>
                                </Table>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Log Vital Signs Modal */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <form onSubmit={handleCreateSubmit}>
            <DialogHeader>
              <DialogTitle className="text-base font-bold flex items-center gap-2">
                <HeartPulse className="h-5 w-5 text-rose-600" />
                Record Bedside Vital Signs
              </DialogTitle>
              <DialogDescription>
                Log physical parameters for early warning score assessment.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4 text-xs">
              <div className="space-y-1.5">
                <Label htmlFor="patient" className="text-xs font-semibold">
                  Inpatient *
                </Label>
                <Select
                  id="patient"
                  value={formData.patient}
                  onChange={(e) => setFormData({ ...formData, patient: e.target.value })}
                  required
                  className="h-9 text-xs"
                >
                  <option value="">-- Select Inpatient --</option>
                  {inpatients.map((p) => (
                    <option key={p.patientId} value={p.patientId}>
                      Bed {p.bedNumber} - {p.name} ({p.uhid})
                    </option>
                  ))}
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border">
                <div className="space-y-1">
                  <Label htmlFor="bp" className="text-[11px] font-semibold">
                    Blood Pressure (mmHg)
                  </Label>
                  <Input
                    id="bp"
                    placeholder="120/80"
                    value={formData.bloodPressure}
                    onChange={(e) => setFormData({ ...formData, bloodPressure: e.target.value })}
                    className="h-8 text-xs font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="hr" className="text-[11px] font-semibold">
                    Pulse / Heart Rate (bpm)
                  </Label>
                  <Input
                    type="number"
                    id="hr"
                    placeholder="76"
                    value={formData.heartRate}
                    onChange={(e) => setFormData({ ...formData, heartRate: e.target.value })}
                    className="h-8 text-xs font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="spo2" className="text-[11px] font-semibold">
                    SpO2 Saturation (%)
                  </Label>
                  <Input
                    type="number"
                    id="spo2"
                    placeholder="98"
                    value={formData.oxygenSaturation}
                    onChange={(e) => setFormData({ ...formData, oxygenSaturation: e.target.value })}
                    className="h-8 text-xs font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="rr" className="text-[11px] font-semibold">
                    Respiratory Rate (/min)
                  </Label>
                  <Input
                    type="number"
                    id="rr"
                    placeholder="16"
                    value={formData.respiratoryRate}
                    onChange={(e) => setFormData({ ...formData, respiratoryRate: e.target.value })}
                    className="h-8 text-xs font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="temp" className="text-[11px] font-semibold">
                    Temperature (°C)
                  </Label>
                  <Input
                    type="number"
                    step="0.1"
                    id="temp"
                    placeholder="36.8"
                    value={formData.temperature}
                    onChange={(e) => setFormData({ ...formData, temperature: e.target.value })}
                    className="h-8 text-xs font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="bs" className="text-[11px] font-semibold">
                    Random Glucose (mg/dL)
                  </Label>
                  <Input
                    type="number"
                    id="bs"
                    placeholder="110"
                    value={formData.bloodSugar}
                    onChange={(e) => setFormData({ ...formData, bloodSugar: e.target.value })}
                    className="h-8 text-xs font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="pain" className="text-xs font-semibold">
                  Pain Score (Numeric Rating 0 - 10)
                </Label>
                <Select
                  id="pain"
                  value={formData.painScore}
                  onChange={(e) => setFormData({ ...formData, painScore: e.target.value })}
                  className="h-9 text-xs"
                >
                  <option value="0">0 - No Pain</option>
                  <option value="1">1 - Minimal</option>
                  <option value="2">2 - Mild</option>
                  <option value="4">4 - Moderate</option>
                  <option value="6">6 - Moderately Severe</option>
                  <option value="8">8 - Severe</option>
                  <option value="10">10 - Worst Possible Pain</option>
                </Select>
              </div>
            </div>

            <DialogFooter className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)} disabled={submitting}>
                Cancel
              </Button>
              <Button type="submit" className="bg-rose-600 hover:bg-rose-700 text-white" disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Recording...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    Save Vitals
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
