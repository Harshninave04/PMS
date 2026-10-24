import { Types } from "mongoose";

export interface CreatePatientDto {
    uhid?: string;
    name: string;
    age: number;
    gender: string;
    bloodGroup?: string;
    contact?: string;
    email?: string;
    address: string;
    emergencyContact: string;
    dateOfBirth?: Date | string;
    maritalStatus?: string;
    guardianName?: string;
    guardianRelation?: string;
    allergies?: string[];
    medicalHistory?: string[];
    identificationType?: string;
    identificationNumber?: string;
    photo?: string;
    photoId?: string;
    branchId: Types.ObjectId | string;
    isActive?: boolean;
    emergencyRegistration?: boolean;
    confirmSharedPhone?: boolean;
    relatedPatientId?: Types.ObjectId | string;
    relation?: "Spouse" | "Child" | "Parent" | "Sibling" | "Other family" | "Not related";
    sharedPhoneWithPatientId?: Types.ObjectId | string;
    sharedPhoneRelation?: "Spouse" | "Child" | "Parent" | "Sibling" | "Other family" | "Not related";
    sharedPhoneConfirmedBy?: Types.ObjectId | string;
    sharedPhoneConfirmedAt?: Date;
}

export interface UpdatePatientDto {
    uhid?: string;
    name?: string;
    age?: number;
    gender?: string;
    bloodGroup?: string;
    contact?: string;
    email?: string;
    address?: string;
    emergencyContact?: string;
    dateOfBirth?: Date | string;
    maritalStatus?: string;
    guardianName?: string;
    guardianRelation?: string;
    allergies?: string[];
    medicalHistory?: string[];
    identificationType?: string;
    identificationNumber?: string;
    photo?: string;
    photoId?: string;
    branchId?: Types.ObjectId | string;
    isActive?: boolean;
    isMerged?: boolean;
    mergedWith?: Types.ObjectId | string;
    mergeReason?: string;
    sharedPhoneWithPatientId?: Types.ObjectId | string;
    sharedPhoneRelation?: "Spouse" | "Child" | "Parent" | "Sibling" | "Other family" | "Not related";
    sharedPhoneConfirmedBy?: Types.ObjectId | string;
    sharedPhoneConfirmedAt?: Date;
}

export interface AddPatientDocumentDto {
    title: string;
    category: "LAB_REPORT" | "PRESCRIPTION" | "DISCHARGE_SUMMARY" | "ID_PROOF" | "CONSENT_FORM" | "RADIOLOGY" | "OTHER";
    fileUrl: string;
    fileName: string;
    fileSize?: string;
    notes?: string;
}

export interface MergePatientDto {
    primaryPatientId: string;
    secondaryPatientId: string;
    reason: string;
}

