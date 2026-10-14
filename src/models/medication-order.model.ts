import mongoose, { Schema, Document, Types } from "mongoose";
import { FREQUENCY_SUGGESTIONS } from "@/lib/medication-schedule";

export { FREQUENCY_SUGGESTIONS };

export type MedicationOrderFrequency =
    | "STAT"
    | "OD"
    | "BD"
    | "TDS"
    | "QID"
    | "Q6H"
    | "Q8H"
    | "Q12H"
    | "HS"
    | "PRN";

export type MedicationOrderStatus = "ACTIVE" | "DISCONTINUED" | "COMPLETED";

export interface IMedicationOrder extends Document {
    admissionId: Types.ObjectId;
    patientId: Types.ObjectId;
    visitId?: Types.ObjectId;
    prescribedBy: Types.ObjectId;
    medicationName: string;
    dosage: string;
    route: "ORAL" | "IV" | "IM" | "SC" | "TOPICAL" | "INHALATION" | "OTHER";
    frequency: MedicationOrderFrequency;
    /** Clock times the nurse follows, e.g. ["08:00","14:00","20:00"]. Empty for PRN. */
    timesOfDay: string[];
    startDate: Date;
    durationDays: number;
    instructions?: string;
    status: MedicationOrderStatus;
    discontinuedAt?: Date;
    discontinuedBy?: Types.ObjectId;
    discontinueReason?: string;
    createdAt: Date;
    updatedAt: Date;
}

/** Suggested clock times live in lib/medication-schedule (client-safe). */

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

const MedicationOrderSchema: Schema = new Schema(
    {
        admissionId: { type: Schema.Types.ObjectId, ref: "Admission", required: true, index: true },
        patientId: { type: Schema.Types.ObjectId, ref: "Patient", required: true, index: true },
        visitId: { type: Schema.Types.ObjectId, ref: "ClinicalRecord" },
        prescribedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
        medicationName: { type: String, required: true, trim: true, maxlength: 200 },
        dosage: { type: String, required: true, trim: true, maxlength: 100 },
        route: {
            type: String,
            enum: ["ORAL", "IV", "IM", "SC", "TOPICAL", "INHALATION", "OTHER"],
            default: "ORAL",
        },
        frequency: {
            type: String,
            enum: ["STAT", "OD", "BD", "TDS", "QID", "Q6H", "Q8H", "Q12H", "HS", "PRN"],
            required: true,
        },
        timesOfDay: { type: [String], default: [] },
        startDate: { type: Date, required: true },
        durationDays: { type: Number, required: true, min: 1, max: 30 },
        instructions: { type: String, trim: true, maxlength: 1000 },
        status: {
            type: String,
            enum: ["ACTIVE", "DISCONTINUED", "COMPLETED"],
            default: "ACTIVE",
            index: true,
        },
        discontinuedAt: { type: Date },
        discontinuedBy: { type: Schema.Types.ObjectId, ref: "User" },
        discontinueReason: { type: String, trim: true, maxlength: 500 },
    },
    { timestamps: true }
);

MedicationOrderSchema.index({ admissionId: 1, status: 1, createdAt: -1 });

export function validateOrderTimes(frequency: string, times: string[]): string | null {
    if (frequency === "STAT" || frequency === "PRN") return null;
    if (!times.length) return "At least one clock time is required for scheduled frequencies";
    for (const t of times) {
        if (!TIME_PATTERN.test(t)) return `Invalid time "${t}" — use HH:MM (24h)`;
    }
    return null;
}

export const MedicationOrder =
    mongoose.models.MedicationOrder ||
    mongoose.model<IMedicationOrder>("MedicationOrder", MedicationOrderSchema);
