import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import dbConnect from "@/lib/dbConnect";
import defaultAdmissionService, { AdmissionService } from "@/services/admission.service";
import { CreateAdmissionDto, UpdateAdmissionDto, TransferAdmissionDto, DischargeAdmissionDto, DischargeRequestDto, BillingRequestDto, DischargeNoteDto, AssignCareTeamDto } from "@/dto/admission.dto";
import { authorizeRequest } from "@/lib/rbac/guard";
import { PERMISSION_KEYS } from "@/types/rbac";
import { isSuperAdminRole } from "@/lib/rbac/default-permissions";
import { getBillingQueue, BillingActor } from "@/services/billing-flow.service";
import DailyNursingRecord from "@/models/daily-nursing-record.model";
import NursingMedicalSupply from "@/models/nursing-medical-supply.model";
import type { IBillingMedicalSupply } from "@/interfaces/admission.interface";
import { stayDayNumber } from "@/lib/hospital-time";
import { getHospitalProfile } from "@/services/hospital-profile.service";
import { buildAutoTreatmentSummary, buildDischargeFullFile } from "@/services/discharge-packet.service";
import { isNurseRole } from "@/lib/rbac/roles";
import Organization from "@/models/organization.model";

interface PopulatedEntity {
    _id?: Types.ObjectId;
    [key: string]: unknown;
}

function idOfValue(value: unknown): string {
    const rec = value as { _id?: { toString(): string } } | null | undefined;
    if (rec && typeof rec === "object" && "_id" in rec && rec._id) return rec._id.toString();
    return value ? String(value) : "";
}

// Doctors may only flag their own assigned stays; admins keep the admissions
// desk. The nurse stage of the pipeline uses its own permissions (Phase 2).
function dischargeFlagAccessError(
    context: { userId: Types.ObjectId; roleName: string },
    admission: { doctorId?: unknown; assignedDoctors?: unknown }
): string | null {
    if (isSuperAdminRole(context.roleName)) return null;
    const role = (context.roleName || "").toUpperCase();
    if (role === "ADMIN") return null;
    if (role !== "DOCTOR") return "Only the patient's doctor can flag this stay for discharge";
    const uid = context.userId.toString();
    const assigned = Array.isArray(admission.assignedDoctors) ? admission.assignedDoctors : [];
    const onTeam = assigned.some((doctor) => idOfValue(doctor) === uid) || idOfValue(admission.doctorId) === uid;
    return onTeam ? null : "Forbidden: You can only flag your own admitted patients";
}

// The nurse stage of the pipeline: only a nurse assigned to the stay (or
// admin cover) may send it to billing, recall it, or add discharge notes.
function billingAccessError(
    context: { userId: Types.ObjectId; roleName: string },
    admission: { assignedNurses?: unknown }
): string | null {
    if (isSuperAdminRole(context.roleName)) return null;
    const role = (context.roleName || "").toUpperCase();
    if (role === "ADMIN") return null;
    if (role !== "NURSE") return "Only the stay's assigned nurse can manage this discharge process";
    const uid = context.userId.toString();
    const assigned = Array.isArray(admission.assignedNurses) ? admission.assignedNurses : [];
    return assigned.some((nurse) => idOfValue(nurse) === uid)
        ? null
        : "Forbidden: Only a nurse assigned to this patient can manage its discharge";
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
            // Default the stay to the creator's hospital scope so team-scoped
            // rosters (which match this field) keep seeing it. The form does
            // not send a branch.
            if (!data.branchId && (auth.context.branchId || auth.context.organizationId)) {
                data.branchId = (auth.context.branchId || auth.context.organizationId)!.toString();
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

            return NextResponse.json(
                { success: true, message: "Admission created successfully", data: admission },
                { status: 201 }
            );
        } catch (error: unknown) {
            const err = error as { statusCode?: number; message?: string };
            const message = err?.message || (error instanceof Error ? error.message : "Failed to create admission");
            return NextResponse.json(
                { success: false, message },
                { status: err?.statusCode ?? 500 }
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
            if (isNurseRole(auth.context.roleName)) {
                filter.assignedNurses = auth.context.userId;
            }

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
            if (!isNurseRole(auth.context.roleName) && auth.grant.relScope === "OWN") {
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
            } else if (auth.grant.orgScope === "ORGANIZATION") {
                const organizationId = auth.context.organizationId?.toString();
                if (!organizationId || !Types.ObjectId.isValid(organizationId)) {
                    return NextResponse.json({ success: false, message: "Organization scope is missing" }, { status: 403 });
                }
                const organizationBranches = await Organization.find({
                    $or: [
                        { _id: new Types.ObjectId(organizationId) },
                        { headQuarter: new Types.ObjectId(organizationId) },
                    ],
                }).distinct("_id");
                if (requestedBranchId) {
                    if (!Types.ObjectId.isValid(requestedBranchId)) {
                        return NextResponse.json({ success: false, message: "Invalid branch ID" }, { status: 400 });
                    }
                    if (!organizationBranches.some((branchId) => branchId.toString() === requestedBranchId)) {
                        return NextResponse.json({ success: false, message: "Forbidden: Branch is outside your organization" }, { status: 403 });
                    }
                    filter.branchId = new Types.ObjectId(requestedBranchId);
                } else {
                    filter.branchId = { $in: organizationBranches };
                }
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

    async getAdmissionById(id: string, request?: NextRequest): Promise<NextResponse> {
        try {
            await dbConnect();
            let authResult;
            if (request) {
                const auth = await authorizeRequest(request, PERMISSION_KEYS.ADMISSION_VIEW, "Admission");
                if (!auth.isAuthorized) return auth.response;
                authResult = auth;
            }

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

            if (authResult && isNurseRole(authResult.context.roleName)) {
                const nurseId = authResult.context.userId.toString();
                const assigned = (admission.assignedNurses ?? []).some((nurse) =>
                    ((nurse as PopulatedEntity)?._id ?? nurse)?.toString() === nurseId
                );
                if (!assigned) {
                    return NextResponse.json(
                        { success: false, message: "Admission not found" },
                        { status: 404 }
                    );
                }
            }

            // Relational check
            if (authResult && !isNurseRole(authResult.context.roleName) && authResult.grant.relScope === "OWN") {
                const docId = (admission.doctorId as PopulatedEntity)?._id?.toString() || admission.doctorId?.toString();
                if (docId !== authResult.context.userId.toString()) {
                    return NextResponse.json(
                        { success: false, message: "Forbidden: You can only view your own admissions" },
                        { status: 403 }
                    );
                }
            }

            // Organizational check
            if (authResult?.context.branchId && authResult.grant.orgScope === "BRANCH") {
                const admBranch = (admission.branchId as PopulatedEntity)?._id?.toString() || admission.branchId?.toString();
                if (admBranch && admBranch !== authResult.context.branchId.toString()) {
                    return NextResponse.json(
                        { success: false, message: "Forbidden: Admission belongs to another branch" },
                        { status: 403 }
                    );
                }
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

    async getDischargeDraft(id: string, request: NextRequest): Promise<NextResponse> {
        try {
            await dbConnect();
            const auth = await authorizeRequest(request, "admissions.discharge:view", "Admission");
            if (!auth.isAuthorized) return auth.response;
            if (!Types.ObjectId.isValid(id)) return NextResponse.json({ success: false, message: "Invalid admission ID." }, { status: 400 });

            const admission = await this.admissionService.getAdmissionById(new Types.ObjectId(id));
            if (!admission) return NextResponse.json({ success: false, message: "Admission not found." }, { status: 404 });
            if (!(["ADMITTED", "TRANSFERRED"] as string[]).includes(admission.status)) {
                return NextResponse.json({ success: false, message: "Only an active admission can be prepared for discharge." }, { status: 409 });
            }
            if (isNurseRole(auth.context.roleName)) {
                const assigned = (admission.assignedNurses ?? []).some((nurse) => idOfValue(nurse) === auth.context.userId.toString());
                if (!assigned) return NextResponse.json({ success: false, message: "Admission not found." }, { status: 404 });
            }
            if (!isNurseRole(auth.context.roleName) && auth.grant.relScope === "OWN") {
                const doctorId = idOfValue(admission.doctorId);
                if (doctorId !== auth.context.userId.toString()) return NextResponse.json({ success: false, message: "You can only prepare your own admissions for discharge." }, { status: 403 });
            }
            if (auth.grant.orgScope === "BRANCH") {
                const admissionBranch = idOfValue(admission.branchId);
                if (!auth.context.branchId || admissionBranch !== auth.context.branchId.toString()) {
                    return NextResponse.json({ success: false, message: "Admission belongs to another branch." }, { status: 403 });
                }
            }

            const hospital = await getHospitalProfile();
            const [summary, details] = await Promise.all([
                admission.dischargeSummary?.trim()
                    ? Promise.resolve(admission.dischargeSummary)
                    : buildAutoTreatmentSummary(new Types.ObjectId(id), hospital.timeZone),
                buildDischargeFullFile(admission, hospital.timeZone),
            ]);
            return NextResponse.json({ success: true, data: { summary, details } });
        } catch (error) {
            const message = error instanceof Error ? error.message : "Unable to prepare the discharge summary.";
            return NextResponse.json({ success: false, message }, { status: 500 });
        }
    }

    async getDischargeTreatmentSummary(id: string, request: NextRequest): Promise<NextResponse> {
        try {
            await dbConnect();
            const auth = await authorizeRequest(request, "admissions.summary:print", "Admission");
            if (!auth.isAuthorized) return auth.response;
            if (!Types.ObjectId.isValid(id)) return NextResponse.json({ success: false, message: "Invalid admission ID." }, { status: 400 });

            const admission = await this.admissionService.getAdmissionById(new Types.ObjectId(id));
            if (!admission) return NextResponse.json({ success: false, message: "Admission not found." }, { status: 404 });
            if (isNurseRole(auth.context.roleName)) {
                const assigned = (admission.assignedNurses ?? []).some((nurse) => idOfValue(nurse) === auth.context.userId.toString());
                if (!assigned) return NextResponse.json({ success: false, message: "Admission not found." }, { status: 404 });
            }
            if (!isNurseRole(auth.context.roleName) && auth.grant.relScope === "OWN" && idOfValue(admission.doctorId) !== auth.context.userId.toString()) {
                return NextResponse.json({ success: false, message: "You can only view your own admissions." }, { status: 403 });
            }

            const branchId = idOfValue(admission.branchId);
            if (auth.grant.orgScope === "BRANCH" && (!auth.context.branchId || branchId !== auth.context.branchId.toString())) {
                return NextResponse.json({ success: false, message: "Admission belongs to another branch." }, { status: 403 });
            }
            if (auth.grant.orgScope === "ORGANIZATION") {
                if (!auth.context.organizationId || !branchId) return NextResponse.json({ success: false, message: "Admission is outside your organization." }, { status: 403 });
                const branchRecord = (admission.branchId as PopulatedEntity)?.headQuarter !== undefined
                    ? admission.branchId
                    : await Organization.findById(branchId).select("headQuarter").lean();
                const organizationId = auth.context.organizationId.toString();
                if (branchId !== organizationId && idOfValue((branchRecord as PopulatedEntity | null)?.headQuarter) !== organizationId) {
                    return NextResponse.json({ success: false, message: "Admission is outside your organization." }, { status: 403 });
                }
            }

            const hospital = await getHospitalProfile();
            const summary = await buildAutoTreatmentSummary(new Types.ObjectId(id), hospital.timeZone);
            return NextResponse.json({ success: true, data: { summary } });
        } catch (error) {
            const message = error instanceof Error ? error.message : "Unable to prepare the treatment summary.";
            return NextResponse.json({ success: false, message }, { status: 500 });
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

            if (auth.context.branchId && auth.grant.orgScope === "BRANCH") {
                const admBranch = (existing.branchId as PopulatedEntity)?._id?.toString() || existing.branchId?.toString();
                if (admBranch && admBranch !== auth.context.branchId.toString()) {
                    return NextResponse.json(
                        { success: false, message: "Forbidden: Admission belongs to another branch" },
                        { status: 403 }
                    );
                }
            }

            const admission = await this.admissionService.transferPatient(data);

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

            if (existing.status === "DISCHARGED") {
                return NextResponse.json({ success: false, message: "This admission has already been discharged." }, { status: 409 });
            }
            if (data.dischargeSummary !== undefined && typeof data.dischargeSummary !== "string") {
                return NextResponse.json({ success: false, message: "Discharge summary must be text." }, { status: 400 });
            }
            if ((data.dischargeSummary?.length ?? 0) > 12000) {
                return NextResponse.json({ success: false, message: "Discharge summary must be 12,000 characters or fewer." }, { status: 400 });
            }
            if (!data.dischargeSummary?.trim()) {
                const hospital = await getHospitalProfile();
                data.dischargeSummary = await buildAutoTreatmentSummary(new Types.ObjectId(data.admissionId), hospital.timeZone);
            }

            const dischargeInstant = data.dischargeDate ? new Date(data.dischargeDate) : new Date();
            if (Number.isNaN(dischargeInstant.getTime())) {
                return NextResponse.json({ success: false, message: "Invalid discharge date and time." }, { status: 400 });
            }
            const admissionInstant = new Date(existing.admissionDate);
            if (dischargeInstant.getTime() < admissionInstant.getTime()) {
                return NextResponse.json({ success: false, message: "Discharge date and time cannot be earlier than admission." }, { status: 400 });
            }
            data.dischargeDate = dischargeInstant.toISOString();

            if (!isNurseRole(auth.context.roleName) && auth.grant.relScope === "OWN") {
                const docId = (existing.doctorId as PopulatedEntity)?._id?.toString() || existing.doctorId?.toString();
                if (docId !== auth.context.userId.toString()) {
                    return NextResponse.json(
                        { success: false, message: "Forbidden: You can only discharge your own admitted patients" },
                        { status: 403 }
                    );
                }
            }

            if (auth.context.branchId && auth.grant.orgScope === "BRANCH") {
                const admBranch = (existing.branchId as PopulatedEntity)?._id?.toString() || existing.branchId?.toString();
                if (admBranch && admBranch !== auth.context.branchId.toString()) {
                    return NextResponse.json(
                        { success: false, message: "Forbidden: Admission belongs to another branch" },
                        { status: 403 }
                    );
                }
            }

            // A nurse may only discharge an active stay assigned to them. The
            // daily record ledger must also be complete and finalized; this
            // keeps the existing discharge policy intact without trusting a
            // client-side patient selection.
            if (isNurseRole(auth.context.roleName)) {
                const assigned = (existing.assignedNurses ?? []).some((nurse) =>
                    ((nurse as PopulatedEntity)?._id ?? nurse)?.toString() === auth.context.userId.toString()
                );
                if (!assigned || !["ADMITTED", "TRANSFERRED"].includes(existing.status)) {
                    return NextResponse.json({ success: false, message: "Forbidden: You can only discharge a patient assigned to you" }, { status: 403 });
                }
                const hospital = await getHospitalProfile();
                const expectedDays = stayDayNumber(new Date(existing.admissionDate), dischargeInstant, hospital.timeZone);
                const finalized = await DailyNursingRecord.find({ admissionId: existing._id, status: "Final" }).select("nursingDay").lean();
                const completedDays = new Set(finalized.map((record) => record.nursingDay));
                const missing = Array.from({ length: expectedDays }, (_, index) => index + 1).filter((day) => !completedDays.has(day));
                if (missing.length) {
                    return NextResponse.json({ success: false, message: `Final daily nursing records are required before discharge (missing Day ${missing.join(", Day ")})` }, { status: 400 });
                }
            }

            const admission = await this.admissionService.dischargePatient(data);

            return NextResponse.json(
                { success: true, message: "Patient discharged successfully", data: admission },
                { status: 200 }
            );
        } catch (error: unknown) {
            const err = error as { statusCode?: number; message?: string };
            const message = err?.message || (error instanceof Error ? error.message : "Failed to discharge patient");
            return NextResponse.json(
                { success: false, message },
                { status: err?.statusCode ?? 500 }
            );
        }
    }

    // POST /api/admission/discharge-request — doctor flags an active stay so
    // nursing can start the discharge and billing handover. Not the real
    // discharge: the stay stays ADMITTED/TRANSFERRED.
    async requestDischarge(request: NextRequest): Promise<NextResponse> {
        try {
            await dbConnect();
            const auth = await authorizeRequest(request, PERMISSION_KEYS.CLINICAL_RECORD_UPDATE, "Admission");
            if (!auth.isAuthorized) return auth.response;

            const data: DischargeRequestDto = await request.json();
            if (!data.admissionId || !Types.ObjectId.isValid(data.admissionId.toString())) {
                return NextResponse.json(
                    { success: false, message: "Valid admission ID is required" },
                    { status: 400 }
                );
            }

            const existing = await this.admissionService.getAdmissionById(new Types.ObjectId(data.admissionId.toString()));
            if (!existing) {
                return NextResponse.json({ success: false, message: "Admission not found" }, { status: 404 });
            }

            const accessError = dischargeFlagAccessError(auth.context, existing);
            if (accessError) {
                return NextResponse.json({ success: false, message: accessError }, { status: 403 });
            }

            if (auth.context.branchId && auth.grant.orgScope === "BRANCH") {
                const admBranch = (existing.branchId as PopulatedEntity)?._id?.toString() || existing.branchId?.toString();
                if (admBranch && admBranch !== auth.context.branchId.toString()) {
                    return NextResponse.json(
                        { success: false, message: "Forbidden: Admission belongs to another branch" },
                        { status: 403 }
                    );
                }
            }

            const admission = await this.admissionService.requestDischarge(data.admissionId, data.notes, auth.context.userId);

            return NextResponse.json(
                { success: true, message: "Discharge requested. Nursing will take over the discharge process.", data: admission },
                { status: 200 }
            );
        } catch (error: unknown) {
            const err = error as { statusCode?: number; message?: string };
            const message = err?.message || (error instanceof Error ? error.message : "Failed to request discharge");
            return NextResponse.json(
                { success: false, message },
                { status: err?.statusCode ?? 500 }
            );
        }
    }

    // PUT /api/admission/discharge-request — withdraw the flag before nursing
    // takes over (doctor may correct a premature request).
    async withdrawDischargeRequest(request: NextRequest): Promise<NextResponse> {
        try {
            await dbConnect();
            const auth = await authorizeRequest(request, PERMISSION_KEYS.CLINICAL_RECORD_UPDATE, "Admission");
            if (!auth.isAuthorized) return auth.response;

            const data: DischargeRequestDto = await request.json();
            if (!data.admissionId || !Types.ObjectId.isValid(data.admissionId.toString())) {
                return NextResponse.json(
                    { success: false, message: "Valid admission ID is required" },
                    { status: 400 }
                );
            }

            const existing = await this.admissionService.getAdmissionById(new Types.ObjectId(data.admissionId.toString()));
            if (!existing) {
                return NextResponse.json({ success: false, message: "Admission not found" }, { status: 404 });
            }

            const accessError = dischargeFlagAccessError(auth.context, existing);
            if (accessError) {
                return NextResponse.json({ success: false, message: accessError }, { status: 403 });
            }

            if (auth.context.branchId && auth.grant.orgScope === "BRANCH") {
                const admBranch = (existing.branchId as PopulatedEntity)?._id?.toString() || existing.branchId?.toString();
                if (admBranch && admBranch !== auth.context.branchId.toString()) {
                    return NextResponse.json(
                        { success: false, message: "Forbidden: Admission belongs to another branch" },
                        { status: 403 }
                    );
                }
            }

            const admission = await this.admissionService.withdrawDischargeRequest(data.admissionId);

            return NextResponse.json(
                { success: true, message: "Discharge request withdrawn", data: admission },
                { status: 200 }
            );
        } catch (error: unknown) {
            const err = error as { statusCode?: number; message?: string };
            const message = err?.message || (error instanceof Error ? error.message : "Failed to withdraw the discharge request");
            return NextResponse.json(
                { success: false, message },
                { status: err?.statusCode ?? 500 }
            );
        }
    }

    // POST /api/admission/billing-request — nurse hands a flagged stay to the
    // accountant; requires an expected discharge date and an assigned nurse.
    async requestBilling(request: NextRequest): Promise<NextResponse> {
        try {
            await dbConnect();
            const auth = await authorizeRequest(request, "nursing.patients:update", "Admission");
            if (!auth.isAuthorized) return auth.response;

            const data: BillingRequestDto = await request.json();
            if (!data.admissionId || !Types.ObjectId.isValid(data.admissionId.toString())) {
                return NextResponse.json(
                    { success: false, message: "Valid admission ID is required" },
                    { status: 400 }
                );
            }

            const existing = await this.admissionService.getAdmissionById(new Types.ObjectId(data.admissionId.toString()));
            if (!existing) {
                return NextResponse.json({ success: false, message: "Admission not found" }, { status: 404 });
            }

            const accessError = billingAccessError(auth.context, existing);
            if (accessError) {
                return NextResponse.json({ success: false, message: accessError }, { status: 403 });
            }

            if (auth.context.branchId && auth.grant.orgScope === "BRANCH") {
                const admBranch = (existing.branchId as PopulatedEntity)?._id?.toString() || existing.branchId?.toString();
                if (admBranch && admBranch !== auth.context.branchId.toString()) {
                    return NextResponse.json(
                        { success: false, message: "Forbidden: Admission belongs to another branch" },
                        { status: 403 }
                    );
                }
            }

            const medicalSupplies = await NursingMedicalSupply.find({ admissionId: existing._id })
                .select("nursingDay category itemName quantity notes author recordedAt")
                .sort({ nursingDay: 1, recordedAt: 1 })
                .lean();
            const billingMedicalSupplies: IBillingMedicalSupply[] = medicalSupplies.map((supply) => ({
                nursingDay: supply.nursingDay,
                category: supply.category,
                itemName: supply.itemName,
                quantity: supply.quantity,
                ...(supply.notes ? { notes: supply.notes } : {}),
                author: supply.author,
                recordedAt: supply.recordedAt,
            }));

            const admission = await this.admissionService.requestBilling(
                data.admissionId,
                {
                    expectedDischargeAt: data.expectedDischargeAt,
                    notes: data.notes,
                    medicalSupplies: billingMedicalSupplies,
                },
                auth.context.userId
            );

            return NextResponse.json(
                { success: true, message: "Sent to billing. The accountant can now prepare the final bill.", data: admission },
                { status: 200 }
            );
        } catch (error: unknown) {
            const err = error as { statusCode?: number; message?: string };
            const message = err?.message || (error instanceof Error ? error.message : "Failed to send the stay to billing");
            return NextResponse.json(
                { success: false, message },
                { status: err?.statusCode ?? 500 }
            );
        }
    }

    // PUT /api/admission/billing-request — nurse recalls a stay from billing
    // while no invoice has been raised (Phase 3 adds the invoice check).
    async recallBilling(request: NextRequest): Promise<NextResponse> {
        try {
            await dbConnect();
            const auth = await authorizeRequest(request, "nursing.patients:update", "Admission");
            if (!auth.isAuthorized) return auth.response;

            const data: BillingRequestDto = await request.json();
            if (!data.admissionId || !Types.ObjectId.isValid(data.admissionId.toString())) {
                return NextResponse.json(
                    { success: false, message: "Valid admission ID is required" },
                    { status: 400 }
                );
            }

            const existing = await this.admissionService.getAdmissionById(new Types.ObjectId(data.admissionId.toString()));
            if (!existing) {
                return NextResponse.json({ success: false, message: "Admission not found" }, { status: 404 });
            }

            const accessError = billingAccessError(auth.context, existing);
            if (accessError) {
                return NextResponse.json({ success: false, message: accessError }, { status: 403 });
            }

            if (auth.context.branchId && auth.grant.orgScope === "BRANCH") {
                const admBranch = (existing.branchId as PopulatedEntity)?._id?.toString() || existing.branchId?.toString();
                if (admBranch && admBranch !== auth.context.branchId.toString()) {
                    return NextResponse.json(
                        { success: false, message: "Forbidden: Admission belongs to another branch" },
                        { status: 403 }
                    );
                }
            }

            const admission = await this.admissionService.recallBilling(data.admissionId);

            return NextResponse.json(
                { success: true, message: "Recalled from billing. The stay is back in your discharge list.", data: admission },
                { status: 200 }
            );
        } catch (error: unknown) {
            const err = error as { statusCode?: number; message?: string };
            const message = err?.message || (error instanceof Error ? error.message : "Failed to recall the stay from billing");
            return NextResponse.json(
                { success: false, message },
                { status: err?.statusCode ?? 500 }
            );
        }
    }

    // POST /api/admission/discharge-note — nurse appends a note to the
    // discharge case for the accountant's context.
    async addDischargeNote(request: NextRequest): Promise<NextResponse> {
        try {
            await dbConnect();
            const auth = await authorizeRequest(request, "nursing.patients:update", "Admission");
            if (!auth.isAuthorized) return auth.response;

            const data: DischargeNoteDto = await request.json();
            if (!data.admissionId || !Types.ObjectId.isValid(data.admissionId.toString())) {
                return NextResponse.json(
                    { success: false, message: "Valid admission ID is required" },
                    { status: 400 }
                );
            }
            if (!data.text || !data.text.trim()) {
                return NextResponse.json(
                    { success: false, message: "Note text is required" },
                    { status: 400 }
                );
            }

            const existing = await this.admissionService.getAdmissionById(new Types.ObjectId(data.admissionId.toString()));
            if (!existing) {
                return NextResponse.json({ success: false, message: "Admission not found" }, { status: 404 });
            }

            const accessError = billingAccessError(auth.context, existing);
            if (accessError) {
                return NextResponse.json({ success: false, message: accessError }, { status: 403 });
            }

            if (auth.context.branchId && auth.grant.orgScope === "BRANCH") {
                const admBranch = (existing.branchId as PopulatedEntity)?._id?.toString() || existing.branchId?.toString();
                if (admBranch && admBranch !== auth.context.branchId.toString()) {
                    return NextResponse.json(
                        { success: false, message: "Forbidden: Admission belongs to another branch" },
                        { status: 403 }
                    );
                }
            }

            await this.admissionService.addDischargeNote(
                data.admissionId,
                data.text,
                auth.context.userId
            );

            return NextResponse.json(
                { success: true, message: "Note added to the discharge case" },
                { status: 200 }
            );
        } catch (error: unknown) {
            const err = error as { statusCode?: number; message?: string };
            const message = err?.message || (error instanceof Error ? error.message : "Failed to add the discharge note");
            return NextResponse.json(
                { success: false, message },
                { status: err?.statusCode ?? 500 }
            );
        }
    }

    // GET /api/admission/billing-queue — the accountant's intake list: every
    // stay nursing sent to billing, annotated with any invoice already raised.
    async getBillingQueue(request: NextRequest): Promise<NextResponse> {
        try {
            await dbConnect();
            const auth = await authorizeRequest(request, PERMISSION_KEYS.BILLING_INVOICE_VIEW, "Admission");
            if (!auth.isAuthorized) return auth.response;

            const actor: BillingActor = {
                userId: auth.context.userId,
                roleName: auth.context.roleName,
                isSuperAdmin: isSuperAdminRole(auth.context.roleName),
                branchId: auth.context.branchId,
                organizationId: auth.context.organizationId,
                orgScope: auth.grant.orgScope,
            };
            const queue = await getBillingQueue(actor);

            return NextResponse.json(
                { success: true, count: queue.length, data: queue },
                { status: 200 }
            );
        } catch (error: unknown) {
            const err = error as { statusCode?: number; message?: string };
            const message = err?.message || (error instanceof Error ? error.message : "Failed to load the billing queue");
            return NextResponse.json(
                { success: false, message },
                { status: err?.statusCode ?? 500 }
            );
        }
    }

    async getAdmissionStats(request?: NextRequest): Promise<NextResponse> {
        try {
            await dbConnect();
            if (request) {
                const auth = await authorizeRequest(request, PERMISSION_KEYS.ADMISSION_VIEW, "Admission");
                if (!auth.isAuthorized) return auth.response;
            }
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

    async assignCareTeam(request: NextRequest, id: string): Promise<NextResponse> {
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

            if (auth.context.branchId && auth.grant.orgScope === "BRANCH") {
                const admBranch = (existing.branchId as PopulatedEntity)?._id?.toString() || existing.branchId?.toString();
                if (admBranch && admBranch !== auth.context.branchId.toString()) {
                    return NextResponse.json(
                        { success: false, message: "Forbidden: Admission belongs to another branch" },
                        { status: 403 }
                    );
                }
            }

            const data: AssignCareTeamDto = await request.json();
            if (data.nurseIds === undefined && data.doctorIds === undefined) {
                return NextResponse.json(
                    { success: false, message: "Provide nurseIds and/or doctorIds to assign" },
                    { status: 400 }
                );
            }

            // Heal stays recorded before branch stamping so the care team can
            // actually see them in their rosters.
            if (!existing.branchId && (auth.context.branchId || auth.context.organizationId)) {
                await this.admissionService.updateAdmission(new Types.ObjectId(id), {
                    branchId: (auth.context.branchId || auth.context.organizationId)!.toString(),
                } as UpdateAdmissionDto);
            }

            const admission = await this.admissionService.assignCareTeam(
                new Types.ObjectId(id),
                data,
                auth.context.userId
            );

            return NextResponse.json(
                { success: true, message: "Care team updated successfully", data: admission },
                { status: 200 }
            );
        } catch (error: unknown) {
            const err = error as { statusCode?: number; message?: string };
            const message = err?.message || (error instanceof Error ? error.message : "Failed to update care team");
            return NextResponse.json(
                { success: false, message },
                { status: err?.statusCode ?? 500 }
            );
        }
    }

    async updateAdmission(request: NextRequest, id: string): Promise<NextResponse> {        try {
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

            if (auth.context.branchId && auth.grant.orgScope === "BRANCH") {
                const admBranch = (existing.branchId as PopulatedEntity)?._id?.toString() || existing.branchId?.toString();
                if (admBranch && admBranch !== auth.context.branchId.toString()) {
                    return NextResponse.json(
                        { success: false, message: "Forbidden: Admission belongs to another branch" },
                        { status: 403 }
                    );
                }
            }

            const data: UpdateAdmissionDto = await request.json();

            if (data.dischargeDate !== undefined || data.admissionDate !== undefined) {
                const admissionDate = data.admissionDate !== undefined ? new Date(data.admissionDate) : new Date(existing.admissionDate);
                const dischargeDate = data.dischargeDate !== undefined
                    ? new Date(data.dischargeDate)
                    : existing.dischargeDate ? new Date(existing.dischargeDate) : null;
                if (Number.isNaN(admissionDate.getTime()) || (data.dischargeDate !== undefined && (!dischargeDate || Number.isNaN(dischargeDate.getTime())))) {
                    return NextResponse.json({ success: false, message: "Admission or discharge date is invalid." }, { status: 400 });
                }
                if (dischargeDate && dischargeDate.getTime() < admissionDate.getTime()) {
                    return NextResponse.json({ success: false, message: "Discharge date and time cannot be earlier than admission." }, { status: 400 });
                }
                if (data.dischargeDate !== undefined && dischargeDate) data.dischargeDate = dischargeDate.toISOString();
                if (data.admissionDate !== undefined) data.admissionDate = admissionDate.toISOString();
            }

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

            return NextResponse.json(
                { success: true, message: "Admission updated successfully", data: admission },
                { status: 200 }
            );
        } catch (error: unknown) {
            const err = error as { statusCode?: number; message?: string };
            const message = err?.message || (error instanceof Error ? error.message : "Failed to update admission");
            return NextResponse.json(
                { success: false, message },
                { status: err?.statusCode ?? 500 }
            );
        }
    }

    async deleteAdmission(id: string, request?: NextRequest): Promise<NextResponse> {
        try {
            await dbConnect();
            let authResult;
            if (request) {
                const auth = await authorizeRequest(request, PERMISSION_KEYS.ADMISSION_CANCEL, "Admission");
                if (!auth.isAuthorized) return auth.response;
                authResult = auth;
            }

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

            if (authResult?.context.branchId && authResult.grant.orgScope === "BRANCH") {
                const admBranch = (existing.branchId as PopulatedEntity)?._id?.toString() || existing.branchId?.toString();
                if (admBranch && admBranch !== authResult.context.branchId.toString()) {
                    return NextResponse.json(
                        { success: false, message: "Forbidden: Admission belongs to another branch" },
                        { status: 403 }
                    );
                }
            }

            await this.admissionService.deleteAdmission(new Types.ObjectId(id));

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
