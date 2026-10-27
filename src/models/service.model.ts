import mongoose, { Schema } from "mongoose";
import { IService } from "@/interfaces/service.interface";

// Chargeable service master backing the Create Bill autocomplete (Billing >
// Rates). Invoice rows snapshot name + rate at billing time, so editing or
// deleting a service never rewrites history.
const serviceSchema = new Schema<IService>(
    {
        name: {
            type: String,
            required: true,
            trim: true,
            unique: true,
            maxlength: 100
        },
        category: {
            type: String,
            required: true,
            trim: true,
            maxlength: 60,
            default: "General"
        },
        defaultRate: {
            type: Number,
            required: true,
            min: 0
        },
        active: {
            type: Boolean,
            default: true
        }
    },
    { timestamps: true }
);

export default mongoose.models.Service || mongoose.model<IService>("Service", serviceSchema);
