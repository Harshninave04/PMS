import patientRepository, { PatientRepository } from "@/repositories/patient.repository";
import { Types } from "mongoose";
import { IPatient } from "@/interfaces/patient.interface";
import { CreatePatientDto, UpdatePatientDto, AddPatientDocumentDto } from "@/dto/patient.dto";
import Appointment from "@/models/appointment.model";
import Admission from "@/models/admission.model";
import { ClinicalRecord } from "@/models/clinical-record.model";
import { Diagnosis } from "@/models/diagnosis.model";
import Prescription from "@/models/prescription.model";
import { Vitals } from "@/models/vitals.model";
import Invoice from "@/models/invoice.model";
import Patient from "@/models/patient.model";
import {
    isPlaceholderPatientName,
    normalizePatientName,
    normalizePatientPhone,
    patientNamePattern,
    patientPhonePattern,
} from "@/lib/patient-identity";

export interface PatientMatchSummary {
    _id: Types.ObjectId;
    name: string;
    uhid?: string;
    age?: number;
    gender?: string;
    contact?: string;
}

export class PatientDuplicateError extends Error {
    readonly statusCode = 409;
    readonly matchingPatients: PatientMatchSummary[];

    constructor(matchingPatients: PatientMatchSummary[]) {
        super("Patient already exists");
        this.name = "PatientDuplicateError";
        this.matchingPatients = matchingPatients;
    }
}


export class PatientService {
    constructor(private repository: PatientRepository = patientRepository) { }

    async findDuplicatePatients(
        data: { name?: unknown; contact?: unknown },
        excludeId?: Types.ObjectId | string,
    ): Promise<PatientMatchSummary[]> {
        const normalizedName = normalizePatientName(data.name);
        const normalizedPhone = normalizePatientPhone(data.contact);
        const checks: Record<string, unknown>[] = [];

        if (!isPlaceholderPatientName(data.name)) {
            checks.push(
                { normalizedName },
                { normalizedName: { $exists: false }, name: patientNamePattern(normalizedName) },
            );
        }
        if (normalizedPhone) {
            checks.push(
                { normalizedContact: normalizedPhone },
                { normalizedContact: { $exists: false }, contact: patientPhonePattern(normalizedPhone) },
            );
        }
        if (checks.length === 0) return [];

        const filter: Record<string, unknown> = { $or: checks };
        if (excludeId) filter._id = { $ne: new Types.ObjectId(excludeId.toString()) };

        return await Patient.find(filter)
            .select("name uhid age gender contact")
            .sort({ createdAt: -1 })
            .limit(20)
            .lean() as PatientMatchSummary[];
    }

    async createPatient(data: CreatePatientDto): Promise<IPatient> {
        const matches = await this.findDuplicatePatients(data);
        if (matches.length) throw new PatientDuplicateError(matches);
        try {
            return await this.repository.create(data);
        } catch (error) {
            const duplicate = error as { code?: number; keyPattern?: Record<string, unknown> };
            if (duplicate?.code === 11000 && (duplicate.keyPattern?.normalizedName || duplicate.keyPattern?.normalizedContact)) {
                const concurrentMatches = await this.findDuplicatePatients(data);
                if (concurrentMatches.length) throw new PatientDuplicateError(concurrentMatches);
            }
            throw error;
        }
    }

    async getAllPatients(): Promise<IPatient[]> {
        return await this.repository.findAll({ isMerged: { $ne: true } });
    }

    async searchPatients(params: {
        query?: string;
        branchId?: string;
        status?: string;
        bloodGroup?: string;
        patientIds?: Types.ObjectId[];
    }): Promise<IPatient[]> {
        return await this.repository.search(params);
    }

    async getPatientById(id: Types.ObjectId): Promise<IPatient | null> {
        return await this.repository.findById(id);
    }

    async getPatientByUhid(uhid: string): Promise<IPatient | null> {
        return await this.repository.findByUhid(uhid);
    }

    async getPatientsByBranchId(branchId: Types.ObjectId): Promise<IPatient[]> {
        return await this.repository.findByBranchId(branchId);
    }

    async updatePatient(id: Types.ObjectId, data: UpdatePatientDto): Promise<IPatient | null> {
        const patient = await this.repository.findById(id);
        if (!patient) {
            throw { statusCode: 404, message: "Patient not found" };
        }
        const nextName = data.name ?? patient.name;
        const nextContact = data.contact ?? patient.contact;
        const matches = await this.findDuplicatePatients({ name: nextName, contact: nextContact }, id);
        if (matches.length) throw new PatientDuplicateError(matches);
        try {
            return await this.repository.update(id, {
                ...data,
                normalizedName: isPlaceholderPatientName(nextName) ? undefined : normalizePatientName(nextName) || undefined,
                normalizedContact: normalizePatientPhone(nextContact) || undefined,
            } as UpdatePatientDto);
        } catch (error) {
            const duplicate = error as { code?: number; keyPattern?: Record<string, unknown> };
            if (duplicate?.code === 11000 && (duplicate.keyPattern?.normalizedName || duplicate.keyPattern?.normalizedContact)) {
                const concurrentMatches = await this.findDuplicatePatients({ name: nextName, contact: nextContact }, id);
                if (concurrentMatches.length) throw new PatientDuplicateError(concurrentMatches);
            }
            throw error;
        }
    }

    async deletePatient(id: Types.ObjectId): Promise<IPatient | null> {
        const patient = await this.repository.findById(id);
        if (!patient) {
            throw { statusCode: 404, message: "Patient not found" };
        }
        return await this.repository.delete(id);
    }

    async addDocument(patientId: Types.ObjectId, document: AddPatientDocumentDto): Promise<IPatient | null> {
        const patient = await this.repository.findById(patientId);
        if (!patient) {
            throw { statusCode: 404, message: "Patient not found" };
        }
        return await this.repository.addDocument(patientId, document);
    }

    async deleteDocument(patientId: Types.ObjectId, documentId: string): Promise<IPatient | null> {
        const patient = await this.repository.findById(patientId);
        if (!patient) {
            throw { statusCode: 404, message: "Patient not found" };
        }
        return await this.repository.deleteDocument(patientId, documentId);
    }

    async getPatientHistory(patientId: Types.ObjectId) {
        const patient = await this.repository.findById(patientId);
        if (!patient) {
            throw { statusCode: 404, message: "Patient not found" };
        }

        const [
            appointments,
            admissions,
            clinicalRecords,
            diagnoses,
            prescriptions,
            vitalsList,
            invoices
        ] = await Promise.all([
            Appointment.find({ patientId }).populate("doctorId", "name specialization").sort({ appointmentDate: -1 }).lean().catch(() => []),
            Admission.find({ patientId }).populate("wardId", "name").populate("bedId", "bedNumber").sort({ admissionDate: -1 }).lean().catch(() => []),
            ClinicalRecord.find({ patientId }).populate("doctorId", "name").sort({ createdAt: -1 }).lean().catch(() => []),
            Diagnosis.find({ patientId }).populate("doctorId", "name").sort({ createdAt: -1 }).lean().catch(() => []),
            Prescription.find({ patientId }).populate("doctorId", "name").sort({ createdAt: -1 }).lean().catch(() => []),
            Vitals.find({ patientId }).sort({ recordedAt: -1, createdAt: -1 }).lean().catch(() => []),
            Invoice.find({ patientId }).sort({ createdAt: -1 }).lean().catch(() => [])
        ]);

        return {
            patient,
            appointments,
            admissions,
            clinicalRecords,
            diagnoses,
            prescriptions,
            vitalsList,
            invoices
        };
    }

    async getStats(branchId?: string, patientIds?: Types.ObjectId[]) {
        return await this.repository.getStats(branchId, patientIds);
    }
}

export default new PatientService();

