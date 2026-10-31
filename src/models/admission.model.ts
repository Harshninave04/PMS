import mongoose, { Schema, model, Types } from "mongoose";
import { IAdmission } from "@/interfaces/admission.interface";

const transferHistorySchema = new Schema(
    {
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
        isCatalogueMedicine: { type: Boolean },
        dosage: { type: String, required: true },
        frequency: { type: String, required: true },
        duration: { type: String, required: true },
        instructions: { type: String }
    },
    { _id: true }
);

const nursingHandoverSchema = new Schema(
    {
        fromNurseId: { type: Types.ObjectId, ref: 'User', required: true },
        toNurseId: { type: Types.ObjectId, ref: 'User', required: true },
        handoverNote: { type: String, required: true, trim: true },
        handedOverAt: { type: Date, default: Date.now, required: true }
    },
    { _id: true }
);

const dischargeNoteSchema = new Schema(
    {
        text: { type: String, required: true, trim: true },
        by: { type: Types.ObjectId, ref: 'User', required: true },
        at: { type: Date, default: Date.now, required: true }
    },
    { _id: true }
);

const billingMedicalSupplySchema = new Schema(
    {
        nursingDay: { type: Number, required: true, min: 1 },
        category: { type: String, required: true },
        itemName: { type: String, required: true },
        quantity: { type: Number, required: true, min: 0.01 },
        notes: { type: String },
        author: { type: Types.ObjectId, ref: 'User', required: true },
        recordedAt: { type: Date, required: true },
    },
    { _id: true }
);

const admissionSchema = new Schema<IAdmission>(
    {
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
        // Care-team assignment: primary doctor stays in `doctorId`.
        // Additional doctors/nurses share this stay. Nurses only see
        // admissions where they are listed here (see NursingService).
        assignedDoctors: {
            type: [{ type: Types.ObjectId, ref: 'User' }],
            default: []
        },
        assignedNurses: {
            type: [{ type: Types.ObjectId, ref: 'User' }],
            default: []
        },
        careTeamUpdatedAt: {
            type: Date
        },
        careTeamUpdatedBy: {
            type: Types.ObjectId,
            ref: 'User'
        },
        nursingHandoverHistory: {
            type: [nursingHandoverSchema],
            default: []
        },
        // Discharge pipeline: the assigned doctor flags the stay; nursing
        // hands it over and billing finalises the bill. The stay keeps its
        // ADMITTED/TRANSFERRED status until the real discharge lands.
        dischargeRequested: {
            type: Boolean,
            default: false
        },
        dischargeRequestedAt: {
            type: Date
        },
        dischargeRequestedBy: {
            type: Types.ObjectId,
            ref: 'User'
        },
        dischargeRequestNotes: {
            type: String,
            trim: true
        },
        // Nursing handoff to billing (Phase 2): the assigned nurse reviews the
        // stay and hands it to the accountant; billingRequested flips back off
        // on a recall until the accountant invoices the case.
        billingRequested: {
            type: Boolean,
            default: false
        },
        billingRequestedAt: {
            type: Date
        },
        billingRequestedBy: {
            type: Types.ObjectId,
            ref: 'User'
        },
        // Atomic application-level claim prevents simultaneous accountants
        // from creating two invoices for one stay when the optional unique
        // index has not yet been deployed. A stale claim is reclaimable.
        billingInvoiceClaimId: {
            type: Types.ObjectId
        },
        billingInvoiceClaimedAt: {
            type: Date
        },
        billingInvoiceId: {
            type: Types.ObjectId,
            ref: 'Invoice'
        },
        expectedDischargeAt: {
            type: Date
        },
        billingMedicalSupplies: {
            type: [billingMedicalSupplySchema],
            default: []
        },
        dischargeNotes: {
            type: [dischargeNoteSchema],
            default: []
        },
        // Patient Transfer History
        transferHistory: {
            type: [transferHistorySchema],
            default: []
        }
    }, { timestamps: true });

admissionSchema.index({ assignedNurses: 1, status: 1 });
admissionSchema.index({ dischargeRequested: 1, billingRequested: 1, status: 1 });
admissionSchema.index({ doctorId: 1, status: 1 });
admissionSchema.index({ patientId: 1, status: 1 });

const Admission = mongoose.models.Admission || model<IAdmission>('Admission', admissionSchema);
export default Admission;
