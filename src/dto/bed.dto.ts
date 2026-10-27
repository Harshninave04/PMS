import { Types } from "mongoose";

export interface CreateBedDto {
    bedNumber: string;
    roomId: Types.ObjectId | string;
    bedType?: string; // Optional due to default in schema
    status?: string; // Optional due to default in schema
    bedRatePerDay?: number;
    nursingRatePerDay?: number;
    isActive?: boolean;
}

export interface UpdateBedDto {
    bedNumber?: string;
    roomId?: Types.ObjectId | string;
    bedType?: string;
    status?: string;
    bedRatePerDay?: number;
    nursingRatePerDay?: number;
    isActive?: boolean;
}
