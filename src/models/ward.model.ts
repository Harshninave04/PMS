import mongoose, { Schema, model, Types } from "mongoose";
import { IWard } from "@/interfaces/ward.interface";

const wardSchema = new Schema<IWard>(
    {
        wardName: {
            type: String,
            required: true
        },
        wardCode: {
            type: String,
            unique: true,
            required: true,
            trim: true
        },
        wardType: {
            type: String,
            enum: [
                "GENERAL",
                "ICU",
                "CCU",
                "NICU",
                "PICU",
                "MATERNITY",
                "PEDIATRIC",
                "PRIVATE",
                "SEMI_PRIVATE",
                "EMERGENCY",
                "OTHER",
            ],
            default: 'GENERAL',
        },
        floor: {
            type: Number,
            required: true
        },
        // Billing rates are configured per ward (nursing also) and snapshotted
        // into invoices at billing time. Optional by design: unset rates make
        // the matching draft rows red and block save until configured.
        bedRatePerDay: {
            type: Number,
            min: 0
        },
        nursingRatePerDay: {
            type: Number,
            min: 0
        },
        organizationId: {
            type: Types.ObjectId,
            ref: 'Organization',
            required: true
        },
        isActive: {
            type: Boolean,
            default: true
        }
    }, { timestamps: true })

const Ward = mongoose.models.Ward || mongoose.model<IWard>('Ward', wardSchema);
export default Ward;