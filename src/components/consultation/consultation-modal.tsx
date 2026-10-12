"use client";

import React from "react";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import {
  COMMON_CHIEF_COMPLAINTS,
  COMMON_INVESTIGATIONS,
  MEDICATION_DOSAGE_OPTIONS,
  MEDICATION_DURATION_OPTIONS,
  MEDICATION_FREQUENCY_OPTIONS,
  MEDICATION_INSTRUCTIONS_OPTIONS,
  OTHER_OPTION,
} from "@/constants/consultation";
import {
  consultationPayload,
  createConsultationDraft,
  createMedicationDraft,
  type ConsultationDraft,
  type MedicationDraft,
  validateConsultationDraft,
} from "@/lib/consultation-form";
import { formatDoctorName } from "@/lib/name-formatter";
import type { ConsultationAppointment } from "@/types/consultation";

interface ConsultationModalProps {
  open: boolean;
  appointment: ConsultationAppointment | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void | Promise<void>;
}

interface MedicineDropdownProps {
  label: string;
  value: string;
  otherValue: string;
  options: readonly string[];
  onValueChange: (value: string) => void;
  onOtherChange: (value: string) => void;
}

function MedicineDropdown({ label, value, otherValue, options, onValueChange, onOtherChange }: MedicineDropdownProps) {
  const id = `medicine-${label.toLowerCase().replace(/[^a-z0-9-]+/g, "-")}`;
  return (
    <div className="space-y-1">
      <Select id={id} aria-label={label} value={value} onChange={(event) => onValueChange(event.target.value)}>
        <option value="">{label}</option>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </Select>
      {value === OTHER_OPTION && (
        <Input
          aria-label={`${label} other`}
          placeholder={`Enter ${label.toLowerCase()}`}
          value={otherValue}
          onChange={(event) => onOtherChange(event.target.value)}
          required
        />
      )}
    </div>
  );
}

export function ConsultationModal({ open, appointment, onOpenChange, onSaved }: ConsultationModalProps) {
  const [draft, setDraft] = React.useState<ConsultationDraft | null>(null);
  const [medications, setMedications] = React.useState<MedicationDraft[]>([]);
  const [medicineSuggestions, setMedicineSuggestions] = React.useState<string[]>([]);
  const [saving, setSaving] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);
  const [complaintSearch, setComplaintSearch] = React.useState("");
  const { toast } = useToast();

  React.useEffect(() => {
    if (!open || !appointment) return;
    const initialDraft = createConsultationDraft(appointment);
    setDraft(initialDraft);
    setComplaintSearch(initialDraft.chiefComplaint);
    setMedications([]);
    setDirty(false);
  }, [open, appointment]);

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch("/api/appointments/consultation-medicines")
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error(result.message || "Medicine suggestions unavailable");
        return result.data as string[];
      })
      .then((names) => { if (!cancelled) setMedicineSuggestions(names); })
      .catch(() => { if (!cancelled) setMedicineSuggestions([]); });
    return () => { cancelled = true; };
  }, [open]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && dirty && !window.confirm("Discard your unsaved consultation changes?")) return;
    if (!nextOpen) setDirty(false);
    onOpenChange(nextOpen);
  };

  const updateDraft = (update: (current: ConsultationDraft) => ConsultationDraft) => {
    setDraft((current) => current ? update(current) : current);
    setDirty(true);
  };

  const updateMedication = (id: string, update: (current: MedicationDraft) => MedicationDraft) => {
    setMedications((current) => current.map((medication) => medication.id === id ? update(medication) : medication));
    setDirty(true);
  };

  const duplicateNames = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const medication of medications) {
      const name = medication.name.trim().toLocaleLowerCase();
      if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return new Set([...counts].filter(([, count]) => count > 1).map(([name]) => name));
  }, [medications]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!appointment || !draft) return;
    const validationError = validateConsultationDraft(draft, medications);
    if (validationError) {
      toast({ title: "Check consultation details", description: validationError, variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(`/api/appointments/${appointment._id}/complete-consultation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(consultationPayload(draft, medications)),
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        toast({ title: "Unable to complete consultation", description: result.error || result.message || "Please try again.", variant: "destructive" });
        return;
      }

      setDirty(false);
      toast({ title: "Consultation completed", description: "The clinical note and prescription were saved." });
      onOpenChange(false);
      await onSaved();
    } catch (error) {
      toast({
        title: "Unable to complete consultation",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (!appointment) return <Dialog open={open} onOpenChange={handleOpenChange}><></></Dialog>;

  const patient = appointment.patientId;
  const physicianName = formatDoctorName(appointment.doctorId?.userId?.name || appointment.doctorId?.name);
  const encounterDate = new Date().toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  const addMedication = () => {
    setMedications((current) => [...current, createMedicationDraft(crypto.randomUUID())]);
    setDirty(true);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent side="right" className="flex h-[100dvh] max-h-[100dvh] w-full max-w-[600px] flex-col gap-0 overflow-hidden rounded-none border-l p-0 sm:rounded-l-2xl">
        <DialogHeader className="mb-0 shrink-0 border-b px-5 py-4 pr-12 sm:px-6">
          <DialogTitle>Complete Consultation</DialogTitle>
          <DialogDescription>Record clinical notes and an optional prescription.</DialogDescription>
        </DialogHeader>

        <div className="shrink-0 border-b bg-slate-50 px-5 py-3 dark:bg-slate-900 sm:px-6">
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-3">
            <div><div className="text-slate-500">Patient</div><div className="font-semibold text-slate-900 dark:text-white">{patient?.name || "—"}</div></div>
            <div><div className="text-slate-500">Age / Gender</div><div className="font-medium">{patient?.age ?? "—"} / {patient?.gender || "—"}</div></div>
            <div><div className="text-slate-500">UHID</div><div className="font-mono">{patient?.uhid || "—"}</div></div>
            <div><div className="text-slate-500">Token</div><div className="font-mono">{appointment.tokenNumber || "—"}</div></div>
            <div><div className="text-slate-500">Attending physician</div><div className="font-medium">{physicianName || "—"}</div></div>
            <div><div className="text-slate-500">Encounter date</div><div className="font-medium">{encounterDate}</div></div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-6">
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Clinical Notes</h3>
              <div className="space-y-1.5">
                <Label htmlFor="consultation-chief-complaint">Chief complaint <span className="text-red-500">*</span></Label>
                <Input
                  id="consultation-chief-complaint"
                  list="consultation-chief-complaints"
                  autoComplete="off"
                  placeholder="Search chief complaints"
                  value={complaintSearch}
                  onChange={(event) => {
                    const value = event.target.value;
                    setComplaintSearch(value);
                    updateDraft((current) => ({ ...current, chiefComplaint: COMMON_CHIEF_COMPLAINTS.find((option) => option.toLowerCase() === value.toLowerCase()) ?? "" }));
                  }}
                  required
                />
                <datalist id="consultation-chief-complaints">
                  {COMMON_CHIEF_COMPLAINTS.map((complaint) => <option key={complaint} value={complaint} />)}
                </datalist>
                {draft?.chiefComplaint === OTHER_OPTION && (
                  <Input
                    aria-label="Other chief complaint"
                    placeholder="Enter chief complaint"
                    value={draft.chiefComplaintOther}
                    onChange={(event) => updateDraft((current) => ({ ...current, chiefComplaintOther: event.target.value }))}
                    required
                  />
                )}
              </div>

              <div className="space-y-1.5">
                <Label>Investigations</Label>
                <div className="flex flex-wrap gap-2">
                  {COMMON_INVESTIGATIONS.map((investigation) => {
                    const selected = draft?.investigations.includes(investigation) ?? false;
                    return (
                      <button
                        key={investigation}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => updateDraft((current) => ({
                          ...current,
                          investigations: selected
                            ? current.investigations.filter((item) => item !== investigation)
                            : [...current.investigations, investigation],
                        }))}
                        className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${selected ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-emerald-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"}`}
                      >
                        {investigation}
                      </button>
                    );
                  })}
                </div>
                {draft?.investigations.includes(OTHER_OPTION) && (
                  <Input
                    aria-label="Other investigation"
                    placeholder="Enter another investigation"
                    value={draft.investigationsOther}
                    onChange={(event) => updateDraft((current) => ({ ...current, investigationsOther: event.target.value }))}
                    required
                  />
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="consultation-diagnosis-notes">Diagnosis / Notes</Label>
                <Textarea
                  id="consultation-diagnosis-notes"
                  rows={2}
                  className="min-h-[52px]"
                  placeholder="Optional diagnosis or clinical notes"
                  value={draft?.diagnosisNotes ?? ""}
                  onChange={(event) => updateDraft((current) => ({ ...current, diagnosisNotes: event.target.value }))}
                />
              </div>
            </section>

            <section className="space-y-3 border-t pt-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Prescription <span className="text-xs font-normal text-slate-500">(optional)</span></h3>
                  <p className="text-xs text-slate-500">Suggestions use the medicine master or your previous prescriptions.</p>
                </div>
              </div>
              {medications.length === 0 ? (
                <p className="rounded-lg border border-dashed p-4 text-center text-xs text-slate-500">No medicines added.</p>
              ) : medications.map((medication, index) => {
                const isDuplicate = duplicateNames.has(medication.name.trim().toLocaleLowerCase());
                const medicineListId = `consultation-medicine-options-${medication.id}`;
                return (
                  <div key={medication.id} className="space-y-2 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                    <div className="flex items-center gap-2">
                      <Input
                        aria-label={`Medicine ${index + 1} drug name and strength`}
                        list={medicineListId}
                        autoComplete="off"
                        placeholder="Drug name & strength *"
                        value={medication.name}
                        onChange={(event) => updateMedication(medication.id, (current) => ({ ...current, name: event.target.value }))}
                        required
                        className="min-w-0 flex-1"
                      />
                      <Button type="button" variant="ghost" size="icon" aria-label={`Remove medicine ${index + 1}`} onClick={() => {
                        setMedications((current) => current.filter((item) => item.id !== medication.id));
                        setDirty(true);
                      }}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    {isDuplicate && <p role="alert" className="text-xs text-amber-700">This medicine is already in the prescription.</p>}
                    <datalist id={medicineListId}>
                      {medicineSuggestions.map((name) => <option key={name} value={name} />)}
                    </datalist>
                    <div className="grid grid-cols-2 gap-2">
                      <MedicineDropdown label={`Medicine ${index + 1} dosage`} value={medication.dosage} otherValue={medication.dosageOther} options={MEDICATION_DOSAGE_OPTIONS} onValueChange={(value) => updateMedication(medication.id, (current) => ({ ...current, dosage: value }))} onOtherChange={(value) => updateMedication(medication.id, (current) => ({ ...current, dosageOther: value }))} />
                      <MedicineDropdown label={`Medicine ${index + 1} frequency`} value={medication.frequency} otherValue={medication.frequencyOther} options={MEDICATION_FREQUENCY_OPTIONS} onValueChange={(value) => updateMedication(medication.id, (current) => ({ ...current, frequency: value }))} onOtherChange={(value) => updateMedication(medication.id, (current) => ({ ...current, frequencyOther: value }))} />
                      <MedicineDropdown label={`Medicine ${index + 1} duration`} value={medication.duration} otherValue={medication.durationOther} options={MEDICATION_DURATION_OPTIONS} onValueChange={(value) => updateMedication(medication.id, (current) => ({ ...current, duration: value }))} onOtherChange={(value) => updateMedication(medication.id, (current) => ({ ...current, durationOther: value }))} />
                      <MedicineDropdown label={`Medicine ${index + 1} instructions`} value={medication.instructions} otherValue={medication.instructionsOther} options={MEDICATION_INSTRUCTIONS_OPTIONS} onValueChange={(value) => updateMedication(medication.id, (current) => ({ ...current, instructions: value }))} onOtherChange={(value) => updateMedication(medication.id, (current) => ({ ...current, instructionsOther: value }))} />
                    </div>
                  </div>
                );
              })}
              <Button type="button" variant="outline" size="sm" onClick={addMedication}>
                <Plus className="mr-1 h-4 w-4" /> Add medicine
              </Button>
            </section>
          </div>

          <DialogFooter className="mt-0 shrink-0 border-t bg-white px-5 py-4 dark:bg-slate-900 sm:px-6">
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={saving}>Cancel</Button>
            <Button type="submit" disabled={saving || !draft} className="bg-emerald-600 text-white hover:bg-emerald-700">
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Complete Consultation
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
