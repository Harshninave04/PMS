import mongoose, { Schema, Document, Types } from "mongoose";

export type CareTaskPriority = "Routine" | "Urgent" | "STAT";
export type CareTaskStatus = "NEW" | "ACKNOWLEDGED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";

export interface ICareTask extends Document {
    admissionId: Types.ObjectId;
    patientId: Types.ObjectId;
    authorId: Types.ObjectId;
    title: string;
    detail?: string;
    priority: CareTaskPriority;
    status: CareTaskStatus;
    dueAt?: Date;
    acknowledgedAt?: Date;
    acknowledgedBy?: Types.ObjectId;
    completedAt?: Date;
    completedBy?: Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const CareTaskSchema: Schema = new Schema(
    {
        admissionId: { type: Schema.Types.ObjectId, ref: "Admission", required: true, index: true },
        patientId: { type: Schema.Types.ObjectId, ref: "Patient", required: true, index: true },
        authorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
        title: { type: String, required: true, trim: true, maxlength: 200 },
        detail: { type: String, trim: true, maxlength: 2000 },
        priority: {
            type: String,
            enum: ["Routine", "Urgent", "STAT"],
            default: "Routine",
            index: true,
        },
        status: {
            type: String,
            enum: ["NEW", "ACKNOWLEDGED", "IN_PROGRESS", "COMPLETED", "CANCELLED"],
            default: "NEW",
            index: true,
        },
        dueAt: { type: Date },
        acknowledgedAt: { type: Date },
        acknowledgedBy: { type: Schema.Types.ObjectId, ref: "User" },
        completedAt: { type: Date },
        completedBy: { type: Schema.Types.ObjectId, ref: "User" },
    },
    { timestamps: true }
);

CareTaskSchema.index({ admissionId: 1, status: 1, createdAt: -1 });
CareTaskSchema.index({ admissionId: 1, createdAt: -1 });
CareTaskSchema.index({ patientId: 1, status: 1 });

export const CARE_TASK_TRANSITIONS: Record<CareTaskStatus, CareTaskStatus[]> = {
    NEW: ["ACKNOWLEDGED", "IN_PROGRESS", "CANCELLED"],
    ACKNOWLEDGED: ["IN_PROGRESS", "COMPLETED", "CANCELLED"],
    IN_PROGRESS: ["COMPLETED", "CANCELLED"],
    COMPLETED: [],
    CANCELLED: [],
};

export function canTransitionCareTask(from: CareTaskStatus, to: CareTaskStatus): boolean {
    return (CARE_TASK_TRANSITIONS[from] ?? []).includes(to);
}

export const CareTask =
    mongoose.models.CareTask ||
    mongoose.model<ICareTask>("CareTask", CareTaskSchema);
