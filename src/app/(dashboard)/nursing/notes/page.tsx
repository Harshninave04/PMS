"use client";

import React, { useEffect, useState, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import {
  FileText,
  Search,
  Plus,
  RefreshCw,
  Download,
  Eye,
  Trash2,
  CheckCircle2,
  Loader2
} from "lucide-react";

export default function NursingNotesPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-[450px] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
        </div>
      }
    >
      <NursingNotesContent />
    </Suspense>
  );
}

function NursingNotesContent() {
  const searchParams = useSearchParams();
  const initialPatientId = searchParams.get("patientId") || "";
  const initialAdmissionId = searchParams.get("admissionId") || "";
  const { toast } = useToast();

  const [notes, setNotes] = useState<any[]>([]);
  const [inpatients, setInpatients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPatientFilter, setSelectedPatientFilter] = useState(initialPatientId || "ALL");

  // Create Modal
  const [createOpen, setCreateOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    patient: initialPatientId,
    note: ""
  });

  // View Modal
  const [viewNote, setViewNote] = useState<any>(null);

  const loadData = async () => {
    try {
      const [notesRes, ptsRes] = await Promise.all([
        fetch("/api/clinical/records?recordType=Nursing Note"),
        fetch("/api/nursing/my-patients")
      ]);

      const [notesData, ptsData] = await Promise.all([
        notesRes.json(),
        ptsRes.json()
      ]);

      if (notesData.success) setNotes(notesData.data || []);
      if (ptsData.success) {
        setInpatients(ptsData.data || []);
        if (initialPatientId) setCreateOpen(true);
      }
    } catch (err) {
      toast("Failed to load nursing notes", "error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const note = formData.note.trim();
    if (!formData.patient || !note) {
      toast("Please select a patient and enter a note", "error");
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
        recordType: "Nursing Note",
        title: "Nursing Note",
        category: "General",
        chiefComplaint: note,
        dateRecorded: new Date().toISOString()
      };

      const res = await fetch("/api/clinical/records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast("Nursing progress note recorded successfully!", "success");
        setCreateOpen(false);
        setFormData({
          patient: selectedPatientFilter !== "ALL" ? selectedPatientFilter : "",
          note: ""
        });
        loadData();
      } else {
        toast(data.error || "Failed to save note", "error");
      }
    } catch (err) {
      toast("An error occurred while saving nursing note", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this nursing note?")) return;
    try {
      const res = await fetch(`/api/clinical/records/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (res.ok && data.success) {
        toast("Note deleted", "success");
        loadData();
      } else {
        toast(data.error || "Failed to delete note", "error");
      }
    } catch (err) {
      toast("Error deleting note", "error");
    }
  };

  const filteredNotes = useMemo(() => {
    return notes.filter((n) => {
      const q = searchQuery.toLowerCase().trim();
      const patName = (n.patient?.name || "").toLowerCase();
      const uhid = (n.patient?.uhid || "").toLowerCase();
      const title = (n.title || "").toLowerCase();
      const desc = (n.chiefComplaint || "").toLowerCase();

      const matchesSearch = !q || patName.includes(q) || uhid.includes(q) || title.includes(q) || desc.includes(q);

      let matchesPatient = true;
      if (selectedPatientFilter !== "ALL") {
        const pId = n.patient?._id || n.patient;
        matchesPatient = pId === selectedPatientFilter;
      }

      return matchesSearch && matchesPatient;
    });
  }, [notes, searchQuery, selectedPatientFilter]);

  const exportCSV = () => {
    if (filteredNotes.length === 0) {
      toast("No nursing notes to export", "error");
      return;
    }

    const headers = [
      "Timestamp",
      "Patient Name",
      "UHID",
      "Nursing Note"
    ];

    const rows = filteredNotes.map((n) => [
      `"${new Date(n.dateRecorded || n.createdAt).toLocaleString()}"`,
      `"${n.patient?.name || ""}"`,
      `"${n.patient?.uhid || ""}"`,
      `"${[n.chiefComplaint, n.objectiveFindings, n.assessment, n.plan]
        .filter(Boolean)
        .join(" | ")
        .replace(/"/g, '""')}"`
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Nursing_Notes_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast("Nursing notes exported successfully", "success");
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
            <FileText className="h-6 w-6 text-cyan-600 dark:text-cyan-400" />
            Nursing Notes Ledger
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Write and save a clear bedside note for an admitted patient.
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
            className="bg-cyan-600 hover:bg-cyan-700 text-white flex items-center gap-1.5"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="h-4 w-4" />
            Write Note
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
                placeholder="Search notes or patients..."
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

      {/* Notes Table */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Nursing Notes Ledger</CardTitle>
          <CardDescription>
            Showing {filteredNotes.length} of {notes.length} notes
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Patient</TableHead>
                  <TableHead>Nursing Note</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredNotes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-slate-500 py-12 text-xs">
                      No nursing notes yet. Select &quot;Write Note&quot; to record bedside care.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredNotes.map((n) => (
                    <TableRow key={n._id} className="text-xs hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                      <TableCell className="font-mono text-slate-500 whitespace-nowrap">
                        {new Date(n.dateRecorded || n.createdAt).toLocaleString([], {
                          dateStyle: "short",
                          timeStyle: "short"
                        })}
                      </TableCell>

                      <TableCell>
                        <div className="font-semibold text-slate-900 dark:text-white">
                          {n.patient?.name || "Unknown"}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          {n.patient?.uhid}
                        </div>
                      </TableCell>

                      <TableCell className="max-w-xs truncate text-slate-600 dark:text-slate-400">
                        {n.chiefComplaint || n.objectiveFindings || n.assessment || "Observation documented"}
                      </TableCell>

                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs flex items-center gap-1 text-cyan-600 hover:text-cyan-700"
                            onClick={() => setViewNote(n)}
                          >
                            <Eye className="h-3 w-3" />
                            View
                          </Button>

                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs text-rose-600 hover:text-rose-700"
                            onClick={() => handleDelete(n._id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Add Nursing Note Modal */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <form onSubmit={handleCreateSubmit}>
            <DialogHeader>
              <DialogTitle className="text-base font-bold flex items-center gap-2">
                <FileText className="h-5 w-5 text-cyan-600" />
                Write a Nursing Note
              </DialogTitle>
              <DialogDescription>
                Choose the patient, write the important observation or care provided, then save.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-1.5">
                <Label htmlFor="patient" className="font-semibold">
                  Patient *
                </Label>
                <Select
                  id="patient"
                  value={formData.patient}
                  onChange={(e) => setFormData({ ...formData, patient: e.target.value })}
                  required
                  className="h-10"
                >
                  <option value="">-- Select patient --</option>
                  {inpatients.map((p) => (
                    <option key={p.patientId} value={p.patientId}>
                      Bed {p.bedNumber} - {p.name} ({p.uhid})
                    </option>
                  ))}
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="note" className="font-semibold">
                  Nursing Note *
                </Label>
                <Textarea
                  id="note"
                  rows={5}
                  placeholder="Write the patient's condition, observation, care provided, or anything the next shift should know."
                  value={formData.note}
                  onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                  required
                  className="min-h-[120px]"
                />
                <p className="text-xs text-slate-500">
                  Keep it clear and factual. Do not leave this blank.
                </p>
              </div>
            </div>

            <DialogFooter className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)} disabled={submitting}>
                Cancel
              </Button>
              <Button type="submit" className="bg-cyan-600 hover:bg-cyan-700 text-white" disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    Save Note
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* View Note Modal */}
      <Dialog open={!!viewNote} onOpenChange={() => setViewNote(null)}>
        <DialogContent className="max-w-lg">
          {viewNote && (
            <div className="space-y-4 text-xs">
              <DialogHeader>
                <DialogTitle className="text-base font-bold flex items-center gap-2">
                  <FileText className="h-5 w-5 text-cyan-600" />
                  {viewNote.title || "Nursing Note"}
                </DialogTitle>
                <DialogDescription>
                  Recorded on {new Date(viewNote.dateRecorded || viewNote.createdAt).toLocaleString()}
                </DialogDescription>
              </DialogHeader>

              <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                <div className="font-bold text-sm text-slate-900 dark:text-white">
                  {viewNote.patient?.name}
                </div>
                <div className="text-slate-500 text-[11px]">UHID: {viewNote.patient?.uhid}</div>
              </div>

              <div className="space-y-2.5">
                {viewNote.chiefComplaint && (
                  <div className="p-2.5 rounded border border-slate-200 dark:border-slate-800">
                    <span className="font-bold text-cyan-700 dark:text-cyan-400 block text-[11px]">NURSING NOTE</span>
                    <p className="mt-1 text-slate-800 dark:text-slate-200 whitespace-pre-wrap">
                      {viewNote.chiefComplaint}
                    </p>
                  </div>
                )}

                {viewNote.objectiveFindings && (
                  <div className="p-2.5 rounded border border-slate-200 dark:border-slate-800">
                    <span className="font-bold text-cyan-700 dark:text-cyan-400 block text-[11px]">CARE PROVIDED</span>
                    <p className="mt-1 text-slate-800 dark:text-slate-200 whitespace-pre-wrap">
                      {viewNote.objectiveFindings}
                    </p>
                  </div>
                )}

                {viewNote.assessment && (
                  <div className="p-2.5 rounded border border-slate-200 dark:border-slate-800">
                    <span className="font-bold text-cyan-700 dark:text-cyan-400 block text-[11px]">PATIENT RESPONSE</span>
                    <p className="mt-1 text-slate-800 dark:text-slate-200 whitespace-pre-wrap">
                      {viewNote.assessment}
                    </p>
                  </div>
                )}

                {viewNote.plan && (
                  <div className="p-2.5 rounded border border-slate-200 dark:border-slate-800">
                    <span className="font-bold text-cyan-700 dark:text-cyan-400 block text-[11px]">FOLLOW-UP</span>
                    <p className="mt-1 text-slate-800 dark:text-slate-200 whitespace-pre-wrap">
                      {viewNote.plan}
                    </p>
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button variant="outline" size="sm" onClick={() => setViewNote(null)}>
                  Close
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
