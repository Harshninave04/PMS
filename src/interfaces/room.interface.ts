import { Document, Types } from "mongoose";
export interface IRoom extends Document {
    roomNumber: string;
    roomType: string;
    wardId: Types.ObjectId;
    organizationId?: Types.ObjectId;
    description?: string;
    isActive: boolean;
}