import { Schema, model, models, Types } from "mongoose";
import { IInvoice } from "@/interfaces/invoice.interface";

const invoiceSchema = new Schema<IInvoice>({
    patientId: {
        type: Types.ObjectId,
        ref: "Patient",
        required: true
    },
    // Additive link for the discharge-to-bill pipeline (Phase 3). Uniqueness
    // comes from the partial unique index created by
    // scripts/create-bill-unique-index.ts (never at startup): one non-cancelled
    // invoice per stay. isActive excludes CANCELLED rows because $ne/$in are
    // unsupported in partialFilterExpression.
    admissionId: {
        type: Types.ObjectId,
        ref: "Admission"
    },
    isActive: {
        type: Boolean,
        default: true
    },
    invoiceNumber: {
        type: String,
        index: true
    },
    department: {
        type: String,
        default: "General"
    },
    items: {
        type: [
            {
                name: String,
                price: Number,
                quantity: Number,
                discount: Number,
                tax: { type: Number, default: 0 },
                total: Number,
            }
        ],
        required: true
    },
    totalAmount: {
        type: Number,
        required: true
    },
    discount: {
        type: Number,
        required: true
    },
    discountReason: {
        type: String,
        trim: true,
        maxlength: 300
    },
    taxAmount: {
        type: Number,
        default: 0
    },
    finalAmount: {
        type: Number,
        required: true
    },
    paidAmount: {
        type: Number,
        default: 0
    },
    balanceAmount: {
        type: Number,
        default: 0
    },
    paymentMethod: {
        type: String
    },
    dueDate: {
        type: Date
    },
    notes: {
        type: String
    },
    // Draft-vs-final audit trail (wrap-up phase): what the billing desk
    // submitted before the server recomputed the authoritative totals.
    audit: {
        type: {
            // CASE = billed from a nursing-flagged stay draft; MANUAL = free-hand invoice.
            source: { type: String, enum: ["CASE", "MANUAL"], required: true },
            submittedFinalAmount: { type: Number },
            serverFinalAmount: { type: Number, required: true },
            drift: { type: Number, required: true },
            at: { type: Date, required: true },
        },
        default: null,
    },
    status: {
        type: String,
        enum: ["PAID", "UNPAID", "PARTIALLY_PAID", "CANCELLED"],
        default: "UNPAID"
    },
    // Final-bill workflow state is separate from collection state. A finalized
    // credit invoice is BILLING_COMPLETED even while a balance remains due.
    billingStatus: {
        type: String,
        enum: ["BILLING_COMPLETED"],
        default: "BILLING_COMPLETED",
    },
    branchId: {
        type: Types.ObjectId,
        ref: "Branch",
        required: false
    }
}, { timestamps: true });

export default models.Invoice || model<IInvoice>("Invoice", invoiceSchema);
