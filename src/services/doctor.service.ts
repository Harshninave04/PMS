import doctorRepository, { DoctorRepository } from "@/repositories/doctor.repository";
import { Types } from "mongoose";
import { IDoctor } from "@/interfaces/doctor.interface";
import { CreateDoctorDto, UpdateDoctorDto } from "@/dto/doctor.dto";
import { isDenyAllFilter } from "@/lib/rbac/scope-filter";

export class DoctorService {
    constructor(private repository: DoctorRepository = doctorRepository) { }

    async createDoctor(data: CreateDoctorDto): Promise<IDoctor> {
        const existingByUser = await this.repository.findByUserId(new Types.ObjectId(data.userId));
        if (existingByUser) {
            throw { statusCode: 409, message: "A doctor profile already exists for this user" };
        }
        const existingByLicense = await this.repository.findByLicenseNo(data.licenseNo);
        if (existingByLicense) {
            throw { statusCode: 409, message: `License number '${data.licenseNo}' is already registered` };
        }
        return await this.repository.create(data);
    }

    /**
     * Returns doctors inside the caller's authorization scope.
     *
     * `scopeFilter` is the immutable filter emitted by authorizeRequest. It is
     * passed straight through to the repository so the boundary is enforced in
     * the database query. An unsatisfiable (deny-all) scope is rejected before
     * the query runs, which surfaces as an empty roster rather than a leak.
     */
    async getAllDoctors(scopeFilter?: Record<string, unknown>): Promise<IDoctor[]> {
        if (isDenyAllFilter(scopeFilter)) return [];
        return await this.repository.findAll(scopeFilter);
    }

    async getDoctorById(id: Types.ObjectId, scopeFilter?: Record<string, unknown>): Promise<IDoctor | null> {
        if (isDenyAllFilter(scopeFilter)) return null;
        return await this.repository.findById(id, scopeFilter);
    }

    async getDoctorByUserId(userId: Types.ObjectId): Promise<IDoctor | null> {
        return await this.repository.findByUserId(userId);
    }

    async getDoctorsByDepartmentId(departmentId: Types.ObjectId): Promise<IDoctor[]> {
        return await this.repository.findByDepartmentId(departmentId);
    }

    async updateDoctor(id: Types.ObjectId, data: UpdateDoctorDto): Promise<IDoctor | null> {
        const doctor = await this.repository.findById(id);
        if (!doctor) {
            throw { statusCode: 404, message: "Doctor not found" };
        }
        if (data.licenseNo) {
            const existing = await this.repository.findByLicenseNo(data.licenseNo);
            if (existing && existing._id.toString() !== id.toString()) {
                throw { statusCode: 409, message: `License number '${data.licenseNo}' is already registered` };
            }
        }
        if (data.userId) {
            const existing = await this.repository.findByUserId(new Types.ObjectId(data.userId));
            if (existing && existing._id.toString() !== id.toString()) {
                throw { statusCode: 409, message: "A doctor profile already exists for this user" };
            }
        }
        return await this.repository.update(id, data);
    }

    async deleteDoctor(id: Types.ObjectId): Promise<IDoctor | null> {
        const doctor = await this.repository.findById(id);
        if (!doctor) {
            throw { statusCode: 404, message: "Doctor not found" };
        }
        return await this.repository.delete(id);
    }
}

export default new DoctorService();
