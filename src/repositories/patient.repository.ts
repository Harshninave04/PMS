import { Types } from "mongoose";
import Patient from "@/models/patient.model";
import { IPatient } from "@/interfaces/patient.interface";
import { CreatePatientDto, UpdatePatientDto, AddPatientDocumentDto } from "@/dto/patient.dto";

export class PatientRepository {
    async create(data: CreatePatientDto): Promise<IPatient> {
        return await new Patient(data).save();
    }

    async findAll(filter: any = {}): Promise<IPatient[]> {
        // Soft-deleted patients stay in the database for retention and audit but
        // are excluded from day-to-day listings.
        return await Patient.find({ isDeleted: { $ne: true }, ...filter })
            .populate("branchId")
            .sort({ createdAt: -1 })
            .lean();
    }

    async findById(id: Types.ObjectId, includeDeleted = false): Promise<IPatient | null> {
        return await Patient.findOne({ _id: id, ...(includeDeleted ? {} : { isDeleted: { $ne: true } }) })
            .populate("branchId")
            .populate("mergedWith", "name uhid contact")
            .lean();
    }

    /**
     * Reads a patient only if it falls inside the caller's boundary.
     * Used to reject out-of-scope work before it has side effects, rather than
     * after - checking scope once the file is already stored leaves an orphan.
     */
    async findByIdScoped(
        id: Types.ObjectId,
        scopeFilter: Record<string, unknown> = {}
    ): Promise<IPatient | null> {
        return await Patient.findOne({ _id: id, isDeleted: { $ne: true }, ...scopeFilter })
            .populate("branchId")
            .lean();
    }

    async findDeleted(filter: any = {}): Promise<IPatient[]> {
        return await Patient.find({ isDeleted: true, ...filter })
            .populate("branchId")
            .sort({ deletedAt: -1 })
            .lean();
    }

    async findByUhid(uhid: string): Promise<IPatient | null> {
        return await Patient.findOne({ uhid, isDeleted: { $ne: true } })
            .populate("branchId")
            .lean();
    }

    /**
     * Checks a UHID against every patient, archived ones included.
     * `uhid` carries a unique index, so an archived record keeps holding its
     * identifier: registering a replacement under the same UHID would collide
     * and make the archived chart impossible to restore.
     */
    async uhidExists(uhid: string, excludeId?: Types.ObjectId): Promise<boolean> {
        const filter: Record<string, unknown> = { uhid };
        if (excludeId) filter._id = { $ne: excludeId };
        return (await Patient.exists(filter)) !== null;
    }

    async findByBranchId(branchId: Types.ObjectId): Promise<IPatient[]> {
        return await Patient.find({
            branchId,
            isDeleted: { $ne: true },
            isMerged: { $ne: true }
        })
            .populate("branchId")
            .sort({ createdAt: -1 })
            .lean();
    }

    async search(params: {
        query?: string;
        branchId?: string;
        status?: string;
        bloodGroup?: string;
    }): Promise<IPatient[]> {
        const filter: any = { isDeleted: { $ne: true } };

        if (params.query && params.query.trim()) {
            const regex = new RegExp(params.query.trim(), "i");
            filter.$or = [
                { name: regex },
                { contact: regex },
                { uhid: regex },
                { email: regex },
                { identificationNumber: regex }
            ];
        }

        if (params.branchId && Types.ObjectId.isValid(params.branchId)) {
            filter.branchId = new Types.ObjectId(params.branchId);
        }

        if (params.status === "active") {
            filter.isActive = true;
            filter.isMerged = { $ne: true };
        } else if (params.status === "inactive") {
            filter.isActive = false;
            filter.isMerged = { $ne: true };
        } else if (params.status === "merged") {
            filter.isMerged = true;
        }

        if (params.bloodGroup && params.bloodGroup !== "ALL") {
            filter.bloodGroup = params.bloodGroup;
        }

        return await Patient.find(filter)
            .populate("branchId")
            .sort({ createdAt: -1 })
            .lean();
    }

    async update(id: Types.ObjectId, data: UpdatePatientDto): Promise<IPatient | null> {
        return await Patient.findByIdAndUpdate(id, data, { new: true, runValidators: true })
            .populate("branchId")
            .lean();
    }

    /**
     * Soft delete. A patient record is a legal document, so the row is
     * retained and flagged rather than removed.
     */
    async softDelete(
        id: Types.ObjectId,
        deletedBy: Types.ObjectId,
        reason?: string,
        scopeFilter: Record<string, unknown> = {}
    ): Promise<IPatient | null> {
        return await Patient.findOneAndUpdate(
            { _id: id, isDeleted: { $ne: true }, ...scopeFilter },
            {
                $set: {
                    isDeleted: true,
                    isActive: false,
                    deletedAt: new Date(),
                    deletedBy,
                    deleteReason: reason ?? null,
                },
            },
            { new: true, runValidators: true }
        )
            .populate("branchId")
            .lean();
    }

    /** Reverses a soft delete. */
    async restore(id: Types.ObjectId, scopeFilter: Record<string, unknown> = {}): Promise<IPatient | null> {
        return await Patient.findOneAndUpdate(
            { _id: id, isDeleted: true, ...scopeFilter },
            {
                $set: {
                    isDeleted: false,
                    isActive: true,
                    deletedAt: null,
                    deletedBy: null,
                    deleteReason: null,
                },
            },
            { new: true, runValidators: true }
        )
            .populate("branchId")
            .lean();
    }

async addDocument(id: Types.ObjectId, document: AddPatientDocumentDto, scopeFilter: Record<string, unknown> = {}): Promise<IPatient | null> {
        return await Patient.findOneAndUpdate(
            { _id: id, isDeleted: { $ne: true }, ...scopeFilter },
            {
                $push: {
                    documents: {
                        ...document,
                        uploadedAt: new Date()
                    }
                }
            },
            { new: true }
        )
        .populate("branchId")
        .lean();
    }

    async deleteDocument(
        id: Types.ObjectId,
        documentId: string,
        scopeFilter: Record<string, unknown> = {}
    ): Promise<IPatient | null> {
        if (!Types.ObjectId.isValid(documentId)) return null;

        return await Patient.findOneAndUpdate(
            { _id: id, isDeleted: { $ne: true }, ...scopeFilter },
            {
                $pull: {
                    documents: { _id: new Types.ObjectId(documentId) }
                }
            },
            { new: true }
        )
            .populate("branchId")
            .lean();
    }

    async mergePatients(
        primaryId: Types.ObjectId,
        secondaryId: Types.ObjectId,
        reason: string
    ): Promise<{ primary: IPatient | null; secondary: IPatient | null }> {
        const secondary = await Patient.findById(secondaryId);
        if (!secondary) throw new Error("Secondary patient not found");

        const primary = await Patient.findById(primaryId);
        if (!primary) throw new Error("Primary patient not found");

        // Merge documents and history into primary
        const combinedDocs = [...(primary.documents || []), ...(secondary.documents || [])];
        const combinedHistory = Array.from(
            new Set([...(primary.medicalHistory || []), ...(secondary.medicalHistory || [])])
        );
        const combinedAllergies = Array.from(
            new Set([...(primary.allergies || []), ...(secondary.allergies || [])])
        );

        await Patient.findByIdAndUpdate(primaryId, {
            documents: combinedDocs,
            medicalHistory: combinedHistory,
            allergies: combinedAllergies
        }, { runValidators: true });

        // Mark secondary as merged and deactivate
        await Patient.findByIdAndUpdate(secondaryId, {
            isMerged: true,
            mergedWith: primaryId,
            mergeReason: reason,
            isActive: false
        }, { runValidators: true });

        const updatedPrimary = await this.findById(primaryId);
        const updatedSecondary = await this.findById(secondaryId);

        return { primary: updatedPrimary, secondary: updatedSecondary };
    }

    async getStats(branchId?: string) {
        const match: any = {};
        if (branchId && Types.ObjectId.isValid(branchId)) {
            match.branchId = new Types.ObjectId(branchId);
        }

        const totalPatients = await Patient.countDocuments({ ...match, isMerged: { $ne: true } });
        const activePatients = await Patient.countDocuments({ ...match, isActive: true, isMerged: { $ne: true } });
        const mergedPatients = await Patient.countDocuments({ ...match, isMerged: true });

        // Gender breakdown
        const genderStats = await Patient.aggregate([
            { $match: { ...match, isMerged: { $ne: true } } },
            { $group: { _id: "$gender", count: { $sum: 1 } } }
        ]);

        // Blood group breakdown
        const bloodStats = await Patient.aggregate([
            { $match: { ...match, isMerged: { $ne: true } } },
            { $group: { _id: "$bloodGroup", count: { $sum: 1 } } }
        ]);

        // Age group breakdown
        const ageStats = await Patient.aggregate([
            { $match: { ...match, isMerged: { $ne: true } } },
            {
                $bucket: {
                    groupBy: "$age",
                    boundaries: [0, 18, 35, 50, 65, 120],
                    default: "Other",
                    output: { count: { $sum: 1 } }
                }
            }
        ]);

        return {
            totalPatients,
            activePatients,
            mergedPatients,
            genderStats,
            bloodStats,
            ageStats
        };
    }
}

export default new PatientRepository();

