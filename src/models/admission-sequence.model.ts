import mongoose, { Schema } from "mongoose";

export interface IAdmissionSequence {
    year: number;
    sequence: number;
}

const admissionSequenceSchema = new Schema<IAdmissionSequence>(
    {
        year: { type: Number, required: true },
        sequence: { type: Number, required: true, min: 0, default: 0 }
    },
    { timestamps: true }
);

admissionSequenceSchema.index({ year: 1 }, { unique: true, name: "admission_sequence_year_unique" });

const AdmissionSequence = mongoose.models.AdmissionSequence ||
    mongoose.model<IAdmissionSequence>("AdmissionSequence", admissionSequenceSchema);

export default AdmissionSequence;
