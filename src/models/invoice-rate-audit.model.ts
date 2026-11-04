import mongoose, { Schema, Types } from "mongoose";

const invoiceRateAuditSchema = new Schema({
  userId: { type: Types.ObjectId, ref: "User", required: true, index: true },
  invoiceId: { type: Types.ObjectId, ref: "Invoice", required: true, index: true },
  lineIndex: { type: Number, required: true },
  lineName: { type: String, required: true },
  rate: { type: Number, required: true, min: 0.01 },
}, { timestamps: { createdAt: true, updatedAt: false } });

const InvoiceRateAudit = mongoose.models.InvoiceRateAudit || mongoose.model("InvoiceRateAudit", invoiceRateAuditSchema);
export default InvoiceRateAudit;
