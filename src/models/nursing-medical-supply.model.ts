import mongoose, { Schema, type Document } from "mongoose";

export const NURSING_SUPPLY_CATEGORIES = [
  "Medicines",
  "Medical Consumables",
  "Equipment Usage / Rental",
  "Other Medical Supplies",
] as const;

export type NursingSupplyCategory = (typeof NURSING_SUPPLY_CATEGORIES)[number];

export interface INursingMedicalSupply extends Document {
  patient: mongoose.Types.ObjectId;
  admissionId: mongoose.Types.ObjectId;
  nursingDay: number;
  hospitalDate?: string;
  category: NursingSupplyCategory;
  itemName: string;
  quantity: number;
  notes?: string;
  author: mongoose.Types.ObjectId;
  recordedAt: Date;
}

const nursingMedicalSupplySchema = new Schema<INursingMedicalSupply>({
  patient: { type: Schema.Types.ObjectId, ref: "Patient", required: true, index: true },
  admissionId: { type: Schema.Types.ObjectId, ref: "Admission", required: true, index: true },
  nursingDay: { type: Number, required: true, min: 1 },
  hospitalDate: { type: String, match: /^\d{4}-\d{2}-\d{2}$/ },
  category: { type: String, enum: NURSING_SUPPLY_CATEGORIES, required: true },
  itemName: { type: String, trim: true, required: true, maxlength: 200 },
  quantity: { type: Number, required: true, min: 0.01, max: 100000 },
  notes: { type: String, trim: true, maxlength: 2000 },
  author: { type: Schema.Types.ObjectId, ref: "User", required: true },
  recordedAt: { type: Date, required: true, default: Date.now },
}, { timestamps: true });

nursingMedicalSupplySchema.index({ admissionId: 1, nursingDay: 1, recordedAt: 1 });

const NursingMedicalSupply = mongoose.models.NursingMedicalSupply
  || mongoose.model<INursingMedicalSupply>("NursingMedicalSupply", nursingMedicalSupplySchema);

export default NursingMedicalSupply;
