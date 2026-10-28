import { Document, Types } from "mongoose";

export interface IWard extends Document {
    wardName: string;
    wardCode: string;
    wardType: string;
    floor: number;
    /** Per-day rates used by the billing draft; unset means "not configured". */
    bedRatePerDay?: number;
    nursingRatePerDay?: number;
    organizationId: Types.ObjectId;
    isActive: boolean;
}