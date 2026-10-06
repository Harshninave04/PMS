import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import dbConnect from "@/lib/dbConnect";
import defaultAdmissionService, { AdmissionService } from "@/services/admission.service";
import { CreateAdmissionDto, UpdateAdmissionDto, TransferAdmissionDto, DischargeAdmissionDto } from "@/dto/admission.dto";
import { authorizeRequest } from "@/lib/rbac/guard";
import { PERMISSION_KEYS } from "@/types/rbac";
import { checkRecordBoundary } from "@/lib/rbac/scope-guard";
import { recordAudit, diffRecords } from "@/services/audit.service";

interface PopulatedEntity {
    _id?: Types.ObjectId;
    [key: string]: unknown;
}

export class AdmissionController {
    constructor(private admissionService: AdmissionService = defaultAdmissionService) { }

    async createAdmission(request: NextRequest): Promise<NextResponse> {
        try {
            await dbConnect();
            const auth = await authorizeRequest(request, PERMISSION_KEYS.ADMISSION_CREATE, "Admission");
            if (!auth.isAuthorized) return auth.response;

            const data: CreateAdmissionDto = await request.json();

            // Enforce branch multi-tenancy
            if (auth.context.branchId && auth.grant.orgScope !== "GLOBAL") {
                data.branchId = auth.context.branchId.toString();
            }

            // Enforce doctor relational constraint: doctor with OWN scope can only admit for themselves
            if (auth.grant.relScope === "OWN") {
                data.doctorId = auth.context.userId.toString();
            }

            if (!data.patientId || !data.doctorId || !data.bedId || !data.admissionDate) {
                return NextResponse.json(
                    { success: false, message: "Patient, Doctor, Bed, and Admission Date are required" },
                    { status: 400 }
                );
            }

            if (!Types.ObjectId.isValid(data.patientId.toString()) || 
                !Types.ObjectId.isValid(data.doctorId.toString()) || 
                !Types.ObjectId.isValid(data.bedId.toString())) {
                return NextResponse.json(
                    { success: false, message: "Invalid ID format for patient, doctor, or bed" },
                    { status: 400 }
                );
            }

            if (data.branchId && !Types.ObjectId.isValid(data.branchId.toString())) {
                return NextResponse.json(
                    { success: false, message: "Invalid ID format for branch" },
                    { status: 400 }
                );
            }

            const admission = await this.admissionService.createAdmission(data);

            await recordAudit(auth.context, {
                action: "CREATE",
                entity: "admission",
                entityId: admission?._id?.toString(),
                summary: `Patient ${data.patientId ?? "unknown"} admitted`,
                metadata: { bedId: data.bedId ?? null, admissionType: data.admissionType ?? null },
            });

            return NextResponse.json(
                { success: true, message: "Admission created successfully", data: admission },
                { status: 201 }
            );
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Failed to create admission";
            return NextResponse.json(
                { success: false, message },
                { status: 500 }
            );
        }
    }

    async getAdmissions(request: NextRequest): Promise<NextResponse> {
        try {
            await dbConnect();
            const auth = await authorizeRequest(request, PERMISSION_KEYS.ADMISSION_VIEW, "Admission");
            if (!auth.isAuthorized) return auth.response;

            const { searchParams } = new URL(request.url);
            const requestedBranchId = searchParams.get('branchId');
            const patientId = searchParams.get('patientId');
            const requestedDoctorId = searchParams.get('doctorId');
            const bedId = searchParams.get('bedId');
            const status = searchParams.get('status');
            const type = searchParams.get('type');

            const filter: Record<string, unknown> = {};

            if (status) {
                if (status === "ACTIVE") {
                    filter.status = { $in: ["ADMITTED", "TRANSFERRED"] };
                } else if (status !== "ALL") {
                    filter.status = status;
                }
            }

            if (type && type !== "ALL") {
                filter.admissionType = type;
            }

            // Enforce relational scope: doctor with OWN scope can only see their own admissions
            let effectiveDoctorId = requestedDoctorId;
            if (auth.grant.relScope === "OWN") {
                effectiveDoctorId = auth.context.userId.toString();
            }

            // Enforce organizational scope: branch user can only see admissions in their branch
            let effectiveBranchId = requestedBranchId;
            if (auth.context.branchId && auth.grant.orgScope === "BRANCH") {
                effectiveBranchId = auth.context.branchId.toString();
            }

            if (effectiveBranchId) {
                if (!Types.ObjectId.isValid(effectiveBranchId)) return NextResponse.json({ success: false, message: "Invalid branch ID" }, { status: 400 });
                filter.branchId = new Types.ObjectId(effectiveBranchId);
            }

            if (patientId) {
                if (!Types.ObjectId.isValid(patientId)) return NextResponse.json({ success: false, message: "Invalid patient ID" }, { status: 400 });
                filter.patientId = new Types.ObjectId(patientId);
            }

            if (effectiveDoctorId) {
                if (!Types.ObjectId.isValid(effectiveDoctorId)) return NextResponse.json({ success: false, message: "Invalid doctor ID" }, { status: 400 });
                filter.doctorId = new Types.ObjectId(effectiveDoctorId);
            }

            if (bedId) {
                if (!Types.ObjectId.isValid(bedId)) return NextResponse.json({ success: false, message: "Invalid bed ID" }, { status: 400 });
                filter.bedId = new Types.ObjectId(bedId);
            }

            const admissions = await this.admissionService.getAllAdmissions(filter);

            return NextResponse.json(
                { success: true, count: admissions.length, data: admissions },
                { status: 200 }
            );
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Failed to fetch admissions";
            return NextResponse.json(
                { success: false, message },
                { status: 500 }
            );
        }
    }

    async getAdmissionById(id: string, request: NextRequest): Promise<NextResponse> {
        try {
            await dbConnect();
            const authResult = await authorizeRequest(request, PERMISSION_KEYS.ADMISSION_VIEW, "Admission");
            if (!authResult.isAuthorized) return authResult.response;

            if (!Types.ObjectId.isValid(id)) {
                return NextResponse.json(
                    { success: false, message: "Invalid admission ID" },
                    { status: 400 }
                );
            }

            const admission = await this.admissionService.getAdmissionById(new Types.ObjectId(id));
            if (!admission) {
                return NextResponse.json(
                    { success: false, message: "Admission not found" },
                    { status: 404 }
                );
            }

            // Relational check
            if (authResult?.grant.relScope === "OWN") {
                const docId = (admission.doctorId as PopulatedEntity)?._id?.toString() || admission.doctorId?.toString();
                if (docId !== authResult.context.userId.toString()) {
                    return NextResponse.json(
                        { success: false, message: "Forbidden: You can only view your own admissions" },
                        { status: 403 }
                    );
                }
            }

            // Organizational check
            const boundary = checkRecordBoundary(admission, authResult.context, authResult.grant);
            if (!boundary.allowed) {
                return NextResponse.json(
                    { success: false, message: boundary.message },
                    { status: boundary.statusCode }
                );
            }

            return NextResponse.json(
                { success: true, data: admission },
                { status: 200 }
            );
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Failed to fetch admission";
            return NextResponse.json(
                { success: false, message },
                { status: 500 }
            );
        }
    }

    async transferPatient(request: NextRequest): Promise<NextResponse> {
        try {
            await dbConnect();
            const auth = await authorizeRequest(request, PERMISSION_KEYS.ADMISSION_TRANSFER, "Admission");
            if (!auth.isAuthorized) return auth.response;

            const data: TransferAdmissionDto = await request.json();

            if (!data.admissionId || !data.newBedId || !data.reason) {
                return NextResponse.json(
                    { success: false, message: "Admission ID, Target Bed ID, and Reason are required" },
                    { status: 400 }
                );
            }

            if (!Types.ObjectId.isValid(data.admissionId.toString()) || !Types.ObjectId.isValid(data.newBedId.toString())) {
                return NextResponse.json(
                    { success: false, message: "Invalid ID format for admission or destination bed" },
                    { status: 400 }
                );
            }

            const existing = await this.admissionService.getAdmissionById(new Types.ObjectId(data.admissionId));
            if (!existing) {
                return NextResponse.json({ success: false, message: "Admission not found" }, { status: 404 });
            }

            const boundary = checkRecordBoundary(existing, auth.context, auth.grant);
            if (!boundary.allowed) {
                return NextResponse.json(
                    { success: false, message: boundary.message },
                    { status: boundary.statusCode }
                );
            }

            const admission = await this.admissionService.transferPatient(data);

            await recordAudit(auth.context, {
                action: "UPDATE",
                entity: "admission",
                entityId: String(data.admissionId),
                summary: `Patient transferred to bed ${String(data.newBedId)}`,
                metadata: {
                    newBedId: data.newBedId ?? null,
                    newDoctorId: data.newDoctorId ?? null
                },
            });

            return NextResponse.json(
                { success: true, message: "Patient transferred successfully", data: admission },
                { status: 200 }
            );
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Failed to transfer patient";
            return NextResponse.json(
                { success: false, message },
                { status: 500 }
            );
        }
    }

    async dischargePatient(request: NextRequest): Promise<NextResponse> {
        try {
            await dbConnect();
            const auth = await authorizeRequest(request, PERMISSION_KEYS.ADMISSION_DISCHARGE, "Admission");
            if (!auth.isAuthorized) return auth.response;

            const data: DischargeAdmissionDto = await request.json();

            if (!data.admissionId || !data.dischargeCondition || !data.finalDiagnosis) {
                return NextResponse.json(
                    { success: false, message: "Admission ID, Discharge Condition, and Final Diagnosis are required" },
                    { status: 400 }
                );
            }

            if (!Types.ObjectId.isValid(data.admissionId.toString())) {
                return NextResponse.json(
                    { success: false, message: "Invalid admission ID format" },
                    { status: 400 }
                );
            }

            const existing = await this.admissionService.getAdmissionById(new Types.ObjectId(data.admissionId));
            if (!existing) {
                return NextResponse.json({ success: false, message: "Admission not found" }, { status: 404 });
            }

            if (auth.grant.relScope === "OWN") {
                const docId = (existing.doctorId as PopulatedEntity)?._id?.toString() || existing.doctorId?.toString();
                if (docId !== auth.context.userId.toString()) {
                    return NextResponse.json(
                        { success: false, message: "Forbidden: You can only discharge your own admitted patients" },
                        { status: 403 }
                    );
                }
            }

            const boundary = checkRecordBoundary(existing, auth.context, auth.grant);
            if (!boundary.allowed) {
                return NextResponse.json(
                    { success: false, message: boundary.message },
                    { status: boundary.statusCode }
                );
            }

            const admission = await this.admissionService.dischargePatient(data);

            await recordAudit(auth.context, {
                action: "UPDATE",
                entity: "admission",
                entityId: String(data.admissionId),
                summary: `Patient discharged (${data.dischargeCondition})`,
                // `dischargeSummary` and the medication plan are clinical free
                // text, so only the administrative facts are recorded here.
                metadata: {
                    dischargeDate: data.dischargeDate ?? null,
                    followUpDate: data.followUpDate ?? null,
                    dischargeMedications: Array.isArray(data.dischargeMedications)
                        ? data.dischargeMedications.length
                        : 0
                },
            });

            return NextResponse.json(
                { success: true, message: "Patient discharged successfully", data: admission },
                { status: 200 }
            );
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Failed to discharge patient";
            return NextResponse.json(
                { success: false, message },
                { status: 500 }
            );
        }
    }

    async getAdmissionStats(request: NextRequest): Promise<NextResponse> {
        try {
            await dbConnect();
            const auth = await authorizeRequest(request, PERMISSION_KEYS.ADMISSION_VIEW, "Admission");
            if (!auth.isAuthorized) return auth.response;

            const stats = await this.admissionService.getAdmissionStats();
            return NextResponse.json(
                { success: true, data: stats },
                { status: 200 }
            );
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Failed to fetch admission statistics";
            return NextResponse.json(
                { success: false, message },
                { status: 500 }
            );
        }
    }

    async updateAdmission(request: NextRequest, id: string): Promise<NextResponse> {
        try {
            await dbConnect();
            const auth = await authorizeRequest(request, PERMISSION_KEYS.ADMISSION_UPDATE, "Admission");
            if (!auth.isAuthorized) return auth.response;

            if (!Types.ObjectId.isValid(id)) {
                return NextResponse.json(
                    { success: false, message: "Invalid admission ID" },
                    { status: 400 }
                );
            }

            const existing = await this.admissionService.getAdmissionById(new Types.ObjectId(id));
            if (!existing) {
                return NextResponse.json({ success: false, message: "Admission not found" }, { status: 404 });
            }

            if (auth.grant.relScope === "OWN") {
                const docId = (existing.doctorId as PopulatedEntity)?._id?.toString() || existing.doctorId?.toString();
                if (docId !== auth.context.userId.toString()) {
                    return NextResponse.json(
                        { success: false, message: "Forbidden: You can only update your own admissions" },
                        { status: 403 }
                    );
                }
            }

            const boundary = checkRecordBoundary(existing, auth.context, auth.grant);
            if (!boundary.allowed) {
                return NextResponse.json(
                    { success: false, message: boundary.message },
                    { status: boundary.statusCode }
                );
            }

            const data: UpdateAdmissionDto = await request.json();

            if ((data.patientId && !Types.ObjectId.isValid(data.patientId.toString())) ||
                (data.doctorId && !Types.ObjectId.isValid(data.doctorId.toString())) ||
                (data.branchId && !Types.ObjectId.isValid(data.branchId.toString())) ||
                (data.bedId && !Types.ObjectId.isValid(data.bedId.toString()))) {
                return NextResponse.json(
                    { success: false, message: "Invalid ID format for patient, doctor, branch, or bed" },
                    { status: 400 }
                );
            }

            const admission = await this.admissionService.updateAdmission(new Types.ObjectId(id), data);

            await recordAudit(auth.context, {
                action: "UPDATE",
                entity: "admission",
                entityId: id,
                summary: `Admission ${id} updated`,
                changes: diffRecords(
                    existing as unknown as Record<string, unknown>,
                    admission as unknown as Record<string, unknown>
                ),
            });

            return NextResponse.json(
                { success: true, message: "Admission updated successfully", data: admission },
                { status: 200 }
            );
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Failed to update admission";
            return NextResponse.json(
                { success: false, message },
                { status: 500 }
            );
        }
    }

    async deleteAdmission(id: string, request: NextRequest): Promise<NextResponse> {
        try {
            await dbConnect();
            const authResult = await authorizeRequest(request, PERMISSION_KEYS.ADMISSION_CANCEL, "Admission");
            if (!authResult.isAuthorized) return authResult.response;

            if (!Types.ObjectId.isValid(id)) {
                return NextResponse.json(
                    { success: false, message: "Invalid admission ID" },
                    { status: 400 }
                );
            }

            const existing = await this.admissionService.getAdmissionById(new Types.ObjectId(id));
            if (!existing) {
                return NextResponse.json({ success: false, message: "Admission not found" }, { status: 404 });
            }

            if (authResult?.grant.relScope === "OWN") {
                const docId = (existing.doctorId as PopulatedEntity)?._id?.toString() || existing.doctorId?.toString();
                if (docId !== authResult.context.userId.toString()) {
                    return NextResponse.json(
                        { success: false, message: "Forbidden: You can only cancel your own admissions" },
                        { status: 403 }
                    );
                }
            }

            const boundary = checkRecordBoundary(existing, authResult.context, authResult.grant);
            if (!boundary.allowed) {
                return NextResponse.json(
                    { success: false, message: boundary.message },
                    { status: boundary.statusCode }
                );
            }

            await this.admissionService.deleteAdmission(new Types.ObjectId(id));

            await recordAudit(authResult.context, {
                action: "DELETE",
                entity: "admission",
                entityId: id,
                summary: `Admission ${id} cancelled`,
                metadata: { patientId: existing.patientId ?? null },
            });

            return NextResponse.json(
                { success: true, message: "Admission deleted successfully" },
                { status: 200 }
            );
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Failed to delete admission";
            return NextResponse.json(
                { success: false, message },
                { status: 500 }
            );
        }
    }
}

const admissionController = new AdmissionController();
export default admissionController;
