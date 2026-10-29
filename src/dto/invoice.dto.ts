import { Types } from "mongoose";

export interface InvoiceItemDto {
    name: string;
    price: number;
    quantity: number;
    discount: number;
    tax?: number;
    category?: string;
    total: number;
}

export interface CreateInvoiceDto {
    patientId: Types.ObjectId | string;
    admissionId?: Types.ObjectId | string;
    invoiceNumber?: string;
    department?: string;
    items: InvoiceItemDto[];
    totalAmount: number;
    discount: number;
    discountReason?: string;
    taxAmount?: number;
    finalAmount: number;
    paidAmount?: number;
    balanceAmount?: number;
    paymentMethod?: string;
    dueDate?: Date;
    notes?: string;
    status?: string;
    /** Set by the server when a final invoice is created. */
    billingStatus?: "BILLING_COMPLETED";
    branchId?: Types.ObjectId | string;
    isActive?: boolean;
    /** Server-set only (draft-vs-final audit trail) — the controller overwrites whatever the client sends. */
    audit?: {
        source: "CASE" | "MANUAL";
        submittedFinalAmount?: number;
        serverFinalAmount: number;
        drift: number;
        at: Date;
    };
}

export interface UpdateInvoiceDto {
    patientId?: Types.ObjectId | string;
    invoiceNumber?: string;
    department?: string;
    items?: InvoiceItemDto[];
    totalAmount?: number;
    discount?: number;
    discountReason?: string;
    taxAmount?: number;
    finalAmount?: number;
    paidAmount?: number;
    balanceAmount?: number;
    paymentMethod?: string;
    dueDate?: Date;
    notes?: string;
    status?: string;
    branchId?: Types.ObjectId | string;
    isActive?: boolean;
}
