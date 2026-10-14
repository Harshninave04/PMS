import { Types } from "mongoose";

export interface CreateCareTaskDto {
    admissionId: Types.ObjectId | string;
    patientId: Types.ObjectId | string;
    title: string;
    detail?: string;
    priority?: "Routine" | "Urgent" | "STAT" | string;
    dueAt?: Date | string;
}

export interface UpdateCareTaskDto {
    status: "NEW" | "ACKNOWLEDGED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED" | string;
}
