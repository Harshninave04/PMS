import { Types } from "mongoose";

export interface CreatePaymentDto {
    invoiceId?: Types.ObjectId | string;
    patientId: Types.ObjectId | string;
    type?: "PAYMENT" | "ADVANCE" | "REFUND";
    admissionId?: Types.ObjectId | string;
    amount: number;
    method: "CASH" | "CARD" | "UPI" | "BANK_TRANSFER" | "CHEQUE" | "INSURANCE_TPA" | string;
    /** Phase 3.7: collect one bill in several lines — each becomes its own receipt under one group. */
    lines?: Array<{ amount: number; method: string; notes?: string }>;
    transactionId?: string;
    receiptNumber?: string;
    cashierName?: string;
    notes?: string;
    branchId?: Types.ObjectId | string;
}

export interface UpdatePaymentDto {
    invoiceId?: Types.ObjectId | string;
    patientId?: Types.ObjectId | string;
    type?: "PAYMENT" | "ADVANCE" | "REFUND";
    admissionId?: Types.ObjectId | string;
    amount?: number;
    method?: "CASH" | "CARD" | "UPI" | "BANK_TRANSFER" | "CHEQUE" | "INSURANCE_TPA" | string;
    transactionId?: string;
    receiptNumber?: string;
    cashierName?: string;
    notes?: string;
    branchId?: Types.ObjectId | string;
}
