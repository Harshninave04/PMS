import { Document, Types } from "mongoose";

export interface IAppointment extends Document {
    patientId: Types.ObjectId;
    doctorId: Types.ObjectId;
    branchId?: Types.ObjectId;
    appointmentDate: Date;
    appointmentTime?: string;
    status: string;
    type: string;
    reason: string;
    notes?: string;
    triage?: {
        temperature?: number;
        bloodPressure?: string;
        pulse?: number;
        spo2?: number;
        weight?: number;
    };
    tokenNumber?: string;
    queueStatus?: "WAITING" | "CALLED" | "IN_CONSULTATION" | "COMPLETED" | "CANCELLED" | "NO_SHOW" | "TRIAGE" | "SKIPPED";
    priority?: "NORMAL" | "URGENT" | "EMERGENCY" | "VIP";
    consultationFee?: number;
    paymentStatus?: "PAID" | "PENDING" | "WAIVED";
    paymentMode?: string;
    cancellationReason?: string;
    cancellationCategory?: string;
    cancelledAt?: Date;
    rescheduledFrom?: Date | Types.ObjectId;
    rescheduleReason?: string;
    checkedInAt?: Date;
    calledAt?: Date;
    consultationStartedAt?: Date;
    consultationEndedAt?: Date;
    noShowRecordedAt?: Date;
}
