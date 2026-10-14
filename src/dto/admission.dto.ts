import { Types } from "mongoose";

export interface CreateAdmissionDto {
    ipdNumber?: string;
    admittedBy?: Types.ObjectId | string;
    admissionSource?: "OPD" | "EMERGENCY" | "REFERRAL" | "DIRECT";
    paymentType?: "CASH" | "INSURANCE" | "CORPORATE";
    advanceDeposit?: number;
    consentSigned?: boolean;
    consentPending?: boolean;
    wardType?: "GENERAL" | "SEMI_PRIVATE" | "PRIVATE" | "ICU" | "EMERGENCY";
    patientId: Types.ObjectId | string;
    doctorId: Types.ObjectId | string;
    branchId?: Types.ObjectId | string;
    bedId: Types.ObjectId | string;
    admissionDate: Date | string;
    dischargeDate?: Date | string;
    status?: string;
    admissionType?: string;
    reasonForAdmission?: string;
    initialDiagnosis?: string;
    emergencyContact?: {
        name?: string;
        phone?: string;
        relation?: string;
    };
    insurance?: {
        provider?: string;
        policyNumber?: string;
    };
    notes?: string;
}

export interface UpdateAdmissionDto {
    patientId?: Types.ObjectId | string;
    doctorId?: Types.ObjectId | string;
    branchId?: Types.ObjectId | string;
    bedId?: Types.ObjectId | string;
    admissionDate?: Date | string;
    dischargeDate?: Date | string;
    status?: string;
    admissionType?: string;
    reasonForAdmission?: string;
    initialDiagnosis?: string;
    emergencyContact?: {
        name?: string;
        phone?: string;
        relation?: string;
    };
    insurance?: {
        provider?: string;
        policyNumber?: string;
    };
    notes?: string;
    dischargeCondition?: string;
    finalDiagnosis?: string;
    dischargeSummary?: string;
    dischargeMedications?: Array<{
        medicineName: string;
        dosage: string;
        frequency: string;
        duration: string;
        instructions?: string;
    }>;
    followUpDate?: Date | string;
    followUpInstructions?: string;
    dischargeAdvice?: string;
}

export interface TransferAdmissionDto {
    admissionId: Types.ObjectId | string;
    newBedId: Types.ObjectId | string;
    newDoctorId?: Types.ObjectId | string;
    transferredBy?: Types.ObjectId | string;
    reason: string;
    transferDate?: Date | string;
    notes?: string;
}

export interface DischargeAdmissionDto {
    admissionId: Types.ObjectId | string;
    dischargeDate?: Date | string;
    dischargeCondition: string;
    finalDiagnosis: string;
    dischargeSummary?: string;
    dischargeMedications?: Array<{
        medicineName: string;
        dosage: string;
        frequency: string;
        duration: string;
        instructions?: string;
    }>;
    followUpDate?: Date | string;
    followUpInstructions?: string;
    dischargeAdvice?: string;
    notes?: string;
}
