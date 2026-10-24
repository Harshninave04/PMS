"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export interface PatientDuplicateMatch {
  _id: string;
  name: string;
  uhid?: string;
  age?: number;
  gender?: string;
  contact?: string;
}

export type SharedPhoneRelation = "Spouse" | "Child" | "Parent" | "Sibling" | "Other family" | "Not related";

interface PatientDuplicateDialogProps {
  patients: PatientDuplicateMatch[];
  canConfirmSharedPhone?: boolean;
  onClose: () => void;
  onConfirmSharedPhone?: (patient: PatientDuplicateMatch, relation: SharedPhoneRelation) => void;
}

const relations: SharedPhoneRelation[] = ["Spouse", "Child", "Parent", "Sibling", "Other family", "Not related"];

export function PatientDuplicateDialog({
  patients,
  canConfirmSharedPhone = false,
  onClose,
  onConfirmSharedPhone,
}: PatientDuplicateDialogProps) {
  const router = useRouter();
  const [selectedPatientId, setSelectedPatientId] = useState("");
  const [relation, setRelation] = useState<SharedPhoneRelation | "">("");

  useEffect(() => {
    setSelectedPatientId(patients[0]?._id || "");
    setRelation("");
  }, [patients]);

  const selectedPatient = patients.find((patient) => patient._id === selectedPatientId);
  const openPatient = (patient: PatientDuplicateMatch) => {
    router.push(`/patients/profile?id=${encodeURIComponent(patient._id)}`);
    onClose();
  };

  return (
    <Dialog open={patients.length > 0} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>A patient with this phone already exists</DialogTitle>
        </DialogHeader>
        {canConfirmSharedPhone && patients.length > 1 && (
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Which patient shares this phone?</legend>
            {patients.map((patient) => (
              <label key={patient._id} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="shared-phone-patient"
                  value={patient._id}
                  checked={selectedPatientId === patient._id}
                  onChange={() => { setSelectedPatientId(patient._id); setRelation(""); }}
                />
                <span>{patient.name} ({patient.uhid || "UHID not assigned"})</span>
              </label>
            ))}
          </fieldset>
        )}
        <div className="max-h-[45vh] space-y-3 overflow-y-auto">
          {patients.map((patient) => (
            <div key={patient._id} className="rounded-lg border p-3 text-sm">
              <div className="font-semibold">{patient.name || "Unknown"}</div>
              <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-600">
                <span>Age: {patient.age ?? "Not recorded"}</span>
                <span>Gender: {patient.gender || "Not recorded"}</span>
                <span>UHID: {patient.uhid || "Not assigned"}</span>
                <span>Phone: {patient.contact || "Not recorded"}</span>
              </div>
              <Button type="button" size="sm" variant="outline" className="mt-3" onClick={() => openPatient(patient)}>
                {canConfirmSharedPhone ? "Open this patient" : "Open existing patient"}
              </Button>
            </div>
          ))}
        </div>
        {canConfirmSharedPhone && selectedPatient && (
          <div className="space-y-2 border-t pt-3">
            <p className="text-sm font-medium">Is this a different person (family member)?</p>
            <label className="block text-sm" htmlFor="shared-phone-relation">
              Relation with {selectedPatient.name}
            </label>
            <select
              id="shared-phone-relation"
              required
              value={relation}
              onChange={(event) => setRelation(event.target.value as SharedPhoneRelation | "")}
              className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900"
            >
              <option value="" disabled>Select relation</option>
              {relations.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </div>
        )}
        <DialogFooter>
          {canConfirmSharedPhone && onConfirmSharedPhone && (
            <Button
              type="button"
              disabled={!selectedPatient || !relation}
              onClick={() => selectedPatient && relation && onConfirmSharedPhone(selectedPatient, relation)}
            >
              Create new patient
            </Button>
          )}
          <Button type="button" variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
