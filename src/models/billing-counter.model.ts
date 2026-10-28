import { Schema, model, models, Document, Types } from "mongoose";

export interface IBillingCounter extends Document {
    key: string;
    seq: number;
}

const billingCounterSchema = new Schema<IBillingCounter>(
    {
        key: {
            type: String,
            required: true,
            unique: true
        },
        seq: {
            type: Number,
            required: true,
            default: 0
        }
    },
    { timestamps: true }
);

export default models.BillingCounter || model<IBillingCounter>("BillingCounter", billingCounterSchema);
