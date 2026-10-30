import mongoose, { Schema, type Document } from "mongoose";

export interface IDailyNursingRecord extends Document {
  patient: mongoose.Types.ObjectId;
  admissionId: mongoose.Types.ObjectId;
  nursingDay: number;
  recordDate: Date;
  hospitalDate?: string;
  vitals: { bloodPressure?: string; pulse?: number; temperature?: number; respiratoryRate?: number; oxygenSaturation?: number };
  observations?: string;
  procedures?: string;
  medicationAdministration?: string;
  progress?: string;
  additionalNotes?: string;
  status: "Draft" | "Final";
  author: mongoose.Types.ObjectId;
  finalizedAt?: Date;
  correctionOf?: mongoose.Types.ObjectId;
}

const recordSchema = new Schema<IDailyNursingRecord>({
  patient: { type: Schema.Types.ObjectId, ref: "Patient", required: true, index: true },
  admissionId: { type: Schema.Types.ObjectId, ref: "Admission", required: true, index: true },
  nursingDay: { type: Number, required: true, min: 1 },
  recordDate: { type: Date, required: true },
  hospitalDate: { type: String, match: /^\d{4}-\d{2}-\d{2}$/ },
  vitals: {
    bloodPressure: { type: String, trim: true, maxlength: 30 },
    pulse: { type: Number, min: 0, max: 300 },
    temperature: { type: Number, min: 20, max: 50 },
    respiratoryRate: { type: Number, min: 0, max: 100 },
    oxygenSaturation: { type: Number, min: 0, max: 100 },
  },
  observations: { type: String, trim: true, maxlength: 5000 },
  procedures: { type: String, trim: true, maxlength: 5000 },
  medicationAdministration: { type: String, trim: true, maxlength: 5000 },
  progress: { type: String, trim: true, maxlength: 5000 },
  additionalNotes: { type: String, trim: true, maxlength: 5000 },
  status: { type: String, enum: ["Draft", "Final"], default: "Draft", required: true },
  author: { type: Schema.Types.ObjectId, ref: "User", required: true },
  finalizedAt: { type: Date },
  correctionOf: { type: Schema.Types.ObjectId, ref: "DailyNursingRecord" },
}, { timestamps: true });

// One editable primary report per hospital day; corrections stay separate for audit history.
recordSchema.index({ admissionId: 1, nursingDay: 1 }, { unique: true, partialFilterExpression: { correctionOf: { $exists: false } } });
recordSchema.index({ admissionId: 1, recordDate: 1 });

const DailyNursingRecord = mongoose.models.DailyNursingRecord || mongoose.model<IDailyNursingRecord>("DailyNursingRecord", recordSchema);
export default DailyNursingRecord;
