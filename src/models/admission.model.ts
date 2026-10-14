import mongoose, { Schema, model, Types } from "mongoose";
import { IAdmission } from "@/interfaces/admission.interface";

const transferHistorySchema = new Schema(
    {
        transferredBy: {
            type: Types.ObjectId,
            ref: 'User'
        },
        fromBedId: {
            type: Types.ObjectId,
            ref: 'Bed',
            required: true
        },
        toBedId: {
            type: Types.ObjectId,
            ref: 'Bed',
            required: true
        },
        fromDoctorId: {
            type: Types.ObjectId,
            ref: 'User'
        },
        toDoctorId: {
            type: Types.ObjectId,
            ref: 'User'
        },
        reason: {
            type: String,
            required: true
        },
        transferDate: {
            type: Date,
            default: Date.now
        },
        notes: {
            type: String
        }
    },
    { _id: true }
);

const dischargeMedicationSchema = new Schema(
    {
        medicineName: { type: String, required: true },
        dosage: { type: String, required: true },
        frequency: { type: String, required: true },
        duration: { type: String, required: true },
        instructions: { type: String }
    },
    { _id: true }
);

const admissionSchema = new Schema<IAdmission>(
    {
        ipdNumber: { type: String, trim: true },
        admittedBy: { type: Types.ObjectId, ref: 'User' },
        admissionSource: {
            type: String,
            enum: ["OPD", "EMERGENCY", "REFERRAL", "DIRECT"],
            default: "DIRECT"
        },
        paymentType: { type: String, enum: ["CASH", "INSURANCE", "CORPORATE"] },
        advanceDeposit: { type: Number, min: 0 },
        consentSigned: { type: Boolean, default: false },
        consentPending: { type: Boolean, default: false },
        wardType: {
            type: String,
            enum: ["GENERAL", "SEMI_PRIVATE", "PRIVATE", "ICU", "EMERGENCY"],
            default: "GENERAL"
        },
        patientId: {
            type: Types.ObjectId,
            ref: 'Patient',
            required: true
        },
        doctorId: {
            type: Types.ObjectId,
            ref: 'User',
            required: true
        },
        branchId: {
            type: Types.ObjectId,
            ref: 'Branch',
            required: false
        },
        bedId: {
            type: Types.ObjectId,
            ref: 'Bed',
            required: true
        },
        admissionDate: {
            type: Date,
            required: true
        },
        dischargeDate: {
            type: Date
        },
        status: {
            type: String,
            enum: [
                "ADMITTED",
                "TRANSFERRED",
                "DISCHARGED",
                "CANCELLED",
            ],
            default: "ADMITTED",
            required: true
        },
        admissionType: {
            type: String,
            enum: [
                "EMERGENCY",
                "ELECTIVE",
                "TRANSFER",
                "DAYCARE",
            ],
            default: 'ELECTIVE'
        },
        reasonForAdmission: {
            type: String
        },
        initialDiagnosis: {
            type: String
        },
        emergencyContact: {
            name: String,
            phone: String,
            relation: String
        },
        insurance: {
            provider: String,
            policyNumber: String
        },
        notes: {
            type: String
        },
        // Clinical Discharge Data
        dischargeCondition: {
            type: String,
            enum: [
                "RECOVERED",
                "IMPROVED",
                "STABLE",
                "TRANSFERRED",
                "LAMA",
                "ON_REQUEST",
                "DECEASED",
                "OTHER"
            ]
        },
        finalDiagnosis: {
            type: String
        },
        dischargeSummary: {
            type: String
        },
        dischargeMedications: {
            type: [dischargeMedicationSchema],
            default: []
        },
        followUpDate: {
            type: Date
        },
        followUpInstructions: {
            type: String
        },
        dischargeAdvice: {
            type: String
        },
        // Patient Transfer History
        transferHistory: {
            type: [transferHistorySchema],
            default: []
        }
    }, { timestamps: true });

const Admission = mongoose.models.Admission || model<IAdmission>('Admission', admissionSchema);
Admission.schema.index(
    { ipdNumber: 1 },
    {
        unique: true,
        partialFilterExpression: { ipdNumber: { $type: "string" } },
        name: "admission_ipd_number_unique"
    }
);
export default Admission;
