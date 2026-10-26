import { Types } from "mongoose";

export interface CreateAdmissionDto {
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

export interface AssignCareTeamDto {
    nurseIds?: Array<Types.ObjectId | string>;
    doctorIds?: Array<Types.ObjectId | string>;
}

export interface TransferAdmissionDto {
    admissionId: Types.ObjectId | string;
    newBedId: Types.ObjectId | string;
    newDoctorId?: Types.ObjectId | string;
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

export interface DischargeRequestDto {
    admissionId: Types.ObjectId | string;
    notes?: string;
}

export interface BillingRequestDto {
    admissionId: Types.ObjectId | string;
    expectedDischargeAt: Date | string;
    notes?: string;
}

export interface DischargeNoteDto {
    admissionId: Types.ObjectId | string;
    text: string;
}
