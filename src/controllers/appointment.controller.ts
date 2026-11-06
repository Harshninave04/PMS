import { NextRequest, NextResponse } from "next/server";
import { AppointmentService } from "@/services/appointment.service";
import dbConnect from "@/lib/dbConnect";
import defaultPatientService, { PatientDuplicateError } from "@/services/patient.service";
import Organization from "@/models/organization.model";
import { Types } from "mongoose";
import { authorizeRequest } from "@/lib/rbac/guard";
import { PERMISSION_KEYS } from "@/types/rbac";
import { isDoctorActor } from "@/lib/rbac/doctor-scope";
import { isSuperAdminRole } from "@/lib/rbac/default-permissions";
import Doctor from "@/models/doctor.model";
import Appointment from "@/models/appointment.model";
import AppointmentFeeOverrideAudit from "@/models/appointment-fee-override-audit.model";
import DoctorSchedule, { type DayOfWeek } from "@/models/doctor-schedule.model";

interface PopulatedPatient {
    name?: string;
    contact?: string;
    uhid?: string;
}

interface PopulatedDoctor {
    _id?: Types.ObjectId;
    name?: string;
    userId?: {
        name?: string;
        email?: string;
        phone?: string;
        avatar?: string;
    };
    departmentId?: {
        name?: string;
        code?: string;
        location?: string;
    };
}

interface AppointmentItem {
    _id?: Types.ObjectId;
    patientId?: PopulatedPatient;
    doctorId?: PopulatedDoctor | Types.ObjectId;
    branchId?: Types.ObjectId;
    tokenNumber?: string;
    reason?: string;
    [key: string]: unknown;
}

type RouteParams = { params: { id: string } | Promise<{ id: string }> };

export const AppointmentController = {
    async create(req: NextRequest): Promise<NextResponse> {
        try {
            await dbConnect();
            const auth = await authorizeRequest(req, PERMISSION_KEYS.APPOINTMENT_CREATE, "Appointment");
            if (!auth.isAuthorized) return auth.response;

            const body = await req.json();
            const isAdmin = isSuperAdminRole(auth.context.roleName);

            // Enforce branch multi-tenancy: if user has branchId and is not GLOBAL, lock branchId
            if (auth.context.branchId && auth.grant.orgScope !== "GLOBAL") {
                body.branchId = auth.context.branchId;
            }

            // Enforce doctor relational constraint: doctor with OWN scope can only book for themselves
            if ((auth.grant.relScope === "OWN" || isDoctorActor(auth.context)) && auth.context.doctorProfileId) {
                body.doctorId = auth.context.doctorProfileId.toString();
            }

            const doctor = await Doctor.findById(body.doctorId).select("consultationFee status").lean();
            if (!doctor || doctor.status !== "ACTIVE") {
                return NextResponse.json({ success: false, error: "Select an active doctor." }, { status: 400 });
            }
            const configuredFee = Number(doctor.consultationFee ?? 0);
            const feeOverrideRequested = body.consultationFee !== undefined && body.consultationFee !== null && body.consultationFee !== "";
            if (feeOverrideRequested && !isAdmin) {
                return NextResponse.json({ success: false, error: "Only an administrator may override the consultation fee." }, { status: 403 });
            }
            const overriddenFee = feeOverrideRequested ? Number(body.consultationFee) : configuredFee;
            if (!Number.isFinite(overriddenFee) || overriddenFee < 0) {
                return NextResponse.json({ success: false, error: "Consultation fee must be a valid non-negative amount." }, { status: 400 });
            }
            body.consultationFee = overriddenFee;

            if (body.triage && typeof body.triage === "object") {
                const triage = body.triage as Record<string, unknown>;
                const ranges: Record<string, [number, number]> = { temperature: [30, 45], pulse: [20, 250], spo2: [50, 100], weight: [0.3, 400] };
                for (const [key, [min, max]] of Object.entries(ranges)) {
                    if (triage[key] !== undefined && (!Number.isFinite(Number(triage[key])) || Number(triage[key]) < min || Number(triage[key]) > max)) {
                        return NextResponse.json({ success: false, error: `Triage ${key} is outside the valid range.` }, { status: 400 });
                    }
                }
                if (triage.bloodPressure !== undefined && !/^\s*(\d{2,3})\s*\/\s*(\d{2,3})\s*$/.test(String(triage.bloodPressure))) {
                    return NextResponse.json({ success: false, error: "Blood pressure must use systolic/diastolic format." }, { status: 400 });
                }
                if (triage.bloodPressure !== undefined) {
                    const [systolic, diastolic] = String(triage.bloodPressure).split("/").map(Number);
                    if (systolic < 40 || systolic > 300 || diastolic < 20 || diastolic > 200) {
                        return NextResponse.json({ success: false, error: "Blood pressure values are outside the valid range." }, { status: 400 });
                    }
                }
            }

            const emergencyBooking = body.priority === "EMERGENCY" || body.type === "EMERGENCY";
            if (!emergencyBooking) {
                const appointmentDate = new Date(body.appointmentDate);
                if (!Number.isFinite(appointmentDate.getTime())) {
                    return NextResponse.json({ success: false, error: "Enter a valid appointment date." }, { status: 400 });
                }
                const dayNames: DayOfWeek[] = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
                const schedules = await DoctorSchedule.find({ doctorId: doctor._id, dayOfWeek: dayNames[appointmentDate.getDay()] }).lean();
                const schedule = schedules.find((item) => item.status === "ACTIVE");
                if (!schedule) {
                    return NextResponse.json({ success: false, error: "The doctor is unavailable on the selected date." }, { status: 409 });
                }
                if (body.appointmentTime) {
                    const [startHour, startMinute] = schedule.startTime.split(":").map(Number);
                    const [endHour, endMinute] = schedule.endTime.split(":").map(Number);
                    const [slotHour, slotMinute] = String(body.appointmentTime).split(":").map(Number);
                    const start = startHour * 60 + startMinute;
                    const end = endHour * 60 + endMinute;
                    const slot = slotHour * 60 + slotMinute;
                    const duration = Math.max(5, schedule.slotDurationMinutes || 15);
                    if (!/^\d{2}:\d{2}$/.test(String(body.appointmentTime)) || !Number.isFinite(slot) || slot < start || slot + duration > end || (slot - start) % duration !== 0) {
                        return NextResponse.json({ success: false, error: "Choose a valid time slot from the doctor’s schedule." }, { status: 400 });
                    }
                    const dayStart = new Date(appointmentDate);
                    dayStart.setHours(0, 0, 0, 0);
                    const dayEnd = new Date(dayStart);
                    dayEnd.setDate(dayEnd.getDate() + 1);
                    const existingSlot = await Appointment.findOne({
                        doctorId: doctor._id,
                        appointmentDate: { $gte: dayStart, $lt: dayEnd },
                        appointmentTime: body.appointmentTime,
                        status: { $nin: ["CANCELLED", "NO_SHOW"] },
                    }).select("_id").lean();
                    if (existingSlot) {
                        return NextResponse.json({ success: false, error: "That time slot has just been booked. Choose another slot." }, { status: 409 });
                    }
                }
            }

            // Support quick patient creation if patient details provided without patientId
            const emergencyRegistration = body.priority === "EMERGENCY" || body.type === "EMERGENCY";
            if (!body.patientId && (body.patientName || body.contact || emergencyRegistration)) {
                if (!emergencyRegistration && (!String(body.patientName || "").trim() || !String(body.contact || "").trim())) {
                    return NextResponse.json(
                        { success: false, error: "Patient name and phone are required" },
                        { status: 400 }
                    );
                }
                let defaultBranch = auth.context.branchId;
                if (!defaultBranch) {
                    const org = await Organization.findOne();
                    defaultBranch = org?._id ?? new Types.ObjectId("000000000000000000000000");
                }
                const patientBranchId = defaultBranch ?? new Types.ObjectId("000000000000000000000000");
                const newPatient = await defaultPatientService.createPatient({
                    name: String(body.patientName || "").trim() || (emergencyRegistration ? "Unknown" : ""),
                    contact: String(body.contact || "").trim(),
                    age: body.patientAge !== undefined && Number.isFinite(Number(body.patientAge)) ? Number(body.patientAge) : emergencyRegistration ? 0 : 30,
                    gender: body.patientGender || "OTHER",
                    bloodGroup: body.patientBloodGroup || undefined,
                    address: body.patientAddress || "Walk-in Registration",
                    emergencyContact: String(body.contact || "").trim() || "Not provided",
                    branchId: patientBranchId,
                    emergencyRegistration,
                    confirmSharedPhone: body.confirmSharedPhone === true,
                    relatedPatientId: body.relatedPatientId,
                    relation: body.relation,
                }, auth.context.userId);
                body.patientId = newPatient._id;
            }

            if (!body.patientId || !body.doctorId || !body.appointmentDate) {
                return NextResponse.json(
                    { success: false, error: "Patient, Doctor, and Date are required" },
                    { status: 400 }
                );
            }

            const appointment = await AppointmentService.createAppointment(body);
            if (isAdmin && feeOverrideRequested && overriddenFee !== configuredFee) {
                await AppointmentFeeOverrideAudit.create({
                    appointmentId: appointment?._id,
                    doctorId: doctor._id,
                    actorId: auth.context.userId,
                    roleName: auth.context.roleName,
                    configuredFee,
                    overriddenFee,
                });
            }
            return NextResponse.json({ success: true, data: appointment }, { status: 201 });
        } catch (error: unknown) {
            if (error instanceof PatientDuplicateError) {
                return NextResponse.json(
                    {
                        success: false,
                        error: error.message,
                        matchingPatients: error.matchingPatients,
                        canConfirmSharedPhone: error.canConfirmSharedPhone,
                    },
                    { status: 409 }
                );
            }
            const message = error instanceof Error ? error.message : "Failed to create appointment";
            return NextResponse.json({ success: false, error: message }, { status: 400 });
        }
    },

    async getAll(req: NextRequest): Promise<NextResponse> {
        try {
            await dbConnect();
            const auth = await authorizeRequest(req, PERMISSION_KEYS.APPOINTMENT_VIEW, "Appointment");
            if (!auth.isAuthorized) return auth.response;

            const { searchParams } = new URL(req.url);
            const status = searchParams.get("status") || undefined;
            const type = searchParams.get("type") || undefined;
            const requestedDoctorId = searchParams.get("doctorId");
            const requestedBranchId = searchParams.get("branchId");
            const date = searchParams.get("date") || undefined;
            const search = searchParams.get("search")?.toLowerCase().trim();

            // Enforce relational scope: Doctor with OWN scope can ONLY see their own appointments
            let effectiveDoctorId: string | undefined = requestedDoctorId || undefined;
            if (auth.grant.relScope === "OWN" || isDoctorActor(auth.context)) {
                effectiveDoctorId = (auth.context.doctorProfileId || auth.context.userId).toString();
            }

            // Enforce organizational scope: Branch user can only see appointments in their branch
            let effectiveBranchId: string | undefined = requestedBranchId || undefined;
            if (auth.context.branchId && auth.grant.orgScope === "BRANCH") {
                effectiveBranchId = auth.context.branchId.toString();
            }

            let appointments = (await AppointmentService.getAllAppointments({
                status,
                type,
                doctorId: effectiveDoctorId,
                branchId: effectiveBranchId,
                date
            })) as AppointmentItem[];

            if (search) {
                appointments = appointments.filter((apt: AppointmentItem) => {
                    const pName = apt.patientId?.name?.toLowerCase() || "";
                    const pContact = apt.patientId?.contact?.toLowerCase() || "";
                    const pUhid = apt.patientId?.uhid?.toLowerCase() || "";
                    const doctorObj = apt.doctorId as PopulatedDoctor | undefined;
                    const dName = (doctorObj?.userId?.name || doctorObj?.name || "").toLowerCase();
                    const token = apt.tokenNumber?.toLowerCase() || "";
                    const reason = apt.reason?.toLowerCase() || "";
                    return (
                        pName.includes(search) ||
                        pContact.includes(search) ||
                        pUhid.includes(search) ||
                        dName.includes(search) ||
                        token.includes(search) ||
                        reason.includes(search)
                    );
                });
            }

            return NextResponse.json({ success: true, count: appointments.length, data: appointments });
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Failed to fetch appointments";
            return NextResponse.json({ success: false, error: message }, { status: 400 });
        }
    },

    async getById(req: NextRequest, { params }: RouteParams): Promise<NextResponse> {
        try {
            await dbConnect();
            const auth = await authorizeRequest(req, PERMISSION_KEYS.APPOINTMENT_VIEW, "Appointment");
            if (!auth.isAuthorized) return auth.response;

            const resolvedParams = await params;
            const appointment = (await AppointmentService.getAppointmentById(resolvedParams.id)) as AppointmentItem | null;
            if (!appointment) {
                return NextResponse.json({ success: false, error: "Appointment not found" }, { status: 404 });
            }

            // Relational boundary check
            if (auth.grant.relScope === "OWN" || isDoctorActor(auth.context)) {
                const rawDoc = appointment.doctorId;
                const docId = rawDoc && typeof rawDoc === "object" && "_id" in rawDoc && rawDoc._id
                    ? rawDoc._id.toString()
                    : rawDoc?.toString();
                const myDocId = (auth.context.doctorProfileId || auth.context.userId).toString();
                if (docId !== myDocId) {
                    return NextResponse.json(
                        { success: false, error: "Forbidden: You can only access your own appointments" },
                        { status: 403 }
                    );
                }
            }

            // Organizational boundary check
            if (auth.context.branchId && auth.grant.orgScope === "BRANCH") {
                const apptBranch = appointment.branchId ? appointment.branchId.toString() : null;
                if (apptBranch && apptBranch !== auth.context.branchId.toString()) {
                    return NextResponse.json(
                        { success: false, error: "Forbidden: Appointment belongs to another branch" },
                        { status: 403 }
                    );
                }
            }

            return NextResponse.json({ success: true, data: appointment });
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Failed to fetch appointment";
            return NextResponse.json({ success: false, error: message }, { status: 400 });
        }
    },

    async update(req: NextRequest, { params }: RouteParams): Promise<NextResponse> {
        try {
            await dbConnect();
            const auth = await authorizeRequest(req, PERMISSION_KEYS.APPOINTMENT_UPDATE, "Appointment");
            if (!auth.isAuthorized) return auth.response;

            const resolvedParams = await params;
            const existing = (await AppointmentService.getAppointmentById(resolvedParams.id)) as AppointmentItem | null;
            if (!existing) {
                return NextResponse.json({ success: false, error: "Appointment not found" }, { status: 404 });
            }

            // Relational boundary check
            if (auth.grant.relScope === "OWN" || isDoctorActor(auth.context)) {
                const rawDoc = existing.doctorId;
                const docId = rawDoc && typeof rawDoc === "object" && "_id" in rawDoc && rawDoc._id
                    ? rawDoc._id.toString()
                    : rawDoc?.toString();
                const myDocId = (auth.context.doctorProfileId || auth.context.userId).toString();
                if (docId !== myDocId) {
                    return NextResponse.json(
                        { success: false, error: "Forbidden: You can only update your own appointments" },
                        { status: 403 }
                    );
                }
            }

            // Organizational boundary check
            if (auth.context.branchId && auth.grant.orgScope === "BRANCH") {
                const apptBranch = existing.branchId ? existing.branchId.toString() : null;
                if (apptBranch && apptBranch !== auth.context.branchId.toString()) {
                    return NextResponse.json(
                        { success: false, error: "Forbidden: Appointment belongs to another branch" },
                        { status: 403 }
                    );
                }
            }

            const body = await req.json();
            const updated = await AppointmentService.updateAppointment(resolvedParams.id, body);
            return NextResponse.json({ success: true, data: updated });
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Failed to update appointment";
            return NextResponse.json({ success: false, error: message }, { status: 400 });
        }
    },

    async delete(req: NextRequest, { params }: RouteParams): Promise<NextResponse> {
        try {
            await dbConnect();
            const auth = await authorizeRequest(req, PERMISSION_KEYS.APPOINTMENT_CANCEL, "Appointment");
            if (!auth.isAuthorized) return auth.response;

            const resolvedParams = await params;
            const existing = (await AppointmentService.getAppointmentById(resolvedParams.id)) as AppointmentItem | null;
            if (!existing) {
                return NextResponse.json({ success: false, error: "Appointment not found" }, { status: 404 });
            }

            // Relational boundary check
            if (auth.grant.relScope === "OWN" || isDoctorActor(auth.context)) {
                const rawDoc = existing.doctorId;
                const docId = rawDoc && typeof rawDoc === "object" && "_id" in rawDoc && rawDoc._id
                    ? rawDoc._id.toString()
                    : rawDoc?.toString();
                const myDocId = (auth.context.doctorProfileId || auth.context.userId).toString();
                if (docId !== myDocId) {
                    return NextResponse.json(
                        { success: false, error: "Forbidden: You can only cancel your own appointments" },
                        { status: 403 }
                    );
                }
            }

            // Organizational boundary check
            if (auth.context.branchId && auth.grant.orgScope === "BRANCH") {
                const apptBranch = existing.branchId ? existing.branchId.toString() : null;
                if (apptBranch && apptBranch !== auth.context.branchId.toString()) {
                    return NextResponse.json(
                        { success: false, error: "Forbidden: Appointment belongs to another branch" },
                        { status: 403 }
                    );
                }
            }

            await AppointmentService.deleteAppointment(resolvedParams.id);
            return NextResponse.json({ success: true, data: {} });
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Failed to delete appointment";
            return NextResponse.json({ success: false, error: message }, { status: 400 });
        }
    }
};
