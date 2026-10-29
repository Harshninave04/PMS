import { Document, Types } from 'mongoose';

export interface IPayment extends Document {
    invoiceId?: Types.ObjectId;
    patientId: Types.ObjectId;
    /** PAYMENT collects against an invoice; ADVANCE is a pre-bill deposit; REFUND gives money back. */
    type: "PAYMENT" | "ADVANCE" | "REFUND";
    /** Set on ADVANCE receipts so the bill workspace can apply them to the stay. */
    admissionId?: Types.ObjectId;
    /** Shared by every receipt of one multi-line collection (cash + card…). */
    receiptGroupId?: string;
    amount: number;
    method: "CASH" | "CARD" | "UPI" | "BANK_TRANSFER" | "CHEQUE" | "INSURANCE_TPA" | string;
    transactionId?: string;
    receiptNumber?: string;
    cashierName?: string;
    notes?: string;
    date: Date;
    branchId?: Types.ObjectId;
}
