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
        return await this.repository.update(id, data);
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

    async getStats(branchId?: string) {
        return await this.repository.getStats(branchId);
    }
}

export default new PatientService();

