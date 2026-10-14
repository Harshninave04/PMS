import mongoose, { ClientSession, Types } from "mongoose";
import Admission from "@/models/admission.model";
import AdmissionSequence from "@/models/admission-sequence.model";
import Bed from "@/models/bed.model";
import Patient from "@/models/patient.model";
import User from "@/models/user.model";
import { CreateAdmissionDto } from "@/dto/admission.dto";
import { AdmissionError } from "@/services/admission-errors";

export interface AdmissionPersistence {
    withTransaction<T>(operation: (session: ClientSession) => Promise<T>): Promise<T>;
    patientExists(id: Types.ObjectId, session: ClientSession): Promise<boolean>;
    doctorExists(id: Types.ObjectId, session: ClientSession): Promise<boolean>;
    activeAdmissionExists(patientId: Types.ObjectId, session: ClientSession): Promise<boolean>;
    findBed(id: Types.ObjectId, session: ClientSession): Promise<{ status: string } | null>;
    occupyAvailableBed(id: Types.ObjectId, session: ClientSession): Promise<boolean>;
    nextIpdNumber(year: number, session: ClientSession): Promise<string>;
    createAdmission(data: CreateAdmissionDto, session: ClientSession): Promise<unknown>;
}

export const admissionPersistence: AdmissionPersistence = {
    async withTransaction<T>(operation: (session: ClientSession) => Promise<T>): Promise<T> {
        const session = await mongoose.startSession();
        try {
            let result!: T;
            await session.withTransaction(async () => {
                result = await operation(session);
            });
            return result;
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Admission transaction failed";
            if (/transaction numbers are only allowed|replica set|does not support transactions/i.test(message)) {
                throw new AdmissionError("Admission creation requires a MongoDB replica set or sharded cluster", 503);
            }
            throw error;
        } finally {
            await session.endSession();
        }
    },
    async patientExists(id, session) {
        return Boolean(await Patient.exists({ _id: id }).session(session));
    },
    async doctorExists(id, session) {
        return Boolean(await User.exists({ _id: id }).session(session));
    },
    async activeAdmissionExists(patientId, session) {
        return Boolean(await Admission.exists({
            patientId,
            status: { $in: ["ADMITTED", "TRANSFERRED"] }
        }).session(session));
    },
    async findBed(id, session) {
        return Bed.findById(id).select("status").session(session).lean<{ status: string }>();
    },
    async occupyAvailableBed(id, session) {
        const result = await Bed.updateOne(
            { _id: id, status: "AVAILABLE" },
            { $set: { status: "OCCUPIED" } },
            { session }
        );
        return result.modifiedCount === 1;
    },
    async nextIpdNumber(year, session) {
        const counter = await AdmissionSequence.findOneAndUpdate(
            { year },
            { $inc: { sequence: 1 }, $setOnInsert: { year } },
            { upsert: true, new: true, session, setDefaultsOnInsert: false }
        ).lean<{ year: number; sequence: number }>();
        if (!counter) throw new Error("Could not allocate an IPD number");
        return `IPD-${year}-${String(counter.sequence).padStart(4, "0")}`;
    },
    async createAdmission(data, session) {
        const [admission] = await Admission.create([data], { session });
        return admission;
    }
};
