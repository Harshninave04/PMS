import { Types, ClientSession } from "mongoose";
import Invoice from "@/models/invoice.model";
import { IInvoice } from "@/interfaces/invoice.interface";
import { CreateInvoiceDto, UpdateInvoiceDto } from "@/dto/invoice.dto";

export class InvoiceRepository {
    async create(data: CreateInvoiceDto, options?: { session?: ClientSession }): Promise<IInvoice> {
        return await new Invoice(data).save(options);
    }

    async findAll(): Promise<IInvoice[]> {
        return await Invoice.find().populate("patientId").populate("branchId").populate("admissionId", "status dischargeDate").lean();
    }

    async findById(id: Types.ObjectId): Promise<IInvoice | null> {
        return await Invoice.findById(id).populate("patientId").populate("branchId").populate("admissionId", "status dischargeDate").lean();
    }

    async findByBranchId(branchId: Types.ObjectId): Promise<IInvoice[]> {
        return await Invoice.find({ branchId }).populate("patientId").populate("admissionId", "status dischargeDate").lean();
    }
    
    async findByPatientId(patientId: Types.ObjectId): Promise<IInvoice[]> {
        return await Invoice.find({ patientId }).populate("branchId").populate("admissionId", "status dischargeDate").lean();
    }

    async update(id: Types.ObjectId, data: UpdateInvoiceDto): Promise<IInvoice | null> {
        return await Invoice.findByIdAndUpdate(id, data, { new: true }).populate("patientId").populate("branchId").populate("admissionId", "status dischargeDate").lean();
    }

    async delete(id: Types.ObjectId): Promise<IInvoice | null> {
        return await Invoice.findByIdAndDelete(id).lean();
    }
}

export default new InvoiceRepository();
