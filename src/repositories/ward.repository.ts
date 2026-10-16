import { Types } from "mongoose";
import Ward from "@/models/ward.model";
// Keep populate's referenced model registered in runtimes that load this repository directly.
import "@/models/organization.model";
import { IWard } from "@/interfaces/ward.interface";
import { CreateWardDto, UpdateWardDto } from "@/dto/ward.dto";

export class WardRepository {
    async create(data: CreateWardDto): Promise<IWard> {
        return await new Ward(data).save();
    }

    async findAll(): Promise<IWard[]> {
        return await Ward.find().populate("organizationId").lean();
    }

    async findById(id: Types.ObjectId): Promise<IWard | null> {
        return await Ward.findById(id).populate("organizationId").lean();
    }

    async findByWardCode(wardCode: string): Promise<IWard | null> {
        return await Ward.findOne({ wardCode }).lean();
    }

    async findByOrganizationId(organizationId: Types.ObjectId): Promise<IWard[]> {
        return await Ward.find({ organizationId }).populate("organizationId").lean();
    }

    async update(id: Types.ObjectId, data: UpdateWardDto): Promise<IWard | null> {
        return await Ward.findByIdAndUpdate(id, data, { new: true }).lean();
    }

    async delete(id: Types.ObjectId): Promise<IWard | null> {
        return await Ward.findByIdAndDelete(id).lean();
    }
}

export default new WardRepository();
