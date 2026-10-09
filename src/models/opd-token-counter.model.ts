import { Schema, model, models, Types, Document } from "mongoose";

export interface IOpdTokenCounter extends Document {
    doctorId: Types.ObjectId;
    day: string;
    seq: number;
}

const opdTokenCounterSchema = new Schema<IOpdTokenCounter>(
    {
        doctorId: {
            type: Schema.Types.ObjectId,
            ref: 'Doctor',
            required: true
        },
        day: {
            type: String,
            required: true
        },
        seq: {
            type: Number,
            required: true,
            default: 0
        }
    },
    { timestamps: true }
);

opdTokenCounterSchema.index({ doctorId: 1, day: 1 }, { unique: true });

export default models?.OpdTokenCounter || model<IOpdTokenCounter>('OpdTokenCounter', opdTokenCounterSchema);
