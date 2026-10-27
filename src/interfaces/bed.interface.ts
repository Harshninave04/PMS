import { Document, Types } from "mongoose";
export interface IBed extends Document {
    bedNumber: string,
    roomId: Types.ObjectId,
    bedType: string,
    status: string,
    /** Optional per-bed overrides of the ward billing rates (unset = ward rate). */
    bedRatePerDay?: number,
    nursingRatePerDay?: number,
    isActive: boolean
}