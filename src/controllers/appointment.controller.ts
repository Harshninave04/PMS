import { NextRequest, NextResponse } from "next/server";
import { AppointmentService } from "@/services/appointment.service";
import dbConnect from "@/lib/dbConnect";
import Patient from "@/models/patient.model";
import Organization from "@/models/organization.model";
import { Types } from "mongoose";
import { authorizeRequest } from "@/lib/rbac/guard";
import { PERMISSION_KEYS } from "@/types/rbac";

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

            // Enforce branch multi-tenancy: if user has branchId and is not GLOBAL, lock branchId
            if (auth.context.branchId && auth.grant.orgScope !== "GLOBAL") {
                body.branchId = auth.context.branchId;
            }

            // Enforce doctor relational constraint: doctor with OWN scope can only book for themselves
            if (auth.grant.relScope === "OWN" && auth.context.doctorProfileId) {
                body.doctorId = auth.context.doctorProfileId.toString();
            }

            // Support quick patient creation if patient details provided without patientId
            if (!body.patientId && body.patientName && body.contact) {
                let defaultBranch = auth.context.branchId;
                if (!defaultBranch) {
                    const org = await Organization.findOne();
                    defaultBranch = org?._id || new Types.ObjectId("000000000000000000000000");
                }
                const newPatient = await Patient.create({
                    name: body.patientName.trim(),
                    contact: body.contact.trim(),
                    age: Number(body.patientAge) || 30,
                    gender: body.patientGender || "OTHER",
                    bloodGroup: body.patientBloodGroup || "O+",
                    address: body.patientAddress || "Walk-in Registration",
                    emergencyContact: body.contact.trim(),
                    branchId: defaultBranch
                });
                body.patientId = newPatient._id;
            }

            if (!body.patientId || !body.doctorId || !body.appointmentDate || !body.appointmentTime) {
                return NextResponse.json(
                    { success: false, error: "Patient, Doctor, Date, and Time are required" },
                    { status: 400 }
                );
            }

            const appointment = await AppointmentService.createAppointment(body);
            return NextResponse.json({ success: true, data: appointment }, { status: 201 });
        } catch (error: unknown) {
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
            if (auth.grant.relScope === "OWN") {
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
            if (auth.grant.relScope === "OWN") {
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
            if (auth.grant.relScope === "OWN") {
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
            if (auth.grant.relScope === "OWN") {
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
