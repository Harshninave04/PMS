import Appointment from "@/models/appointment.model";
import OpdTokenCounter from "@/models/opd-token-counter.model";
import Patient from "@/models/patient.model";
import Doctor from "@/models/doctor.model";
import User from "@/models/user.model";
import Department from "@/models/department.model";
import Organization from "@/models/organization.model";
import { IAppointment } from "@/interfaces/appointment.interface";
import { Types } from "mongoose";

// Normalizes any appointment date to its local day window and readable day key.
function dayWindow(input: Date | string) {
    const start = new Date(input);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    const day = [
        start.getFullYear(),
        String(start.getMonth() + 1).padStart(2, "0"),
        String(start.getDate()).padStart(2, "0"),
    ].join("-");
    return { start, end, day };
}

export const AppointmentService = {
    async createAppointment(data: any) {
        // Register dependent models
        if (!Patient) {}
        if (!Doctor) {}
        if (!User) {}
        if (!Department) {}

        // Resolve branchId if not provided
        if (!data.branchId || !Types.ObjectId.isValid(data.branchId)) {
            const org = await Organization.findOne();
            if (org) {
                data.branchId = org._id;
            }
        }

        // Auto-generate daily token number per doctor (T-001, race-safe)
        if (!data.tokenNumber && data.doctorId) {
            data.tokenNumber = await this.generateTokenNumber(
                data.doctorId,
                data.appointmentDate || new Date()
            );
        }

        const appointment = await Appointment.create(data);
        return await this.getAppointmentById(appointment._id.toString());
    },

    // Reserves the next token for a doctor on a given day via an atomic counter,
    // seeded from any tokens already issued that day so sequences never restart.
    async generateTokenNumber(doctorId: Types.ObjectId | string, appointmentDate: Date | string) {
        const { start, end, day } = dayWindow(appointmentDate);

        const issued = await Appointment.find({
            doctorId,
            appointmentDate: { $gte: start, $lt: end },
            tokenNumber: { $regex: /^T-\d+$/ }
        }).select("tokenNumber").lean();

        const maxIssued = issued.reduce((max, doc) => {
            const value = Number(String(doc.tokenNumber).slice(2));
            return Number.isFinite(value) && value > max ? value : max;
        }, 0);

        for (let attempt = 1; attempt <= 5; attempt++) {
            try {
                await OpdTokenCounter.updateOne(
                    { doctorId, day },
                    { $max: { seq: maxIssued } },
                    { upsert: true }
                );
                const counter = await OpdTokenCounter.findOneAndUpdate(
                    { doctorId, day },
                    { $inc: { seq: 1 } },
                    { new: true, upsert: true }
                );
                return `T-${String(counter.seq).padStart(3, "0")}`;
            } catch (error: any) {
                // Concurrent first-time upserts can collide on the unique index; retry.
                if (error?.code !== 11000 || attempt === 5) throw error;
            }
        }

        throw new Error("Unable to generate appointment token");
    },

    async getAllAppointments(filter: any = {}) {
        if (!Patient) {}
        if (!Doctor) {}
        if (!User) {}
        if (!Department) {}
        const query: any = {};
        if (filter.status && filter.status !== 'ALL') query.status = filter.status;
        if (filter.type && filter.type !== 'ALL') query.type = filter.type;
        if (filter.doctorId && Types.ObjectId.isValid(filter.doctorId)) query.doctorId = filter.doctorId;
        if (filter.branchId && Types.ObjectId.isValid(filter.branchId)) query.branchId = filter.branchId;

        if (filter.date) {
            const start = new Date(filter.date);
            start.setHours(0, 0, 0, 0);
            const end = new Date(start);
            end.setDate(end.getDate() + 1);
            query.appointmentDate = { $gte: start, $lt: end };
        }

        return await Appointment.find(query)
            .populate('patientId', 'name contact uhid age gender bloodGroup')
            .populate({
                path: 'doctorId',
                populate: [
                    { path: 'userId', select: 'name email phone avatar' },
                    { path: 'departmentId', select: 'name code location' }
                ]
            })
            .sort({ appointmentDate: 1, createdAt: 1 })
            .lean();
    },

    async getAppointmentById(id: string) {
        if (!Patient) {}
        if (!Doctor) {}
        if (!User) {}
        if (!Department) {}

        return await Appointment.findById(id)
            .populate('patientId', 'name contact uhid age gender bloodGroup')
            .populate({
                path: 'doctorId',
                populate: [
                    { path: 'userId', select: 'name email phone avatar' },
                    { path: 'departmentId', select: 'name code location' }
                ]
            })
            .lean();
    },

    async updateAppointment(id: string, data: Partial<IAppointment>) {
        return await Appointment.findByIdAndUpdate(id, data, { new: true })
            .populate('patientId', 'name contact uhid age gender bloodGroup')
            .populate({
                path: 'doctorId',
                populate: [
                    { path: 'userId', select: 'name email phone avatar' },
                    { path: 'departmentId', select: 'name code location' }
                ]
            })
            .lean();
    },

    async deleteAppointment(id: string) {
        return await Appointment.findByIdAndDelete(id);
    }
};
