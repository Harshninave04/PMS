import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import dbConnect from "@/lib/dbConnect";
import defaultPatientService, { PatientDuplicateError, PatientService } from "@/services/patient.service";
import { CreatePatientDto, UpdatePatientDto, AddPatientDocumentDto } from "@/dto/patient.dto";
import { authorizeRequest } from "@/lib/rbac/guard";
import { PERMISSION_KEYS } from "@/types/rbac";
import {
    isDoctorActor,
    getAssignedPatientIds,
    isPatientAssignedToDoctor
} from "@/lib/rbac/doctor-scope";

export class PatientController {
    constructor(private patientService: PatientService = defaultPatientService) { }

    async createPatient(
        request: NextRequest,
        permission: string = PERMISSION_KEYS.PATIENT_CREATE
    ): Promise<NextResponse> {
        try {
            await dbConnect();
            const auth = await authorizeRequest(request, permission, "Patient");
            if (!auth.isAuthorized) return auth.response;

            const data = await request.json() as CreatePatientDto & { emergencyRegistration?: boolean };
            const emergencyRegistration = data.emergencyRegistration === true;
            data.name = data.name?.trim() || (emergencyRegistration ? "Unknown" : "");
            data.contact = data.contact?.trim() || "";

            // Enforce branch multi-tenancy: if user has branchId and is not GLOBAL, enforce user's branch
            if (auth.context.branchId && auth.grant.orgScope !== "GLOBAL") {
                data.branchId = auth.context.branchId.toString();
            }

            // Admission's quick-create form collects only the essentials. Keep
            // the patient record valid by supplying the registration defaults
            // for details that can be completed later.
            if (!data.branchId && (auth.context.branchId || auth.context.organizationId)) {
                data.branchId = (auth.context.branchId || auth.context.organizationId)!.toString();
            }
            data.address = data.address?.trim() || "Not provided";
            data.emergencyContact = data.emergencyContact?.trim() || "Not provided";
            data.bloodGroup = data.bloodGroup?.trim() || undefined;

            if (!data.name || data.age === undefined || !data.gender || (!data.contact && !emergencyRegistration) || !data.branchId) {
                return NextResponse.json(
                    { success: false, message: "Name, age, gender, phone, and branch are required. Emergency registration may leave name or phone empty." },
                    { status: 400 }
                );
            }

            if (!Types.ObjectId.isValid(data.branchId.toString())) {
                return NextResponse.json(
                    { success: false, message: "Invalid branch ID format" },
                    { status: 400 }
                );
            }

            const patient = await this.patientService.createPatient(data, auth.context.userId);

            return NextResponse.json(
                { success: true, message: "Patient created successfully", data: patient },
                { status: 201 }
            );
        } catch (error: unknown) {
            if (error instanceof PatientDuplicateError) {
                return NextResponse.json(
                    {
                        success: false,
                        message: error.message,
                        matchingPatients: error.matchingPatients,
                        canConfirmSharedPhone: error.canConfirmSharedPhone,
                    },
                    { status: 409 }
                );
            }
            const message = error instanceof Error ? error.message : "Failed to create patient";
            const statusCode = Number((error as { statusCode?: number })?.statusCode) || 500;
            return NextResponse.json({ success: false, message }, { status: statusCode });
        }
    }

    async getPatients(
        request: NextRequest,
        permission: string = PERMISSION_KEYS.PATIENT_VIEW
    ): Promise<NextResponse> {
        try {
            await dbConnect();
            const auth = await authorizeRequest(request, permission, "Patient");
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

            // Enforce doctor isolation: a doctor only sees patients assigned to them
            let assignedPatientIds: Types.ObjectId[] | undefined;
            if (isDoctorActor(auth.context)) {
                assignedPatientIds = await getAssignedPatientIds(auth.context.doctorProfileId!);
                if (assignedPatientIds.length === 0) {
                    return NextResponse.json(
                        { success: true, count: 0, data: [] },
                        { status: 200 }
                    );
                }
            }

            const patients = await this.patientService.searchPatients({
                query,
                branchId: effectiveBranchId,
                status,
                bloodGroup,
                patientIds: assignedPatientIds
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

    async getPatientById(id: string, request?: NextRequest): Promise<NextResponse> {
        try {
            await dbConnect();
            let authResult;
            if (request) {
                const auth = await authorizeRequest(request, PERMISSION_KEYS.PATIENT_VIEW, "Patient");
                if (!auth.isAuthorized) return auth.response;
                authResult = auth;
            }

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

            if (authResult?.context.branchId && authResult.grant.orgScope === "BRANCH") {
                const patientBranch = patient.branchId ? patient.branchId.toString() : null;
                if (patientBranch && patientBranch !== authResult.context.branchId.toString()) {
                    return NextResponse.json(
                        { success: false, message: "Forbidden: Patient belongs to another branch" },
                        { status: 403 }
                    );
                }
            }

            if (authResult && isDoctorActor(authResult.context)) {
                const assigned = await isPatientAssignedToDoctor(
                    authResult.context.doctorProfileId!,
                    new Types.ObjectId(patient._id.toString())
                );
                if (!assigned) {
                    return NextResponse.json(
                        { success: false, message: "Forbidden: Patient is not assigned to you" },
                        { status: 403 }
                    );
                }
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

            if (auth.context.branchId && auth.grant.orgScope === "BRANCH") {
                const patientBranch = existingPatient.branchId ? existingPatient.branchId.toString() : null;
                if (patientBranch && patientBranch !== auth.context.branchId.toString()) {
                    return NextResponse.json(
                        { success: false, message: "Forbidden: Cannot update patient belonging to another branch" },
                        { status: 403 }
                    );
                }
            }

            if (isDoctorActor(auth.context)) {
                const assigned = await isPatientAssignedToDoctor(
                    auth.context.doctorProfileId!,
                    new Types.ObjectId(existingPatient._id.toString())
                );
                if (!assigned) {
                    return NextResponse.json(
                        { success: false, message: "Forbidden: Cannot update a patient not assigned to you" },
                        { status: 403 }
                    );
                }
            }

            const data: UpdatePatientDto = await request.json();

            if (data.branchId && !Types.ObjectId.isValid(data.branchId.toString())) {
                return NextResponse.json(
                    { success: false, message: "Invalid branch ID format" },
                    { status: 400 }
                );
            }

            const patient = await this.patientService.updatePatient(new Types.ObjectId(id), data);

            return NextResponse.json(
                { success: true, message: "Patient updated successfully", data: patient },
                { status: 200 }
            );
        } catch (error: unknown) {
            if (error instanceof PatientDuplicateError) {
                return NextResponse.json(
                    { success: false, message: "Patient already exists", matchingPatients: error.matchingPatients },
                    { status: 409 }
                );
            }
            const message = error instanceof Error ? error.message : "Failed to update patient";
            return NextResponse.json(
                { success: false, message },
                { status: Number((error as { statusCode?: number })?.statusCode) || 500 }
            );
        }
    }

    async deletePatient(id: string, request?: NextRequest): Promise<NextResponse> {
        try {
            await dbConnect();
            let authResult;
            if (request) {
                const auth = await authorizeRequest(request, PERMISSION_KEYS.PATIENT_DELETE, "Patient");
                if (!auth.isAuthorized) return auth.response;
                authResult = auth;
            }

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

            if (authResult?.context.branchId && authResult.grant.orgScope === "BRANCH") {
                const patientBranch = existingPatient.branchId ? existingPatient.branchId.toString() : null;
                if (patientBranch && patientBranch !== authResult.context.branchId.toString()) {
                    return NextResponse.json(
                        { success: false, message: "Forbidden: Cannot delete patient belonging to another branch" },
                        { status: 403 }
                    );
                }
            }

            if (authResult && isDoctorActor(authResult.context)) {
                const assigned = await isPatientAssignedToDoctor(
                    authResult.context.doctorProfileId!,
                    new Types.ObjectId(existingPatient._id.toString())
                );
                if (!assigned) {
                    return NextResponse.json(
                        { success: false, message: "Forbidden: Cannot delete a patient not assigned to you" },
                        { status: 403 }
                    );
                }
            }

            await this.patientService.deletePatient(new Types.ObjectId(id));

            return NextResponse.json(
                { success: true, message: "Patient deleted successfully" },
                { status: 200 }
            );
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Failed to delete patient";
            return NextResponse.json(
                { success: false, message },
                { status: 500 }
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

            if (auth.context.branchId && auth.grant.orgScope === "BRANCH") {
                const patientBranch = existingPatient.branchId ? existingPatient.branchId.toString() : null;
                if (patientBranch && patientBranch !== auth.context.branchId.toString()) {
                    return NextResponse.json(
                        { success: false, message: "Forbidden: Patient belongs to another branch" },
                        { status: 403 }
                    );
                }
            }

            if (isDoctorActor(auth.context)) {
                const assigned = await isPatientAssignedToDoctor(
                    auth.context.doctorProfileId!,
                    new Types.ObjectId(existingPatient._id.toString())
                );
                if (!assigned) {
                    return NextResponse.json(
                        { success: false, message: "Forbidden: Cannot upload documents for a patient not assigned to you" },
                        { status: 403 }
                    );
                }
            }

            const body: AddPatientDocumentDto = await request.json();
            if (!body.title || !body.fileUrl || !body.fileName) {
                return NextResponse.json(
                    { success: false, message: "Title, File Name, and File URL are required" },
                    { status: 400 }
                );
            }

            const updated = await this.patientService.addDocument(new Types.ObjectId(patientId), body);
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

            const existingPatient = await this.patientService.getPatientById(new Types.ObjectId(patientId));
            if (!existingPatient) {
                return NextResponse.json(
                    { success: false, message: "Patient not found" },
                    { status: 404 }
                );
            }

            if (auth.context.branchId && auth.grant.orgScope === "BRANCH") {
                const patientBranch = existingPatient.branchId ? existingPatient.branchId.toString() : null;
                if (patientBranch && patientBranch !== auth.context.branchId.toString()) {
                    return NextResponse.json(
                        { success: false, message: "Forbidden: Patient belongs to another branch" },
                        { status: 403 }
                    );
                }
            }

            if (isDoctorActor(auth.context)) {
                const assigned = await isPatientAssignedToDoctor(
                    auth.context.doctorProfileId!,
                    new Types.ObjectId(existingPatient._id.toString())
                );
                if (!assigned) {
                    return NextResponse.json(
                        { success: false, message: "Forbidden: Cannot delete documents for a patient not assigned to you" },
                        { status: 403 }
                    );
                }
            }

            const updated = await this.patientService.deleteDocument(new Types.ObjectId(patientId), documentId);
            return NextResponse.json(
                { success: true, message: "Document deleted successfully", data: updated },
                { status: 200 }
            );
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Failed to delete document";
            return NextResponse.json(
                { success: false, message },
                { status: 500 }
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

            if (isDoctorActor(auth.context)) {
                const assigned = await isPatientAssignedToDoctor(
                    auth.context.doctorProfileId!,
                    new Types.ObjectId(patientId)
                );
                if (!assigned) {
                    return NextResponse.json(
                        { success: false, message: "Forbidden: Patient is not assigned to you" },
                        { status: 403 }
                    );
                }
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

            // Doctor isolation: stats reflect only the doctor's assigned patients
            let assignedPatientIds: Types.ObjectId[] | undefined;
            if (isDoctorActor(auth.context)) {
                assignedPatientIds = await getAssignedPatientIds(auth.context.doctorProfileId!);
            }

            const stats = await this.patientService.getStats(effectiveBranchId, assignedPatientIds);

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
