import admissionRepository, { AdmissionRepository } from "@/repositories/admission.repository";
import { ClientSession, Types } from "mongoose";
import { IAdmission } from "@/interfaces/admission.interface";
import { CreateAdmissionDto, UpdateAdmissionDto, TransferAdmissionDto, DischargeAdmissionDto } from "@/dto/admission.dto";
import Bed from "@/models/bed.model";
import { AdmissionError } from "@/services/admission-errors";
import { AdmissionPersistence, admissionPersistence } from "@/services/admission.persistence";

const ADMISSION_SOURCES = ["OPD", "EMERGENCY", "REFERRAL", "DIRECT"];
const PAYMENT_TYPES = ["CASH", "INSURANCE", "CORPORATE"];
const WARD_TYPES = ["GENERAL", "SEMI_PRIVATE", "PRIVATE", "ICU", "EMERGENCY"];
const ADMISSION_TYPES = ["EMERGENCY", "ELECTIVE", "TRANSFER", "DAYCARE"];

export class AdmissionService {
    constructor(
        private repository: AdmissionRepository = admissionRepository,
        private persistence: AdmissionPersistence = admissionPersistence
    ) { }

    async createAdmission(data: CreateAdmissionDto, admittedBy: Types.ObjectId | string): Promise<IAdmission> {
        if (!data || typeof data !== "object" || Array.isArray(data)) {
            throw new AdmissionError("Admission request body must be a JSON object", 400);
        }
        if (!data.patientId || !data.doctorId || !data.bedId || !data.admissionDate) {
            throw new AdmissionError("Patient, doctor, bed, and admission date are required", 400);
        }

        const patientId = this.toObjectId(data.patientId, "patient");
        const doctorId = this.toObjectId(data.doctorId, "doctor");
        const bedId = this.toObjectId(data.bedId, "bed");
        const admittedById = this.toObjectId(admittedBy, "admitting user");
        const admissionDate = new Date(data.admissionDate);
        if (Number.isNaN(admissionDate.getTime())) {
            throw new AdmissionError("Admission date is invalid", 400);
        }

        if (data.admissionType && !ADMISSION_TYPES.includes(data.admissionType)) {
            throw new AdmissionError("Admission type is invalid", 400);
        }
        if (data.admissionSource && !ADMISSION_SOURCES.includes(data.admissionSource)) {
            throw new AdmissionError("Admission source must be OPD, EMERGENCY, REFERRAL, or DIRECT", 400);
        }
        if (data.paymentType && !PAYMENT_TYPES.includes(data.paymentType)) {
            throw new AdmissionError("Payment type must be CASH, INSURANCE, or CORPORATE", 400);
        }
        if (data.wardType && !WARD_TYPES.includes(data.wardType)) {
            throw new AdmissionError("Ward type is invalid", 400);
        }
        if (data.advanceDeposit !== undefined && (!Number.isFinite(data.advanceDeposit) || data.advanceDeposit < 0)) {
            throw new AdmissionError("Advance deposit must be a non-negative number", 400);
        }
        if ((data.consentSigned !== undefined && typeof data.consentSigned !== "boolean") ||
            (data.consentPending !== undefined && typeof data.consentPending !== "boolean")) {
            throw new AdmissionError("Consent fields must be boolean values", 400);
        }

        return this.persistence.withTransaction(async (session: ClientSession) => {
            const patientExists = await this.persistence.patientExists(patientId, session);
            const doctorExists = await this.persistence.doctorExists(doctorId, session);
            if (!patientExists) throw new AdmissionError("Patient was not found", 404);
            if (!doctorExists) throw new AdmissionError("Doctor was not found", 404);
            if (await this.persistence.activeAdmissionExists(patientId, session)) {
                throw new AdmissionError("Patient already has an active admission", 409);
            }

            const bed = await this.persistence.findBed(bedId, session);
            if (!bed) throw new AdmissionError("Bed was not found", 404);
            if (bed.status !== "AVAILABLE") throw new AdmissionError("Bed is not available", 409);

            const ipdNumber = await this.persistence.nextIpdNumber(admissionDate.getFullYear(), session);
            const occupied = await this.persistence.occupyAvailableBed(bedId, session);
            if (!occupied) throw new AdmissionError("Bed is no longer available", 409);

            const payload: CreateAdmissionDto = {
                ...data,
                patientId,
                doctorId,
                bedId,
                admissionDate,
                ipdNumber,
                admittedBy: admittedById,
                status: "ADMITTED"
            };
            const created = await this.persistence.createAdmission(payload, session) as { _id?: Types.ObjectId };
            if (!created?._id) throw new Error("Admission was not created");
            return await this.repository.findById(created._id, session) as IAdmission;
        });
    }

    private toObjectId(value: Types.ObjectId | string, label: string): Types.ObjectId {
        if (!Types.ObjectId.isValid(value.toString())) {
            throw new AdmissionError(`Invalid ${label} ID`, 400);
        }
        return new Types.ObjectId(value.toString());
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
