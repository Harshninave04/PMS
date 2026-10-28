import { Document, Types } from "mongoose";

export interface IInvoice extends Document {
    patientId: Types.ObjectId;
    // Additive link for the discharge-to-bill pipeline (Phase 3).
    admissionId?: Types.ObjectId;
    // False only for CANCELLED invoices — drives the partial unique index that
    // allows one non-cancelled invoice per admission ($in/$ne unsupported in
    // partial filters). Defaults to true and is never edited into existing rows.
    isActive?: boolean;
    invoiceNumber?: string;
    department?: string;
    items: {
        name: string;
        price: number;
        quantity: number;
        discount: number;
        tax?: number;
        total: number;
    }[];
    totalAmount: number;
    discount: number;
    // Mandatory when discount > 0 (Create Bill simplification: one bill-level
    // discount with an auditable reason; rows never discount individually).
    discountReason?: string;
    taxAmount?: number;
    finalAmount: number;
    paidAmount?: number;
    balanceAmount?: number;
    paymentMethod?: string;
    dueDate?: Date;
    notes?: string;
    status: "PAID" | "UNPAID" | "PARTIALLY_PAID" | "CANCELLED" | string;
    branchId?: Types.ObjectId;
}