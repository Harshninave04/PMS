import { Types } from "mongoose";

export interface CreateMedicationOrderDto {
    admissionId: Types.ObjectId | string;
    patientId: Types.ObjectId | string;
    visitId?: Types.ObjectId | string;
    medicationName: string;
    dosage: string;
    route?: "ORAL" | "IV" | "IM" | "SC" | "TOPICAL" | "INHALATION" | "OTHER" | string;
    frequency: string;
    timesOfDay?: string[];
    startDate?: Date | string;
    durationDays?: number;
    instructions?: string;
}

export interface DiscontinueOrderDto {
    reason?: string;
}
