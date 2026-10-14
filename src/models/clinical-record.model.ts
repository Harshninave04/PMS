import mongoose, { Schema, Document } from "mongoose";

export interface IClinicalRecord extends Document {
  patient: mongoose.Types.ObjectId;
  admissionId?: mongoose.Types.ObjectId;
  doctor?: mongoose.Types.ObjectId;
  appointmentId?: mongoose.Types.ObjectId;
  recordType: string; // e.g., "Consultation", "Progress Note", "Clinical Note", "Treatment Plan", "Medical History", "Allergy", "Clinical Order", "Referral", "Follow-Up", "Patient Problem"
  title?: string;
  category?: string;
  details?: string;
  chiefComplaint?: string;
  historyOfPresentIllness?: string;
  objectiveFindings?: string;
  assessment?: string;
  plan?: string;
  severity?: string; // "Mild" | "Moderate" | "Severe" | "Critical"
  reaction?: string;
  orderType?: string; // "Lab" | "Radiology" | "Procedure" | "Medication" | "Nursing" | "Diet"
  referralTo?: string;
  followUpDate?: Date;
  priority?: string; // "Routine" | "Urgent" | "STAT"
  instructions?: string;
  problemStatus?: string; // "Active" | "Chronic" | "Inactive" | "Resolved"
  resolutionDate?: Date;
  // Ward-round visit detail (recordType "Progress Note" linked to a stay)
  visitType?: string; // "Round" | "Admission Review" | "Pre-Discharge" | "Emergency"
  painScore?: number; // 0-10
  condition?: string; // "Improving" | "Stable" | "Deteriorating" | "Critical"
  dateRecorded: Date;
  status: "Draft" | "Final";
}

const ClinicalRecordSchema: Schema = new Schema(
  {
    patient: { type: Schema.Types.ObjectId, ref: "Patient", required: true },
    admissionId: { type: Schema.Types.ObjectId, ref: "Admission" },
    doctor: { type: Schema.Types.ObjectId, ref: "User" },
    appointmentId: { type: Schema.Types.ObjectId, ref: "Appointment" },
    recordType: { type: String, required: true, default: "Consultation" },
    title: { type: String },
    category: { type: String },
    details: { type: String },
    chiefComplaint: { type: String },
    historyOfPresentIllness: { type: String },
    objectiveFindings: { type: String },
    assessment: { type: String },
    plan: { type: String },
    severity: { type: String },
    reaction: { type: String },
    orderType: { type: String },
    referralTo: { type: String },
    followUpDate: { type: Date },
    priority: { type: String, default: "Routine" },
    instructions: { type: String },
    problemStatus: { type: String },
    resolutionDate: { type: Date },
    visitType: { type: String },
    painScore: { type: Number, min: 0, max: 10 },
    condition: { type: String },
    dateRecorded: { type: Date, default: Date.now },
    status: { type: String, enum: ["Draft", "Final"], default: "Final" },
  },
  { timestamps: true }
);

ClinicalRecordSchema.index(
  { appointmentId: 1, recordType: 1 },
  { unique: true, partialFilterExpression: { appointmentId: { $type: "objectId" } } }
);
ClinicalRecordSchema.index({ admissionId: 1, createdAt: -1 });
ClinicalRecordSchema.index({ patient: 1, createdAt: -1 });

export const ClinicalRecord =
  mongoose.models.ClinicalRecord ||
  mongoose.model<IClinicalRecord>("ClinicalRecord", ClinicalRecordSchema);
