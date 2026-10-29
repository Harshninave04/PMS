import { Schema, model, models } from "mongoose";
import { IPayment } from "@/interfaces/payment.interface";

// type: PAYMENT collects against an invoice; ADVANCE is a deposit received for
// a stay before any bill exists (linked to the invoice when the bill is
// raised); REFUND returns collected money and reduces the invoice paidAmount.
const paymentSchema = new Schema<IPayment>({
    invoiceId: { type: Schema.Types.ObjectId, ref: "Invoice", required: false },
    patientId: { type: Schema.Types.ObjectId, ref: "Patient", required: true },
    type: { type: String, enum: ["PAYMENT", "ADVANCE", "REFUND"], default: "PAYMENT", index: true },
    admissionId: { type: Schema.Types.ObjectId, ref: "Admission", required: false, index: true },
    // A bill can be collected in several lines (cash part + card part…); all
    // receipts of one collection share this group id.
    receiptGroupId: { type: String, index: true },
    amount: { type: Number, required: true },
    method: { type: String, enum: ["CASH", "CARD", "UPI", "BANK_TRANSFER", "CHEQUE", "INSURANCE_TPA"], required: true },
    transactionId: { type: String },
    receiptNumber: { type: String, index: true },
    cashierName: { type: String, default: "Main Billing Counter" },
    notes: { type: String },
    date: { type: Date, default: Date.now },
    branchId: { type: Schema.Types.ObjectId, ref: "Branch", required: false }
}, { timestamps: true });

// Fast lookup of the unconsumed advances of a stay at bill-creation time.
paymentSchema.index({ admissionId: 1, type: 1, invoiceId: 1 });

export default models.Payment || model<IPayment>("Payment", paymentSchema);
