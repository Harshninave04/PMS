import { Types } from "mongoose";
import Doctor from "@/models/doctor.model";
import { IDoctor } from "@/interfaces/doctor.interface";
import { CreateDoctorDto, UpdateDoctorDto } from "@/dto/doctor.dto";

export class DoctorRepository {
    async create(data: CreateDoctorDto): Promise<IDoctor> {
        return await new Doctor(data).save();
    }

    /**
     * Lists doctors within an authorization scope.
     *
     * `scopeFilter` is the immutable filter produced by
     * `authorizeRequest` -> `ScopeResolver`. It MUST be merged into the Mongo
     * query rather than post-filtered, otherwise a branch boundary is not
     * enforced at the database layer. Callers must have already rejected a
     * deny-all scope (see `buildScopedQuery`).
     */
    async findAll(scopeFilter?: Record<string, unknown>): Promise<IDoctor[]> {
        return await Doctor.find(scopeFilter ?? {})
            .populate("userId", "-password")
            .populate("departmentId")
            .lean();
    }

    async findById(id: Types.ObjectId, scopeFilter?: Record<string, unknown>): Promise<IDoctor | null> {
        const query: Record<string, unknown> = scopeFilter && Object.keys(scopeFilter).length > 0
            ? { $and: [{ _id: id }, scopeFilter] }
            : { _id: id };
        return await Doctor.findOne(query).populate("userId", "-password").populate("departmentId").lean();
    }

    async findByUserId(userId: Types.ObjectId): Promise<IDoctor | null> {
        return await Doctor.findOne({ userId }).populate("userId", "-password").populate("departmentId").lean();
    }

    async findByLicenseNo(licenseNo: string): Promise<IDoctor | null> {
        return await Doctor.findOne({ licenseNo }).lean();
    }

    async findByDepartmentId(departmentId: Types.ObjectId): Promise<IDoctor[]> {
        return await Doctor.find({ departmentId }).populate("userId", "-password").lean();
    }

    async update(id: Types.ObjectId, data: UpdateDoctorDto): Promise<IDoctor | null> {
        return await Doctor.findByIdAndUpdate(id, data, { new: true }).populate("userId", "-password").populate("departmentId").lean();
    }

    async delete(id: Types.ObjectId): Promise<IDoctor | null> {
        return await Doctor.findByIdAndDelete(id).lean();
    }
}

export default new DoctorRepository();
