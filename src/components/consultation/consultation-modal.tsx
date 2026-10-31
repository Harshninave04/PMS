"use client";

import React from "react";
import { Plus, Trash2, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { ComboField } from "@/components/consultation/combo-field";
import { MedicineAutocomplete } from "@/components/pharmacy/medicine-autocomplete";
import {
  COMMON_CHIEF_COMPLAINTS,
  COMMON_INVESTIGATIONS,
  MEDICATION_DOSAGE_OPTIONS,
  MEDICATION_DURATION_OPTIONS,
  MEDICATION_FREQUENCY_OPTIONS,
  MEDICATION_INSTRUCTIONS_OPTIONS,
} from "@/constants/consultation";
import {
  activeMedications,
  consultationPayload,
  createConsultationDraft,
  createId,
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

function Info({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className={`truncate text-xs font-medium text-slate-900 dark:text-white ${mono ? "font-mono" : ""}`}>{value}</div>
    </div>
  );
}

export function ConsultationModal({ open, appointment, onOpenChange, onSaved }: ConsultationModalProps) {
  const [draft, setDraft] = React.useState<ConsultationDraft | null>(null);
  const [medications, setMedications] = React.useState<MedicationDraft[]>([]);
  const [customTest, setCustomTest] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);
  const [admitAdvised, setAdmitAdvised] = React.useState(false);
  const [admitReason, setAdmitReason] = React.useState("");
  const { toast } = useToast();

  React.useEffect(() => {
    if (!open || !appointment) return;
    setDraft(createConsultationDraft(appointment));
    setMedications([createMedicationDraft(createId())]);
    setCustomTest("");
    setDirty(false);
    setAdmitAdvised(false);
    setAdmitReason("");
  }, [open, appointment]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && dirty && !window.confirm("Discard your unsaved consultation changes?")) return;
    if (!nextOpen) setDirty(false);
    onOpenChange(nextOpen);
  };

  const updateDraft = (update: (current: ConsultationDraft) => ConsultationDraft) => {
    setDraft((current) => (current ? update(current) : current));
    setDirty(true);
  };

  const updateMedication = (id: string, patch: Partial<MedicationDraft>) => {
    setMedications((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
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

  const toggleInvestigation = (name: string) =>
    updateDraft((current) => ({
      ...current,
      investigations: current.investigations.includes(name)
        ? current.investigations.filter((item) => item !== name)
        : [...current.investigations, name],
    }));

  const addCustomTest = () => {
    const name = customTest.trim();
    if (!name) return;
    updateDraft((current) =>
      current.investigations.some((item) => item.toLowerCase() === name.toLowerCase())
        ? current
        : { ...current, investigations: [...current.investigations, name] }
    );
    setCustomTest("");
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!appointment || !draft || saving) return;

    const validationError = validateConsultationDraft(draft, medications);
    if (validationError) {
      toast({ title: "Check consultation details", description: validationError, variant: "destructive" });
      return;
    }
    if (admitAdvised && !admitReason.trim()) {
      toast({ title: "Reason required", description: "Enter why this patient should be admitted.", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(`/api/appointments/${appointment._id}/complete-consultation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...consultationPayload(draft, activeMedications(medications)),
          admitAdvised,
          admitReason: admitAdvised ? admitReason.trim() : "",
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        toast({
          title: "Could not complete consultation",
          description: result.error || result.message || "Please try again.",
          variant: "destructive",
        });
        return;
      }

      setDirty(false);
      toast({ title: "Consultation completed", description: "Clinical note and prescription saved." });
      onOpenChange(false);
      await onSaved();
    } catch (error) {
      toast({
        title: "Could not complete consultation",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (!appointment) {
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <></>
      </Dialog>
    );
  }

  const patient = appointment.patientId;
  const physician = formatDoctorName(appointment.doctorId?.userId?.name || appointment.doctorId?.name) || "—";
  const encounterDate = new Date().toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  const customTests = (draft?.investigations ?? []).filter(
    (name) => !(COMMON_INVESTIGATIONS as readonly string[]).includes(name)
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        side="right"
        className="flex h-[100dvh] max-h-[100dvh] w-full max-w-[600px] flex-col gap-0 overflow-hidden rounded-none border-l p-0 sm:rounded-l-2xl"
      >
        <DialogHeader className="mb-0 shrink-0 border-b px-5 py-3.5 pr-12 sm:px-6">
          <DialogTitle>Consultation</DialogTitle>
        </DialogHeader>

        <div className="shrink-0 border-b bg-slate-50 px-5 py-3 dark:bg-slate-900 sm:px-6">
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <span className="truncate text-sm font-semibold text-slate-900 dark:text-white">{patient?.name || "Patient"}</span>
            <span className="shrink-0 font-mono text-xs font-semibold text-emerald-700 dark:text-emerald-400">
              {appointment.tokenNumber || ""}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
            <Info label="Age / Gender" value={`${patient?.age ?? "—"} / ${patient?.gender || "—"}`} />
            <Info label="UHID" value={patient?.uhid || "—"} mono />
            <Info label="Physician" value={physician} />
            <Info label="Date" value={encounterDate} />
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3 sm:px-5">
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Clinical notes</h3>

              <div className="space-y-1.5">
                <Label htmlFor="consultation-chief-complaint">
                  Chief complaint <span className="text-red-500">*</span>
                </Label>
                <ComboField
                  id="consultation-chief-complaint"
                  ariaLabel="Chief complaint"
                  placeholder="Type or pick a complaint"
                  value={draft?.chiefComplaint ?? ""}
                  onChange={(value) => updateDraft((current) => ({ ...current, chiefComplaint: value }))}
                  suggestions={COMMON_CHIEF_COMPLAINTS}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label>Investigations</Label>
                <div className="flex flex-wrap gap-2">
                  {COMMON_INVESTIGATIONS.map((name) => {
                    const selected = draft?.investigations.includes(name) ?? false;
                    return (
                      <button
                        key={name}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => toggleInvestigation(name)}
                        className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                          selected
                            ? "border-emerald-600 bg-emerald-600 text-white"
                            : "border-slate-200 bg-white text-slate-600 hover:border-emerald-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                        }`}
                      >
                        {name}
                      </button>
                    );
                  })}
                  {customTests.map((name) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => toggleInvestigation(name)}
                      aria-label={`Remove ${name}`}
                      className="flex items-center gap-1 rounded-full border border-emerald-600 bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white"
                    >
                      {name} <X className="h-3 w-3" />
                    </button>
                  ))}
                </div>
                <Input
                  aria-label="Add another test"
                  placeholder="Add another test, press Enter"
                  value={customTest}
                  onChange={(event) => setCustomTest(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addCustomTest();
                    }
                  }}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="consultation-diagnosis-notes">Diagnosis / notes</Label>
                <Textarea
                  id="consultation-diagnosis-notes"
                  rows={1}
                  className="min-h-10 py-2"
                  placeholder="Optional"
                  value={draft?.diagnosisNotes ?? ""}
                  onChange={(event) => updateDraft((current) => ({ ...current, diagnosisNotes: event.target.value }))}
                />
              </div>
            </section>

            <section className="space-y-2 border-t border-slate-200 pt-3 dark:border-slate-800">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                Prescription <span className="text-xs font-normal text-slate-500">(optional)</span>
              </h3>

              {medications.map((medication, index) => {
                const duplicate = duplicateNames.has(medication.name.trim().toLocaleLowerCase());
                const label = `Medicine ${index + 1}`;
                return (
                  <div key={medication.id} className="space-y-1.5 rounded-lg border border-slate-200 p-2 dark:border-slate-700">
                    <div className="flex items-center gap-2">
                      <MedicineAutocomplete
                        className="min-w-0 flex-1 [&_input]:h-9 [&_input]:text-sm"
                        ariaLabel={`${label} drug name and strength`}
                        placeholder="Drug name & strength"
                        value={medication.name}
                        isCatalogueMedicine={medication.isCatalogueMedicine}
                        onChange={(value, isCatalogueMedicine) => updateMedication(medication.id, { name: value, isCatalogueMedicine })}
                      />
                      {medications.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`Remove ${label.toLowerCase()}`}
                          onClick={() => {
                            setMedications((current) => current.filter((item) => item.id !== medication.id));
                            setDirty(true);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    {duplicate && (
                      <p role="alert" className="text-xs text-amber-700">
                        This medicine is already in the prescription.
                      </p>
                    )}
                    <div className="grid grid-cols-2 gap-1.5">
                      <ComboField
                        className="[&_input]:h-9 [&_input]:text-sm"
                        ariaLabel={`${label} dosage`}
                        placeholder="Dosage"
                        value={medication.dosage}
                        onChange={(value) => updateMedication(medication.id, { dosage: value })}
                        suggestions={MEDICATION_DOSAGE_OPTIONS}
                      />
                      <ComboField
                        className="[&_input]:h-9 [&_input]:text-sm"
                        ariaLabel={`${label} frequency`}
                        placeholder="Frequency"
                        value={medication.frequency}
                        onChange={(value) => updateMedication(medication.id, { frequency: value })}
                        suggestions={MEDICATION_FREQUENCY_OPTIONS}
                      />
                      <ComboField
                        className="[&_input]:h-9 [&_input]:text-sm"
                        ariaLabel={`${label} duration`}
                        placeholder="Duration"
                        value={medication.duration}
                        onChange={(value) => updateMedication(medication.id, { duration: value })}
                        suggestions={MEDICATION_DURATION_OPTIONS}
                      />
                      <ComboField
                        className="[&_input]:h-9 [&_input]:text-sm"
                        ariaLabel={`${label} instructions`}
                        placeholder="Instructions"
                        value={medication.instructions}
                        onChange={(value) => updateMedication(medication.id, { instructions: value })}
                        suggestions={MEDICATION_INSTRUCTIONS_OPTIONS}
                      />
                    </div>
                  </div>
                );
              })}

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setMedications((current) => [...current, createMedicationDraft(createId())]);
                  setDirty(true);
                }}
              >
                <Plus className="mr-1 h-4 w-4" /> Add medicine
              </Button>
            </section>

            <section className="space-y-2 border-t border-slate-200 pt-3 dark:border-slate-800">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Admit this patient?</h3>
              <div className="flex gap-2" role="group" aria-label="Admit this patient">
                <Button type="button" size="sm" variant={!admitAdvised ? "default" : "outline"} onClick={() => { setAdmitAdvised(false); setAdmitReason(""); setDirty(true); }}>No</Button>
                <Button type="button" size="sm" variant={admitAdvised ? "default" : "outline"} onClick={() => { setAdmitAdvised(true); setDirty(true); }}>Yes</Button>
              </div>
              {admitAdvised && (
                <Input
                  aria-label="Why admit? (one line)"
                  placeholder="Why admit? (one line)"
                  value={admitReason}
                  onChange={(event) => { setAdmitReason(event.target.value); setDirty(true); }}
                  maxLength={200}
                  required
                  className="h-9"
                />
              )}
            </section>
          </div>

          <DialogFooter className="mt-0 shrink-0 border-t bg-white px-5 py-4 dark:bg-slate-900 sm:px-6">
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
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
