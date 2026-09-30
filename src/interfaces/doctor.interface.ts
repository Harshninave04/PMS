import { Document, Types } from "mongoose";

export interface IDoctor extends Document {
    userId: Types.ObjectId;
    departmentId: Types.ObjectId;
    /**
     * Owning organization. Denormalized from the linked User so that
     * ORGANIZATION-scoped grants resolve without a cross-collection join.
     */
    organizationId?: Types.ObjectId;
    /**
     * Owning branch. Denormalized from the linked User so that
     * BRANCH-scoped grants resolve without a cross-collection join.
     */
    branchId?: Types.ObjectId;
    licenseNo: string;
    specialization?: string;
    qualification?: string;
    experienceYears?: number;
    consultationFee?: number;
    roomNumber?: string;
    bio?: string;
    phone?: string;
    status?: "ACTIVE" | "INACTIVE" | "ON_LEAVE";
}