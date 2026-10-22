"use client";

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

interface PatientDuplicateDialogProps {
  patients: PatientDuplicateMatch[];
  onClose: () => void;
  onSelect?: (patient: PatientDuplicateMatch) => void;
}

export function PatientDuplicateDialog({ patients, onClose, onSelect }: PatientDuplicateDialogProps) {
  const router = useRouter();
  const openPatient = (patient: PatientDuplicateMatch) => {
    if (onSelect) {
      onSelect(patient);
      onClose();
      return;
    }
    router.push(`/patients/profile?id=${encodeURIComponent(patient._id)}`);
    onClose();
  };

  return (
    <Dialog open={patients.length > 0} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Patient already exists</DialogTitle>
        </DialogHeader>
        <div className="max-h-[55vh] space-y-3 overflow-y-auto">
          {patients.map((patient) => (
            <div key={patient._id} className="rounded-lg border p-3 text-sm">
              <div className="font-semibold">{patient.name || "Unknown"}</div>
              <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-600">
                <span>UHID: {patient.uhid || "Not assigned"}</span>
                <span>Age: {patient.age ?? "Not recorded"}</span>
                <span>Gender: {patient.gender || "Not recorded"}</span>
                <span>Phone: {patient.contact || "Not recorded"}</span>
              </div>
              <Button type="button" size="sm" className="mt-3" onClick={() => openPatient(patient)}>
                Open existing patient
              </Button>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
