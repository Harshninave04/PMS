import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import dbConnect from "@/lib/dbConnect";
import defaultPrescriptionService, { PrescriptionService } from "@/services/prescription.service";
import { CreatePrescriptionDto, UpdatePrescriptionDto } from "@/dto/prescription.dto";
import { authorizeRequest } from "@/lib/rbac/guard";
import { recordAudit, diffRecords } from "@/services/audit.service";
import { PERMISSION_KEYS } from "@/types/rbac";
import { checkRecordBoundary } from "@/lib/rbac/scope-guard";

function extractEntityId(field: unknown): string | null {
    if (!field) return null;
    if (typeof field === "object" && field !== null && "_id" in field) {
        const idVal = (field as { _id?: unknown })._id;
        return idVal ? String(idVal) : null;
    }
    return String(field);
}

export class PrescriptionController {
    constructor(private prescriptionService: PrescriptionService = defaultPrescriptionService) { }

    async createPrescription(request: NextRequest): Promise<NextResponse> {
        try {
            await dbConnect();
            const auth = await authorizeRequest(request, PERMISSION_KEYS.CLINICAL_PRESCRIPTION_CREATE, "Prescription");
            if (!auth.isAuthorized) return auth.response;

            const data: CreatePrescriptionDto = await request.json();

            // Enforce branch isolation
            if (auth.context.branchId && auth.grant.orgScope !== "GLOBAL") {
                data.branchId = auth.context.branchId.toString();
            }

            // Enforce doctor relational constraint: doctor with OWN scope can only author for their own userId
            if (auth.grant.relScope === "OWN") {
                data.doctorId = auth.context.userId.toString();
            }

            if (!data.patientId || !data.doctorId || !data.visitDate || !data.medications) {
                return NextResponse.json(
                    { success: false, message: "Required fields: patientId, doctorId, visitDate, medications" },
                    { status: 400 }
                );
            }

            if (!Types.ObjectId.isValid(data.patientId) || !Types.ObjectId.isValid(data.doctorId)) {
                return NextResponse.json(
                    { success: false, message: "Invalid ID format for patient or doctor" },
                    { status: 400 }
                );
            }

            if (data.branchId && !Types.ObjectId.isValid(data.branchId)) {
                return NextResponse.json(
                    { success: false, message: "Invalid branch ID format" },
                    { status: 400 }
                );
            }

            if (data.appointmentId && !Types.ObjectId.isValid(data.appointmentId)) {
                return NextResponse.json(
                    { success: false, message: "Invalid appointment ID format" },
                    { status: 400 }
                );
            }

            const prescription = await this.prescriptionService.createPrescription(data);

            await recordAudit(auth.context, {
                action: "CREATE",
                entity: "prescription",
                entityId: prescription?._id?.toString(),
                summary: `Prescription issued for patient ${String(data.patientId)}`,
                metadata: {
                    patientId: data.patientId ?? null,
                    // Medication names are clinical detail and stay out of the trail.
                    medicationCount: Array.isArray(data.medications) ? data.medications.length : 0
                },
            });

            return NextResponse.json(
                { success: true, message: "Prescription created successfully", data: prescription },
                { status: 201 }
            );
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Failed to create prescription";
            return NextResponse.json(
                { success: false, message },
                { status: 500 }
            );
        }
    }

    async getPrescriptions(request: NextRequest): Promise<NextResponse> {
        try {
            await dbConnect();

            // Authorization: user must have clinical prescription view OR pharmacy prescription view
            let auth = await authorizeRequest(request, PERMISSION_KEYS.CLINICAL_PRESCRIPTION_VIEW, "Prescription");
            if (!auth.isAuthorized) {
                auth = await authorizeRequest(request, PERMISSION_KEYS.PHARMACY_PRESCRIPTION_VIEW, "Prescription");
                if (!auth.isAuthorized) return auth.response;
            }

            const { searchParams } = new URL(request.url);
            const requestedBranchId = searchParams.get('branchId');
            const patientId = searchParams.get('patientId');
            const requestedDoctorId = searchParams.get('doctorId');
            const appointmentId = searchParams.get('appointmentId');

            // Enforce relational scope
            let effectiveDoctorId = requestedDoctorId;
            if (auth.grant.relScope === "OWN") {
                effectiveDoctorId = auth.context.userId.toString();
            }

            // Enforce organizational scope
            let effectiveBranchId = requestedBranchId;
            if (auth.context.branchId && auth.grant.orgScope === "BRANCH") {
                effectiveBranchId = auth.context.branchId.toString();
            }

            let prescriptions;

            if (effectiveDoctorId) {
                if (!Types.ObjectId.isValid(effectiveDoctorId)) return NextResponse.json({ success: false, message: "Invalid doctor ID" }, { status: 400 });
                prescriptions = await this.prescriptionService.getPrescriptionsByDoctorId(new Types.ObjectId(effectiveDoctorId));
                if (effectiveBranchId) {
                    prescriptions = prescriptions.filter(p => {
                        const bId = extractEntityId(p.branchId);
                        return bId === effectiveBranchId;
                    });
                }
            } else if (effectiveBranchId) {
                if (!Types.ObjectId.isValid(effectiveBranchId)) return NextResponse.json({ success: false, message: "Invalid branch ID" }, { status: 400 });
                prescriptions = await this.prescriptionService.getPrescriptionsByBranchId(new Types.ObjectId(effectiveBranchId));
            } else if (patientId) {
                if (!Types.ObjectId.isValid(patientId)) return NextResponse.json({ success: false, message: "Invalid patient ID" }, { status: 400 });
                prescriptions = await this.prescriptionService.getPrescriptionsByPatientId(new Types.ObjectId(patientId));
            } else if (appointmentId) {
                if (!Types.ObjectId.isValid(appointmentId)) return NextResponse.json({ success: false, message: "Invalid appointment ID" }, { status: 400 });
                prescriptions = await this.prescriptionService.getPrescriptionsByAppointmentId(new Types.ObjectId(appointmentId));
            } else {
                prescriptions = await this.prescriptionService.getAllPrescriptions();
            }

            return NextResponse.json(
                { success: true, count: prescriptions.length, data: prescriptions },
                { status: 200 }
            );
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Failed to fetch prescriptions";
            return NextResponse.json(
                { success: false, message },
                { status: 500 }
            );
        }
    }

    async getPrescriptionById(id: string, request: NextRequest): Promise<NextResponse> {
        try {
            await dbConnect();
            // Either permission grants access: a prescriber reads their own
            // prescription, a pharmacist reads the same record to dispense it.
            let authResult = await authorizeRequest(request, PERMISSION_KEYS.CLINICAL_PRESCRIPTION_VIEW, "Prescription");
            if (!authResult.isAuthorized) {
                authResult = await authorizeRequest(request, PERMISSION_KEYS.PHARMACY_PRESCRIPTION_VIEW, "Prescription");
                if (!authResult.isAuthorized) return authResult.response;
            }

            if (!Types.ObjectId.isValid(id)) {
                return NextResponse.json(
                    { success: false, message: "Invalid prescription ID" },
                    { status: 400 }
                );
            }

            const prescription = await this.prescriptionService.getPrescriptionById(new Types.ObjectId(id));
            if (!prescription) {
                return NextResponse.json(
                    { success: false, message: "Prescription not found" },
                    { status: 404 }
                );
            }

            // Relational check
            if (authResult?.grant.relScope === "OWN") {
                const docId = extractEntityId(prescription.doctorId);
                if (docId !== authResult.context.userId.toString()) {
                    return NextResponse.json(
                        { success: false, message: "Forbidden: You can only view your own prescriptions" },
                        { status: 403 }
                    );
                }
            }

            // Organizational check
            const boundary = checkRecordBoundary(prescription, authResult.context, authResult.grant);
            if (!boundary.allowed) {
                return NextResponse.json(
                    { success: false, message: boundary.message },
                    { status: boundary.statusCode }
                );
            }

            return NextResponse.json(
                { success: true, data: prescription },
                { status: 200 }
            );
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Failed to fetch prescription";
            return NextResponse.json(
                { success: false, message },
                { status: 500 }
            );
        }
    }

    async updatePrescription(request: NextRequest, id: string): Promise<NextResponse> {
        try {
            await dbConnect();

            // Clinician updating prescription OR pharmacist dispensing
            let auth = await authorizeRequest(request, PERMISSION_KEYS.CLINICAL_PRESCRIPTION_CREATE, "Prescription");
            if (!auth.isAuthorized) {
                auth = await authorizeRequest(request, PERMISSION_KEYS.PHARMACY_DISPENSE_CREATE, "Prescription");
                if (!auth.isAuthorized) return auth.response;
            }

            if (!Types.ObjectId.isValid(id)) {
                return NextResponse.json(
                    { success: false, message: "Invalid prescription ID" },
                    { status: 400 }
                );
            }

            const existing = await this.prescriptionService.getPrescriptionById(new Types.ObjectId(id));
            if (!existing) {
                return NextResponse.json(
                    { success: false, message: "Prescription not found" },
                    { status: 404 }
                );
            }

            // Relational check
            if (auth.grant.relScope === "OWN") {
                const docId = extractEntityId(existing.doctorId);
                if (docId !== auth.context.userId.toString()) {
                    return NextResponse.json(
                        { success: false, message: "Forbidden: You can only update your own prescriptions" },
                        { status: 403 }
                    );
                }
            }

            // Organizational check
            const boundary = checkRecordBoundary(existing, auth.context, auth.grant);
            if (!boundary.allowed) {
                return NextResponse.json(
                    { success: false, message: boundary.message },
                    { status: boundary.statusCode }
                );
            }

            const data: UpdatePrescriptionDto = await request.json();

            if ((data.patientId && !Types.ObjectId.isValid(data.patientId)) ||
                (data.doctorId && !Types.ObjectId.isValid(data.doctorId)) ||
                (data.branchId && !Types.ObjectId.isValid(data.branchId)) ||
                (data.appointmentId && !Types.ObjectId.isValid(data.appointmentId))) {
                return NextResponse.json(
                    { success: false, message: "Invalid ID format for patient, doctor, branch, or appointment" },
                    { status: 400 }
                );
            }

            const prescription = await this.prescriptionService.updatePrescription(new Types.ObjectId(id), data);

            await recordAudit(auth.context, {
                action: "UPDATE",
                entity: "prescription",
                entityId: id,
                summary: `Prescription ${id} updated`,
                changes: diffRecords(
                    existing as unknown as Record<string, unknown>,
                    prescription as unknown as Record<string, unknown>
                ),
            });

            return NextResponse.json(
                { success: true, message: "Prescription updated successfully", data: prescription },
                { status: 200 }
            );
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Failed to update prescription";
            return NextResponse.json(
                { success: false, message },
                { status: 500 }
            );
        }
    }

    async deletePrescription(id: string, request: NextRequest): Promise<NextResponse> {
        try {
            await dbConnect();
            const authResult = await authorizeRequest(request, PERMISSION_KEYS.CLINICAL_PRESCRIPTION_CANCEL, "Prescription");
            if (!authResult.isAuthorized) return authResult.response;

            if (!Types.ObjectId.isValid(id)) {
                return NextResponse.json(
                    { success: false, message: "Invalid prescription ID" },
                    { status: 400 }
                );
            }

            const existing = await this.prescriptionService.getPrescriptionById(new Types.ObjectId(id));
            if (!existing) {
                return NextResponse.json(
                    { success: false, message: "Prescription not found" },
                    { status: 404 }
                );
            }

            if (authResult?.grant.relScope === "OWN") {
                const docId = extractEntityId(existing.doctorId);
                if (docId !== authResult.context.userId.toString()) {
                    return NextResponse.json(
                        { success: false, message: "Forbidden: You can only cancel your own prescriptions" },
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

            await this.prescriptionService.deletePrescription(new Types.ObjectId(id));

            await recordAudit(authResult.context, {
                action: "DELETE",
                entity: "prescription",
                entityId: id,
                summary: `Prescription ${id} cancelled`,
                metadata: { patientId: existing.patientId ?? null },
            });

            return NextResponse.json(
                { success: true, message: "Prescription deleted successfully" },
                { status: 200 }
            );
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Failed to delete prescription";
            return NextResponse.json(
                { success: false, message },
                { status: 500 }
            );
        }
    }
}

const prescriptionController = new PrescriptionController();
export default prescriptionController;
