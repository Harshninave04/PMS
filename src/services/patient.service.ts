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


export class PatientService {
    constructor(private repository: PatientRepository = patientRepository) { }

    async createPatient(data: CreatePatientDto): Promise<IPatient> {
        if (data.uhid && (await this.repository.uhidExists(data.uhid))) {
            throw {
                statusCode: 409,
                message:
                    "That hospital ID is already assigned. An archived patient keeps their ID, so it cannot be reused."
            };
        }

        return await this.repository.create(data);
    }

    async getAllPatients(): Promise<IPatient[]> {
        return await this.repository.findAll({ isMerged: { $ne: true } });
    }

    async searchPatients(params: {
        query?: string;
        branchId?: string;
        status?: string;
        bloodGroup?: string;
    }): Promise<IPatient[]> {
        return await this.repository.search(params);
    }

    async getPatientById(id: Types.ObjectId, includeDeleted = false): Promise<IPatient | null> {
        return await this.repository.findById(id, includeDeleted);
    }

    /**
     * Reads a patient subject to the caller's boundary. Returns null when the
     * patient does not exist *or* lies outside the scope, so callers cannot use
     * the difference to probe for records they may not see.
     */
    async getPatientByIdScoped(
        id: Types.ObjectId,
        scopeFilter: Record<string, unknown> = {}
    ): Promise<IPatient | null> {
        return await this.repository.findByIdScoped(id, scopeFilter);
    }

    async getDeletedPatients(filter: Record<string, unknown> = {}): Promise<IPatient[]> {
        return await this.repository.findDeleted(filter);
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

        // Includes archived records: reassigning a UHID that a deleted chart
        // still owns would leave that chart unrestorable.
        if (data.uhid && data.uhid !== patient.uhid && (await this.repository.uhidExists(data.uhid, id))) {
            throw { statusCode: 409, message: "That hospital ID is already assigned" };
        }

        return await this.repository.update(id, data);
    }

    /**
     * Soft-deletes a patient. The record is retained for billing, statutory
     * retention and audit; use restorePatient to bring it back.
     */
    async deletePatient(
        id: Types.ObjectId,
        deletedBy: Types.ObjectId,
        reason?: string,
        scopeFilter: Record<string, unknown> = {}
    ): Promise<IPatient | null> {
        const patient = await this.repository.findById(id);
        if (!patient) {
            throw { statusCode: 404, message: "Patient not found" };
        }
        return await this.repository.softDelete(id, deletedBy, reason, scopeFilter);
    }

    async restorePatient(id: Types.ObjectId, scopeFilter: Record<string, unknown> = {}): Promise<IPatient | null> {
        const restored = await this.repository.restore(id, scopeFilter);
        if (!restored) {
            throw { statusCode: 404, message: "Patient not found or not deleted" };
        }
        return restored;
    }

    async addDocument(patientId: Types.ObjectId, document: AddPatientDocumentDto, scopeFilter: Record<string, unknown> = {}): Promise<IPatient | null> {
        const patient = await this.repository.findById(patientId);
        if (!patient) {
            throw { statusCode: 404, message: "Patient not found" };
        }
        return await this.repository.addDocument(patientId, document, scopeFilter);
    }

    async deleteDocument(
        patientId: Types.ObjectId,
        documentId: string,
        scopeFilter: Record<string, unknown> = {}
    ): Promise<IPatient | null> {
        // Scoped read: without the boundary a branch user could delete documents
        // from any other branch's chart.
        const patient = await this.repository.findByIdScoped(patientId, scopeFilter);
        if (!patient) {
            throw { statusCode: 404, message: "Patient not found" };
        }
        return await this.repository.deleteDocument(patientId, documentId, scopeFilter);
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

    async getStats(branchId?: string) {
        return await this.repository.getStats(branchId);
    }
}

export default new PatientService();

