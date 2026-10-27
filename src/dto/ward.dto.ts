import { Types } from "mongoose";

export interface CreateWardDto {
    wardName: string;
    wardCode: string;
    wardType?: string; // Optional due to default in schema
    floor: number;
    bedRatePerDay?: number;
    nursingRatePerDay?: number;
    organizationId: Types.ObjectId | string;
    isActive?: boolean;
}

export interface UpdateWardDto {
    wardName?: string;
    wardCode?: string;
    wardType?: string;
    floor?: number;
    bedRatePerDay?: number;
    nursingRatePerDay?: number;
    organizationId?: Types.ObjectId | string;
    isActive?: boolean;
}
