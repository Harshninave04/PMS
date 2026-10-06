import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import dbConnect from "@/lib/dbConnect";
import defaultPatientService, { PatientService } from "@/services/patient.service";
import { CreatePatientDto, UpdatePatientDto, AddPatientDocumentDto } from "@/dto/patient.dto";
import { authorizeRequest } from "@/lib/rbac/guard";
import { PERMISSION_KEYS } from "@/types/rbac";
import { recordAudit, diffRecords } from "@/services/audit.service";
import { checkRecordBoundary } from "@/lib/rbac/scope-guard";

export class PatientController {
    constructor(private patientService: PatientService = defaultPatientService) { }

    async createPatient(request: NextRequest): Promise<NextResponse> {
        try {
            await dbConnect();
            const auth = await authorizeRequest(request, PERMISSION_KEYS.PATIENT_CREATE, "Patient");
            if (!auth.isAuthorized) return auth.response;

            const data: CreatePatientDto = await request.json();

            // Enforce branch multi-tenancy: if user has branchId and is not GLOBAL, enforce user's branch
            if (auth.context.branchId && auth.grant.orgScope !== "GLOBAL") {
                data.branchId = auth.context.branchId.toString();
            }

            if (!data.name || data.age === undefined || !data.gender || !data.contact || !data.address || !data.emergencyContact || !data.branchId) {
                return NextResponse.json(
                    { success: false, message: "Required fields are missing: Name, Age, Gender, Contact, Address, Emergency Contact, and Branch are required." },
                    { status: 400 }
                );
            }

            if (!Types.ObjectId.isValid(data.branchId.toString())) {
                return NextResponse.json(
                    { success: false, message: "Invalid branch ID format" },
                    { status: 400 }
                );
            }

            const patient = await this.patientService.createPatient(data);

            await recordAudit(auth.context, {
                action: "CREATE",
                entity: "patient",
                entityId: patient?._id?.toString(),
                summary: `Patient ${patient?.uhid ?? ""} registered for ${patient?.name ?? "unknown"}`,
            });

            return NextResponse.json(
                { success: true, message: "Patient created successfully", data: patient },
                { status: 201 }
            );
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Failed to create patient";
            return NextResponse.json(
                { success: false, message },
                { status: 500 }
            );
        }
    }

    async getPatients(request: NextRequest): Promise<NextResponse> {
        try {
            await dbConnect();
            const auth = await authorizeRequest(request, PERMISSION_KEYS.PATIENT_VIEW, "Patient");
            if (!auth.isAuthorized) return auth.response;

            const { searchParams } = new URL(request.url);
            const query = searchParams.get("query") || undefined;
            const requestedBranchId = searchParams.get("branchId") || undefined;
            const status = searchParams.get("status") || undefined;
            const bloodGroup = searchParams.get("bloodGroup") || undefined;

            // Enforce branch isolation: user can only query their branch unless GLOBAL/ORGANIZATION
            let effectiveBranchId = requestedBranchId;
            if (auth.context.branchId && auth.grant.orgScope === "BRANCH") {
                effectiveBranchId = auth.context.branchId.toString();
            }

            const patients = await this.patientService.searchPatients({
                query,
                branchId: effectiveBranchId,
                status,
                bloodGroup
            });

            return NextResponse.json(
                { success: true, count: patients.length, data: patients },
                { status: 200 }
            );
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Failed to fetch patients";
            return NextResponse.json(
                { success: false, message },
                { status: 500 }
            );
        }
    }

    async getPatientById(id: string, request: NextRequest): Promise<NextResponse> {
        try {
            await dbConnect();
            const authResult = await authorizeRequest(request, PERMISSION_KEYS.PATIENT_VIEW, "Patient");
            if (!authResult.isAuthorized) return authResult.response;

            let patient = null;
            if (Types.ObjectId.isValid(id)) {
                patient = await this.patientService.getPatientById(new Types.ObjectId(id));
            }

            if (!patient && id.startsWith("MED-")) {
                patient = await this.patientService.getPatientByUhid(id);
            }

            if (!patient) {
                return NextResponse.json(
                    { success: false, message: "Patient not found" },
                    { status: 404 }
                );
            }

            const boundary = checkRecordBoundary(patient, authResult.context, authResult.grant);
            if (!boundary.allowed) {
                return NextResponse.json(
                    { success: false, message: boundary.message },
                    { status: boundary.statusCode }
                );
            }

            return NextResponse.json(
                { success: true, data: patient },
                { status: 200 }
            );
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Failed to fetch patient";
            return NextResponse.json(
                { success: false, message },
                { status: 500 }
            );
        }
    }

    async updatePatient(request: NextRequest, id: string): Promise<NextResponse> {
        try {
            await dbConnect();
            const auth = await authorizeRequest(request, PERMISSION_KEYS.PATIENT_UPDATE, "Patient");
            if (!auth.isAuthorized) return auth.response;

            if (!Types.ObjectId.isValid(id)) {
                return NextResponse.json(
                    { success: false, message: "Invalid patient ID" },
                    { status: 400 }
                );
            }

            const existingPatient = await this.patientService.getPatientById(new Types.ObjectId(id));
            if (!existingPatient) {
                return NextResponse.json(
                    { success: false, message: "Patient not found" },
                    { status: 404 }
                );
            }

            const boundary = checkRecordBoundary(existingPatient, auth.context, auth.grant);
            if (!boundary.allowed) {
                return NextResponse.json(
                    { success: false, message: boundary.message },
                    { status: boundary.statusCode }
                );
            }

            const data: UpdatePatientDto = await request.json();

            if (data.branchId && !Types.ObjectId.isValid(data.branchId.toString())) {
                return NextResponse.json(
                    { success: false, message: "Invalid branch ID format" },
                    { status: 400 }
                );
            }

            const patient = await this.patientService.updatePatient(new Types.ObjectId(id), data);

            await recordAudit(auth.context, {
                action: "UPDATE",
                entity: "patient",
                entityId: id,
                summary: `Patient ${existingPatient.uhid ?? id} record updated`,
                changes: diffRecords(
                    existingPatient as unknown as Record<string, unknown>,
                    patient as unknown as Record<string, unknown>
                ),
            });

            return NextResponse.json(
                { success: true, message: "Patient updated successfully", data: patient },
                { status: 200 }
            );
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Failed to update patient";
            return NextResponse.json(
                { success: false, message },
                { status: 500 }
            );
        }
    }

    async deletePatient(id: string, request: NextRequest): Promise<NextResponse> {
        try {
            await dbConnect();
            const authResult = await authorizeRequest(request, PERMISSION_KEYS.PATIENT_DELETE, "Patient");
            if (!authResult.isAuthorized) return authResult.response;

            if (!Types.ObjectId.isValid(id)) {
                return NextResponse.json(
                    { success: false, message: "Invalid patient ID" },
                    { status: 400 }
                );
            }

            const existingPatient = await this.patientService.getPatientById(new Types.ObjectId(id));
            if (!existingPatient) {
                return NextResponse.json(
                    { success: false, message: "Patient not found" },
                    { status: 404 }
                );
            }

            const boundary = checkRecordBoundary(existingPatient, authResult.context, authResult.grant);
            if (!boundary.allowed) {
                return NextResponse.json(
                    { success: false, message: boundary.message },
                    { status: boundary.statusCode }
                );
            }

            // Soft delete: the row is retained for billing, retention and audit.
            const reason = new URL(request.url).searchParams.get("reason") ?? undefined;
            await this.patientService.deletePatient(
                new Types.ObjectId(id),
                authResult.context.userId,
                reason,
                authResult.filter as Record<string, unknown>
            );

            await recordAudit(authResult.context, {
                action: "DELETE",
                entity: "patient",
                entityId: id,
                summary: `Patient ${existingPatient.uhid ?? id} archived${reason ? ` (${reason})` : ""}`,
                changes: diffRecords(
                    existingPatient as unknown as Record<string, unknown>,
                    { isDeleted: true, isActive: false, deletedAt: new Date() }
                ),
            });

            return NextResponse.json(
                { success: true, message: "Patient archived successfully" },
                { status: 200 }
            );
        } catch (error: unknown) {
            const err = error as { statusCode?: number; message?: string };
            const message = err?.message || (error instanceof Error ? error.message : "Failed to archive patient");
            return NextResponse.json(
                { success: false, message },
                { status: err?.statusCode || 500 }
            );
        }
    }

    /** Restores a soft-deleted patient. */
    async restorePatient(id: string, request: NextRequest): Promise<NextResponse> {
        try {
            await dbConnect();
            const authResult = await authorizeRequest(request, PERMISSION_KEYS.PATIENT_DELETE, "Patient");
            if (!authResult.isAuthorized) return authResult.response;

            if (!Types.ObjectId.isValid(id)) {
                return NextResponse.json(
                    { success: false, message: "Invalid patient ID" },
                    { status: 400 }
                );
            }

            const restored = await this.patientService.restorePatient(
                new Types.ObjectId(id),
                authResult.filter as Record<string, unknown>
            );

            if (!restored) {
                return NextResponse.json(
                    { success: false, message: "Patient not found or not archived" },
                    { status: 404 }
                );
            }

            await recordAudit(authResult.context, {
                action: "RESTORE",
                entity: "patient",
                entityId: id,
                summary: `Patient ${restored.uhid ?? id} restored from archive`,
            });

            return NextResponse.json(
                { success: true, message: "Patient restored successfully", data: restored },
                { status: 200 }
            );
        } catch (error: unknown) {
            const err = error as { statusCode?: number; message?: string };
            const message = err?.message || (error instanceof Error ? error.message : "Failed to restore patient");
            return NextResponse.json(
                { success: false, message },
                { status: err?.statusCode || 500 }
            );
        }
    }

    async addDocument(request: NextRequest): Promise<NextResponse> {
        try {
            await dbConnect();
            const auth = await authorizeRequest(request, PERMISSION_KEYS.PATIENT_DOC_UPLOAD, "Patient");
            if (!auth.isAuthorized) return auth.response;

            const { searchParams } = new URL(request.url);
            const patientId = searchParams.get("patientId");

            if (!patientId || !Types.ObjectId.isValid(patientId)) {
                return NextResponse.json(
                    { success: false, message: "Valid patient ID is required" },
                    { status: 400 }
                );
            }

            const existingPatient = await this.patientService.getPatientById(new Types.ObjectId(patientId));
            if (!existingPatient) {
                return NextResponse.json(
                    { success: false, message: "Patient not found" },
                    { status: 404 }
                );
            }

            const boundary = checkRecordBoundary(existingPatient, auth.context, auth.grant);
            if (!boundary.allowed) {
                return NextResponse.json(
                    { success: false, message: boundary.message },
                    { status: boundary.statusCode }
                );
            }

            const body: AddPatientDocumentDto = await request.json();
            if (!body.title || !body.fileUrl || !body.fileName) {
                return NextResponse.json(
                    { success: false, message: "Title, File Name, and File URL are required" },
                    { status: 400 }
                );
            }

            const updated = await this.patientService.addDocument(
                new Types.ObjectId(patientId),
                body,
                auth.filter as Record<string, unknown>
            );

            if (!updated) {
                return NextResponse.json(
                    { success: false, message: "Forbidden: Patient not found within your scope" },
                    { status: 403 }
                );
            }

            return NextResponse.json(
                { success: true, message: "Document added successfully", data: updated },
                { status: 201 }
            );
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Failed to add document";
            return NextResponse.json(
                { success: false, message },
                { status: 500 }
            );
        }
    }

    async deleteDocument(request: NextRequest): Promise<NextResponse> {
        try {
            await dbConnect();
            const auth = await authorizeRequest(request, PERMISSION_KEYS.PATIENT_DOC_DELETE, "Patient");
            if (!auth.isAuthorized) return auth.response;

            const { searchParams } = new URL(request.url);
            const patientId = searchParams.get("patientId");
            const documentId = searchParams.get("documentId");

            if (!patientId || !Types.ObjectId.isValid(patientId) || !documentId) {
                return NextResponse.json(
                    { success: false, message: "Valid patientId and documentId are required" },
                    { status: 400 }
                );
            }

            if (!Types.ObjectId.isValid(documentId)) {
                return NextResponse.json(
                    { success: false, message: "Invalid document ID" },
                    { status: 400 }
                );
            }

            const scopeFilter = auth.filter as Record<string, unknown>;

            const updated = await this.patientService.deleteDocument(
                new Types.ObjectId(patientId),
                documentId,
                scopeFilter
            );

            if (!updated) {
                return NextResponse.json(
                    { success: false, message: "Patient not found or document does not exist" },
                    { status: 404 }
                );
            }

            await recordAudit(auth.context, {
                action: "DELETE",
                entity: "patientDocument",
                entityId: documentId,
                summary: `Document removed from patient ${patientId}`,
                metadata: { patientId },
            });

            return NextResponse.json(
                { success: true, message: "Document deleted successfully", data: updated },
                { status: 200 }
            );
        } catch (error: unknown) {
            const err = error as { statusCode?: number; message?: string };
            return NextResponse.json(
                { success: false, message: err?.message ?? "Failed to delete document" },
                { status: err?.statusCode ?? 500 }
            );
        }
    }

    async getPatientHistory(request: NextRequest): Promise<NextResponse> {
        try {
            await dbConnect();
            const auth = await authorizeRequest(request, PERMISSION_KEYS.PATIENT_VIEW, "Patient");
            if (!auth.isAuthorized) return auth.response;

            const { searchParams } = new URL(request.url);
            const patientId = searchParams.get("patientId");

            if (!patientId || !Types.ObjectId.isValid(patientId)) {
                return NextResponse.json(
                    { success: false, message: "Valid patient ID is required" },
                    { status: 400 }
                );
            }

            const history = await this.patientService.getPatientHistory(new Types.ObjectId(patientId));

            return NextResponse.json(
                { success: true, data: history },
                { status: 200 }
            );
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Failed to fetch patient history";
            return NextResponse.json(
                { success: false, message },
                { status: 500 }
            );
        }
    }

    async getStats(request: NextRequest): Promise<NextResponse> {
        try {
            await dbConnect();
            const auth = await authorizeRequest(request, PERMISSION_KEYS.PATIENT_VIEW, "Patient");
            if (!auth.isAuthorized) return auth.response;

            const { searchParams } = new URL(request.url);
            const branchId = searchParams.get("branchId") || undefined;

            let effectiveBranchId = branchId;
            if (auth.context.branchId && auth.grant.orgScope === "BRANCH") {
                effectiveBranchId = auth.context.branchId.toString();
            }

            const stats = await this.patientService.getStats(effectiveBranchId);

            return NextResponse.json(
                { success: true, data: stats },
                { status: 200 }
            );
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Failed to fetch patient statistics";
            return NextResponse.json(
                { success: false, message },
                { status: 500 }
            );
        }
    }
}

const defaultPatientController = new PatientController();
export default defaultPatientController;
