"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { formatDoctorName } from "@/lib/name-formatter";
import { ConsultationModal } from "@/components/consultation/consultation-modal";
import type { ConsultationAppointment } from "@/types/consultation";
import {
  Clock,
  CheckCircle2,
  Play,
  ArrowRight,
  Stethoscope,
  RefreshCw,
  Volume2,
} from "lucide-react";

type QueueItem = ConsultationAppointment;

export default function AppointmentQueuePage() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [metrics, setMetrics] = useState({
    waiting: 0,
    inConsultation: 0,
    completed: 0,
  });
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [consultationModalOpen, setConsultationModalOpen] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<QueueItem | null>(null);

  const { toast } = useToast();

  async function fetchQueue() {
    try {
      setLoading(true);
      const url = "/api/appointments/queue";

      const qRes = await fetch(url);
      const qJson = await qRes.json();

      if (qJson.success) {
        setQueue(qJson.data || []);
        if (qJson.metrics) {
          setMetrics({
            waiting: qJson.metrics.waiting || 0,
            inConsultation: qJson.metrics.inConsultation || 0,
            completed: qJson.metrics.completed || 0,
          });
        }
      }
    } catch (err: any) {
      toast({ title: "Error", description: "Failed to load queue.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchQueue();
    const interval = setInterval(fetchQueue, 30000);
    return () => clearInterval(interval);
  }, []);

  // Advance queue state
  const handleQueueAction = async (appointmentId: string, action: string) => {
    try {
      setProcessingId(appointmentId);
      const res = await fetch("/api/appointments/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appointmentId, action }),
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: "Queue Updated", description: `Patient moved to ${action.replace("_", " ")}.` });
        fetchQueue();
      } else {
        toast({ title: "Error", description: data.error, variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setProcessingId(null);
    }
  };

  // Call the next waiting patient (WAITING -> CALLED)
  const handleCallNext = async () => {
    try {
      setProcessingId("CALL_NEXT");
      const res = await fetch("/api/appointments/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "CALL_NEXT" }),
      });
      const data = await res.json();
      if (data.success) {
        toast({
          title: "Patient Called",
          description: `${data.data?.tokenNumber || "Token"} - ${data.data?.patientId?.name || "Patient"} called.`,
        });
        fetchQueue();
      } else {
        toast({ title: "Cannot Call Patient", description: data.error || "No patients waiting.", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setProcessingId(null);
    }
  };

  // Group queue by stages
  const isConsulting = (q: QueueItem) =>
    q.queueStatus === "IN_CONSULTATION" || q.status === "IN_PROGRESS";
  const isFinished = (q: QueueItem) =>
    ["COMPLETED", "NO_SHOW", "CANCELLED", "SKIPPED"].includes(q.queueStatus || "") ||
    ["COMPLETED", "CANCELLED", "NO_SHOW"].includes(q.status);

  const inConsultationList = queue.filter(isConsulting);
  const finishedList = queue.filter(isFinished);
  const nextList = queue.filter((q) => !isConsulting(q) && !isFinished(q));
  // Still in the waiting area: not yet called, or called but not taken inside.
  const waitingList = nextList;
  const completedList = queue.filter(
    (q) => q.queueStatus === "COMPLETED" || q.status === "COMPLETED"
  );
  const callNextDisabled =
    processingId === "CALL_NEXT" || nextList.filter((q) => q.queueStatus === "WAITING").length === 0;

  // Active consulting patient
  const currentServing = inConsultationList[0] || null;
  const nextInLine = nextList[0] || null;

  const getQueueBadge = (item: QueueItem) => {
    switch (item.queueStatus) {
      case "CALLED":
        return <Badge className="bg-blue-600 hover:bg-blue-700 text-white text-[10px]">Called</Badge>;
      case "IN_CONSULTATION":
        return <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white text-[10px]">In Consultation</Badge>;
      case "COMPLETED":
        return <Badge className="bg-green-600 hover:bg-green-700 text-white text-[10px]">Completed</Badge>;
      case "NO_SHOW":
        return <Badge variant="outline" className="text-red-500 border-red-400 text-[10px]">No Show</Badge>;
      case "CANCELLED":
        return <Badge variant="destructive" className="text-[10px]">Cancelled</Badge>;
      default:
        return <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 border border-amber-200 dark:border-amber-800 text-[10px]">Waiting</Badge>;
    }
  };

  const getPriorityBadge = (priority?: string) => {
    if (!priority || priority === "NORMAL") return null;
    const tone =
      priority === "EMERGENCY" || priority === "URGENT"
        ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
        : "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300";
    return <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${tone}`}>{priority}</span>;
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            OPD Token Queue & Waiting Room
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Real-time outpatient caller, consultation room progression, and token tracking.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={handleCallNext}
            disabled={callNextDisabled}
            className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 text-xs font-semibold"
            title="Call the next waiting patient"
          >
            <Volume2 className="h-3.5 w-3.5" /> CALL NEXT
          </Button>
          <Button variant="outline" size="sm" onClick={fetchQueue} className="gap-1 text-xs">
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card className="border-slate-200/80 dark:border-slate-800">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-500/10 border border-amber-100 dark:border-amber-500/20">
              <Clock className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">Waiting</p>
              <h3 className="text-2xl font-bold text-slate-900 dark:text-white">{metrics.waiting}</h3>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200/80 dark:border-slate-800">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20">
              <Stethoscope className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">In Consultation</p>
              <h3 className="text-2xl font-bold text-slate-900 dark:text-white">{metrics.inConsultation}</h3>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200/80 dark:border-slate-800">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-green-50 text-green-600 dark:bg-green-500/10 border border-green-100 dark:border-green-500/20">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">Completed Today</p>
              <h3 className="text-2xl font-bold text-slate-900 dark:text-white">{metrics.completed}</h3>
            </div>
          </CardContent>
        </Card>
      </div>



      {/* Control Banner: Current Serving & Next in Line */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Current Active Consultation */}
        <Card className="border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/40 dark:bg-emerald-950/20 shadow-sm">
          <CardContent className="p-5 flex flex-col justify-between h-full space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                Now Inside with Doctor
              </span>
              <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white font-mono text-sm px-2.5 py-0.5">
                {currentServing?.tokenNumber || "No Active"}
              </Badge>
            </div>

            {currentServing ? (
              <div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                  {currentServing.patientId?.name}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {formatDoctorName(currentServing.doctorId?.userId?.name || currentServing.doctorId?.name)}
                </p>
                <p className="text-xs text-slate-700 dark:text-slate-300 font-medium mt-2">
                  Complaint: {currentServing.reason}
                </p>
              </div>
            ) : (
              <p className="text-sm text-slate-500 py-4">Physician is ready for the next patient.</p>
            )}

            {currentServing && (
              <div className="flex gap-2 pt-2 border-t border-emerald-100 dark:border-emerald-800/40">
                <Button
                  size="sm"
                  onClick={() => {
                    setSelectedAppointment(currentServing);
                    setConsultationModalOpen(true);
                  }}
                  disabled={processingId === currentServing._id}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs gap-1.5 flex-1"
                >
                  <CheckCircle2 className="h-4 w-4" /> Start Consultation
                </Button>

              </div>
            )}
          </CardContent>
        </Card>

        {/* Next Patient in Line */}
        <Card className="border-blue-200 dark:border-blue-800/60 bg-blue-50/40 dark:bg-blue-950/20 shadow-sm">
          <CardContent className="p-5 flex flex-col justify-between h-full space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-blue-700 dark:text-blue-400">
                Next in Line
              </span>
              <Badge variant="outline" className="font-mono text-sm px-2.5 py-0.5 border-blue-400 text-blue-700 dark:text-blue-300">
                {nextInLine?.tokenNumber || "Queue Empty"}
              </Badge>
            </div>

            {nextInLine ? (
              <div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                  {nextInLine.patientId?.name}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {formatDoctorName(nextInLine.doctorId?.userId?.name || nextInLine.doctorId?.name)}
                </p>
                <p className="text-xs text-slate-700 dark:text-slate-300 font-medium mt-2">
                  Complaint: {nextInLine.reason}
                </p>
              </div>
            ) : (
              <p className="text-sm text-slate-500 py-4">No waiting patients in queue.</p>
            )}

            {nextInLine && (
              <div className="pt-2 border-t border-blue-100 dark:border-blue-800/40">
                <Button
                  size="sm"
                  onClick={() => handleQueueAction(nextInLine._id, "START_CONSULTATION")}
                  disabled={processingId === nextInLine._id}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-xs gap-1.5 w-full"
                >
                  <Play className="h-4 w-4" /> Call Next Patient
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Queue Columns (Waiting, In Consultation, Completed) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Column 1: Waiting Room */}
        <Card className="border-slate-200/80 dark:border-slate-800">
          <CardHeader className="bg-slate-50/50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800/80 p-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Clock className="h-4 w-4 text-amber-500" /> Waiting Room ({waitingList.length})
              </CardTitle>
              <Badge variant="outline" className="text-[10px]">In Line</Badge>
            </div>
          </CardHeader>
          <CardContent className="p-3 space-y-2.5 max-h-[500px] overflow-y-auto">
            {waitingList.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-8">Waiting area is clear</p>
            ) : (
              waitingList.map((item) => (
                <div
                  key={item._id}
                  className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono font-bold text-xs bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300 px-1.5 py-0.5 rounded border border-amber-200 dark:border-amber-800">
                        {item.tokenNumber || "T-??"}
                      </span>
                      {getPriorityBadge(item.priority)}
                    </div>
                    <span className="text-[11px] text-slate-400">{item.appointmentTime}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-semibold text-xs text-slate-900 dark:text-white truncate">
                      {item.patientId?.name}
                    </div>
                    {getQueueBadge(item)}
                  </div>
                  <div className="text-[11px] text-slate-500 truncate">{item.reason}</div>
                  <div className="pt-2 flex justify-end">
                    <button
                      onClick={() => handleQueueAction(item._id, "START_CONSULTATION")}
                      className="text-[11px] font-semibold text-blue-600 hover:underline flex items-center gap-1"
                    >
                      Call Inside <ArrowRight className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Column 2: In Consultation */}
        <Card className="border-slate-200/80 dark:border-slate-800">
          <CardHeader className="bg-slate-50/50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800/80 p-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Stethoscope className="h-4 w-4 text-emerald-500" /> In Consultation ({inConsultationList.length})
              </CardTitle>
              <Badge className="bg-emerald-600 text-white text-[10px]">Active</Badge>
            </div>
          </CardHeader>
          <CardContent className="p-3 space-y-2.5 max-h-[500px] overflow-y-auto">
            {inConsultationList.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-8">No active consultations</p>
            ) : (
              inConsultationList.map((item) => (
                <div
                  key={item._id}
                  className="p-3 rounded-lg border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/30 dark:bg-emerald-950/20 space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-xs bg-emerald-600 text-white px-2 py-0.5 rounded">
                      {item.tokenNumber}
                    </span>
                    <span className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium animate-pulse">
                      In Progress
                    </span>
                  </div>
                  <div className="font-semibold text-xs text-slate-900 dark:text-white">
                    {item.patientId?.name}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {formatDoctorName(item.doctorId?.userId?.name || item.doctorId?.name)}
                  </div>
                  <div className="pt-2 flex justify-end gap-2">
                    <button
                      onClick={() => {
                        setSelectedAppointment(item);
                        setConsultationModalOpen(true);
                      }}
                      className="text-[11px] font-semibold text-emerald-600 hover:underline flex items-center gap-1"
                    >
                      Start Consultation
                    </button>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Column 3: Completed Today */}
        <Card className="border-slate-200/80 dark:border-slate-800">
          <CardHeader className="bg-slate-50/50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800/80 p-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" /> Finished Today ({completedList.length})
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-3 space-y-2.5 max-h-[500px] overflow-y-auto">
            {completedList.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-8">No completed visits yet today</p>
            ) : (
              completedList.map((item) => (
                <div
                  key={item._id}
                  className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-1 opacity-80"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-semibold text-slate-600 dark:text-slate-400">
                      {item.tokenNumber}
                    </span>
                    <Badge variant="default" className="text-[9px] bg-green-600">Completed</Badge>
                  </div>
                  <div className="font-medium text-xs text-slate-900 dark:text-white">
                    {item.patientId?.name}
                  </div>
                  <div className="text-[10px] text-slate-400">
                    {formatDoctorName(item.doctorId?.userId?.name || item.doctorId?.name)}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <ConsultationModal
        open={consultationModalOpen}
        appointment={selectedAppointment}
        onOpenChange={(open) => {
          setConsultationModalOpen(open);
          if (!open) setSelectedAppointment(null);
        }}
        onSaved={fetchQueue}
      />
    </div>
  );
}
