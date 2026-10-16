import admissionRepository, { AdmissionRepository } from "@/repositories/admission.repository";
import { Types } from "mongoose";
import { IAdmission } from "@/interfaces/admission.interface";
import { CreateAdmissionDto, UpdateAdmissionDto, TransferAdmissionDto, DischargeAdmissionDto, AssignCareTeamDto } from "@/dto/admission.dto";
import Bed from "@/models/bed.model";
import Admission from "@/models/admission.model";
import User from "@/models/user.model";

export class AdmissionService {
    constructor(private repository: AdmissionRepository = admissionRepository) { }

    async createAdmission(data: CreateAdmissionDto): Promise<IAdmission> {
        const activeAdmissionFilter: Record<string, unknown> = {
            patientId: new Types.ObjectId(data.patientId.toString()),
            status: { $in: ["ADMITTED", "TRANSFERRED"] },
        };
        if (data.branchId) activeAdmissionFilter.branchId = new Types.ObjectId(data.branchId.toString());
        const existingActiveStay = await Admission.findOne(activeAdmissionFilter).select("_id").lean();
        if (existingActiveStay) {
            throw {
                statusCode: 409,
                message: "This patient already has an active admission. Discharge the current stay before creating another.",
            };
        }

        // Create the admission
        const admission = await this.repository.create({
            ...data,
            status: data.status || "ADMITTED"
        });

        // Automatically update bed status to OCCUPIED
        if (data.bedId && Types.ObjectId.isValid(data.bedId.toString())) {
            await Bed.findByIdAndUpdate(data.bedId, { status: "OCCUPIED" });
        }

        return admission;
    }

    async getAllAdmissions(filter: any = {}): Promise<IAdmission[]> {
        return await this.repository.findAll(filter);
    }

    async getActiveAdmissions(): Promise<IAdmission[]> {
        return await this.repository.findActive();
    }

    async getDischargedAdmissions(): Promise<IAdmission[]> {
        return await this.repository.findDischarged();
    }

    async getAdmissionById(id: Types.ObjectId): Promise<IAdmission | null> {
        return await this.repository.findById(id);
    }

    async getAdmissionsByPatientId(patientId: Types.ObjectId): Promise<IAdmission[]> {
        return await this.repository.findByPatientId(patientId);
    }

    async getAdmissionsByDoctorId(doctorId: Types.ObjectId): Promise<IAdmission[]> {
        return await this.repository.findByDoctorId(doctorId);
    }

    async getAdmissionsByBranchId(branchId: Types.ObjectId): Promise<IAdmission[]> {
        return await this.repository.findByBranchId(branchId);
    }
    
    async getAdmissionsByBedId(bedId: Types.ObjectId): Promise<IAdmission[]> {
        return await this.repository.findByBedId(bedId);
    }

    async assignCareTeam(
        admissionId: Types.ObjectId | string,
        dto: AssignCareTeamDto,
        actorId: Types.ObjectId | string
    ): Promise<IAdmission | null> {
        const admission = await Admission.findById(new Types.ObjectId(admissionId.toString()));
        if (!admission) {
            throw { statusCode: 404, message: "Admission not found" };
        }
        if (admission.status === "DISCHARGED" || admission.status === "CANCELLED") {
            throw { statusCode: 400, message: `Cannot change care team of a ${admission.status} admission` };
        }

        const normalizeIds = (ids?: Array<Types.ObjectId | string>): Types.ObjectId[] => {
            if (!ids) return [];
            const seen = new Set<string>();
            const out: Types.ObjectId[] = [];
            for (const raw of ids) {
                if (!raw || !Types.ObjectId.isValid(raw.toString())) {
                    throw { statusCode: 400, message: "Invalid user ID in care team" };
                }
                const key = raw.toString();
                if (seen.has(key)) continue;
                seen.add(key);
                out.push(new Types.ObjectId(key));
            }
            return out;
        };

        const nurseIds = dto.nurseIds !== undefined ? normalizeIds(dto.nurseIds) : undefined;
        const doctorIds = dto.doctorIds !== undefined ? normalizeIds(dto.doctorIds) : undefined;

        // Validate users exist and are active. Nurses must hold a nurse-ish role,
        // doctors a doctor-ish role; admins may appear on either list for cover.
        const idsToCheck = [...(nurseIds ?? []), ...(doctorIds ?? [])];
        if (idsToCheck.length > 0) {
            const users = await User.find({ _id: { $in: idsToCheck } })
                .populate("role", "role")
                .lean();
            if (users.length !== idsToCheck.length) {
                throw { statusCode: 404, message: "One or more care-team users not found" };
            }
            for (const u of users) {
                const rec = u as Record<string, any>;
                if (rec.isActive === false) {
                    throw { statusCode: 400, message: `User ${rec.email ?? rec._id} is deactivated` };
                }
            }
            const byId = new Map(users.map((u: any) => [u._id.toString(), (u.role as any)?.role as string | undefined]));
            if (nurseIds) {
                for (const id of nurseIds) {
                    const role = (byId.get(id.toString()) ?? "").toUpperCase();
                    if (role && role !== "NURSE" && role !== "ADMIN") {
                        throw { statusCode: 400, message: "Only nurses (or admins) can be assigned as nurses" };
                    }
                }
            }
            if (doctorIds) {
                for (const id of doctorIds) {
                    const role = (byId.get(id.toString()) ?? "").toUpperCase();
                    if (role && role !== "DOCTOR" && role !== "ADMIN") {
                        throw { statusCode: 400, message: "Only doctors (or admins) can be assigned as doctors" };
                    }
                }
            }
        }

        const update: Record<string, unknown> = {
            careTeamUpdatedAt: new Date(),
            careTeamUpdatedBy: new Types.ObjectId(actorId.toString()),
        };
        if (nurseIds !== undefined) update.assignedNurses = nurseIds;
        if (doctorIds !== undefined) update.assignedDoctors = doctorIds;

        return await this.repository.update(new Types.ObjectId(admissionId.toString()), update);
    }

    async transferPatient(dto: TransferAdmissionDto): Promise<IAdmission | null> {
        const admissionId = new Types.ObjectId(dto.admissionId.toString());
        const admission = await this.repository.findById(admissionId);
        if (!admission) {
            throw { statusCode: 404, message: "Admission not found" };
        }

        if (admission.status === "DISCHARGED" || admission.status === "CANCELLED") {
            throw { statusCode: 400, message: `Cannot transfer a patient who is ${admission.status}` };
        }

        const oldBedId = admission.bedId?._id || admission.bedId;
        const newBedId = new Types.ObjectId(dto.newBedId.toString());

        // Ensure old bed is freed and new bed is occupied
        if (oldBedId && oldBedId.toString() !== newBedId.toString()) {
            await Bed.findByIdAndUpdate(oldBedId, { status: "AVAILABLE" });
        }
        await Bed.findByIdAndUpdate(newBedId, { status: "OCCUPIED" });

        const fromDoctorId = admission.doctorId?._id || admission.doctorId;
        const toDoctorId = dto.newDoctorId ? new Types.ObjectId(dto.newDoctorId.toString()) : fromDoctorId;

        const transferEntry = {
            fromBedId: oldBedId,
            toBedId: newBedId,
            fromDoctorId,
            toDoctorId,
            reason: dto.reason,
            transferDate: dto.transferDate ? new Date(dto.transferDate) : new Date(),
            notes: dto.notes || ""
        };

        const updateData: any = {
            bedId: newBedId,
            doctorId: toDoctorId,
            status: "TRANSFERRED",
            $push: { transferHistory: transferEntry }
        };

        return await this.repository.update(admissionId, updateData);
    }

    async dischargePatient(dto: DischargeAdmissionDto): Promise<IAdmission | null> {
        const admissionId = new Types.ObjectId(dto.admissionId.toString());
        const admission = await this.repository.findById(admissionId);
        if (!admission) {
            throw { statusCode: 404, message: "Admission not found" };
        }

        if (admission.status === "DISCHARGED") {
            throw { statusCode: 400, message: "Patient is already discharged" };
        }

        // Free the bed
        const bedId = admission.bedId?._id || admission.bedId;
        if (bedId) {
            await Bed.findByIdAndUpdate(bedId, { status: "AVAILABLE" });
        }

        const updatePayload: any = {
            status: "DISCHARGED",
            dischargeDate: dto.dischargeDate ? new Date(dto.dischargeDate) : new Date(),
            dischargeCondition: dto.dischargeCondition,
            finalDiagnosis: dto.finalDiagnosis,
            dischargeSummary: dto.dischargeSummary || "",
            dischargeMedications: dto.dischargeMedications || [],
            followUpDate: dto.followUpDate ? new Date(dto.followUpDate) : undefined,
            followUpInstructions: dto.followUpInstructions || "",
            dischargeAdvice: dto.dischargeAdvice || ""
        };

        if (dto.notes) {
            updatePayload.notes = admission.notes ? `${admission.notes}\n\n${dto.notes}` : dto.notes;
        }

        return await this.repository.update(admissionId, updatePayload);
    }

    async updateAdmission(id: Types.ObjectId, data: UpdateAdmissionDto): Promise<IAdmission | null> {
        const admission = await this.repository.findById(id);
        if (!admission) {
            throw { statusCode: 404, message: "Admission not found" };
        }

        // If status changed to DISCHARGED via regular update, free the bed
        if (data.status === "DISCHARGED" && admission.status !== "DISCHARGED") {
            const bedId = admission.bedId?._id || admission.bedId;
            if (bedId) {
                await Bed.findByIdAndUpdate(bedId, { status: "AVAILABLE" });
            }
        }

        return await this.repository.update(id, data);
    }

    async deleteAdmission(id: Types.ObjectId): Promise<IAdmission | null> {
        const admission = await this.repository.findById(id);
        if (!admission) {
            throw { statusCode: 404, message: "Admission not found" };
        }

        // Free the bed if admission was active
        if (admission.status !== "DISCHARGED" && admission.status !== "CANCELLED") {
            const bedId = admission.bedId?._id || admission.bedId;
            if (bedId) {
                await Bed.findByIdAndUpdate(bedId, { status: "AVAILABLE" });
            }
        }

        return await this.repository.delete(id);
    }

    async getAdmissionStats(): Promise<any> {
        const allAdmissions = await this.repository.findAll();
        const allBeds = await Bed.find().lean();

        const activeAdmissions = allAdmissions.filter((a) => a.status === "ADMITTED" || a.status === "TRANSFERRED");
        const dischargedAdmissions = allAdmissions.filter((a) => a.status === "DISCHARGED");

        const totalBeds = allBeds.length;
        const occupiedBeds = allBeds.filter((b) => b.status === "OCCUPIED").length;
        const availableBeds = allBeds.filter((b) => b.status === "AVAILABLE").length;
        const occupancyRate = totalBeds > 0 ? Math.round((occupiedBeds / totalBeds) * 100) : 0;

        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const admittedToday = allAdmissions.filter((a) => {
            const d = new Date(a.admissionDate);
            return d >= todayStart;
        }).length;

        const dischargedToday = allAdmissions.filter((a) => {
            if (!a.dischargeDate) return false;
            const d = new Date(a.dischargeDate);
            return d >= todayStart;
        }).length;

        let totalTransfers = 0;
        allAdmissions.forEach((a) => {
            if (a.transferHistory && Array.isArray(a.transferHistory)) {
                totalTransfers += a.transferHistory.length;
            }
        });

        // Admission types distribution
        const typeCounts: Record<string, number> = {
            ELECTIVE: 0,
            EMERGENCY: 0,
            TRANSFER: 0,
            DAYCARE: 0
        };
        allAdmissions.forEach((a) => {
            const type = a.admissionType || "ELECTIVE";
            typeCounts[type] = (typeCounts[type] || 0) + 1;
        });

        // Average length of stay (ALOS) in days for discharged patients
        let totalStayMs = 0;
        let stayCount = 0;
        dischargedAdmissions.forEach((a) => {
            if (a.admissionDate && a.dischargeDate) {
                const diff = new Date(a.dischargeDate).getTime() - new Date(a.admissionDate).getTime();
                if (diff > 0) {
                    totalStayMs += diff;
                    stayCount++;
                }
            }
        });
        const avgStayDays = stayCount > 0 ? Number((totalStayMs / (stayCount * 1000 * 60 * 60 * 24)).toFixed(1)) : 0;

        return {
            totalAdmissions: allAdmissions.length,
            activeCount: activeAdmissions.length,
            dischargedCount: dischargedAdmissions.length,
            admittedToday,
            dischargedToday,
            totalTransfers,
            totalBeds,
            occupiedBeds,
            availableBeds,
            occupancyRate,
            avgStayDays,
            typeCounts
        };
    }
}

export default new AdmissionService();
