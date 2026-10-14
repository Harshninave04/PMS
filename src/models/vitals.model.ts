import mongoose, { Schema, Document } from "mongoose";

export interface IVitals extends Document {
  patient: mongoose.Types.ObjectId;
  admissionId?: mongoose.Types.ObjectId;
  recordedBy?: mongoose.Types.ObjectId;
  temperature?: number;
  heartRate?: number;
  bloodPressure?: string;
  respiratoryRate?: number;
  oxygenSaturation?: number;
  weight?: number;
  height?: number;
  dateRecorded: Date;
}

const VitalsSchema: Schema = new Schema(
  {
    patient: { type: Schema.Types.ObjectId, ref: "Patient", required: true },
    admissionId: { type: Schema.Types.ObjectId, ref: "Admission", index: true },
    recordedBy: { type: Schema.Types.ObjectId, ref: "User" },
    temperature: { type: Number },
    heartRate: { type: Number },
    bloodPressure: { type: String },
    respiratoryRate: { type: Number },
    oxygenSaturation: { type: Number },
    weight: { type: Number },
    height: { type: Number },
    dateRecorded: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export const Vitals = mongoose.models.Vitals || mongoose.model<IVitals>("Vitals", VitalsSchema);
