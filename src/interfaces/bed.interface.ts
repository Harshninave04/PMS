import { Document, Types } from "mongoose";
export interface IBed extends Document {
    bedNumber: string,
    roomId: Types.ObjectId,
    organizationId?: Types.ObjectId,
    bedType: string,
    status: string,
    isActive: boolean
}