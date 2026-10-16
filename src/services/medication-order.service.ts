import { Types } from "mongoose";
import {
    MedicationOrder,
    validateOrderTimes,
    type MedicationOrderStatus,
} from "@/models/medication-order.model";
import NursingMedication from "@/models/nursing-medication.model";
import Admission from "@/models/admission.model";
import { MAX_DOSES_PER_ORDER } from "@/lib/medication-schedule";
import { expandHospitalDoseTimes } from "@/lib/hospital-time";
import { CreateMedicationOrderDto } from "@/dto/medication-order.dto";

const ACTIVE_STATUSES = ["ADMITTED", "TRANSFERRED"];

function idOf(v: unknown): string {
    const rec = v as { _id?: { toString(): string } } | null | undefined;
    if (rec && typeof rec === "object" && "_id" in rec && rec._id) return rec._id.toString();
    return String(v ?? "");
}

export class MedicationOrderService {
    async assertActorMayAccessAdmission(
        admissionId: Types.ObjectId | string,
        actor: { userId: Types.ObjectId; roleName: string; isSuperAdmin?: boolean }
    ) {
        const admission = await Admission.findById(new Types.ObjectId(admissionId.toString())).lean();
        if (!admission) throw { statusCode: 404, message: "Admission not found" };
        if (actor.isSuperAdmin) return admission;
        const role = (actor.roleName ?? "").toUpperCase();
        if (role === "ADMIN" || role === "RECEPTIONIST" || role === "ACCOUNTANT" || role === "PHARMACIST") {
            return admission;
        }
        const uid = actor.userId.toString();
        const onTeam =
            (admission.assignedNurses ?? []).some((n: unknown) => idOf(n) === uid) ||
            (admission.assignedDoctors ?? []).some((d: unknown) => idOf(d) === uid) ||
            idOf(admission.doctorId) === uid;
        if (!onTeam) throw { statusCode: 403, message: "Forbidden: You are not on this patient's care team" };
        return admission;
    }

    async createOrder(
        data: CreateMedicationOrderDto,
        prescriberId: Types.ObjectId | string,
        options: { allowUnspecifiedDosage?: boolean } = {},
    ) {
        if (!data.admissionId || !data.patientId) {
            throw { statusCode: 400, message: "Admission and patient are required" };
        }
        if (!data.medicationName?.trim() || (!options.allowUnspecifiedDosage && !data.dosage?.trim()) || !data.frequency) {
            throw { statusCode: 400, message: options.allowUnspecifiedDosage ? "Medication name and frequency are required" : "Medication name, dosage and frequency are required" };
        }
        if (!Types.ObjectId.isValid(data.admissionId.toString()) || !Types.ObjectId.isValid(data.patientId.toString())) {
            throw { statusCode: 400, message: "Invalid admission or patient ID" };
        }
        const admission = await Admission.findById(new Types.ObjectId(data.admissionId.toString())).lean();
        if (!admission) throw { statusCode: 404, message: "Admission not found" };
        if (!ACTIVE_STATUSES.includes(admission.status)) {
            throw { statusCode: 400, message: `Cannot prescribe on a ${admission.status} admission` };
        }
        if (idOf(admission.patientId) !== new Types.ObjectId(data.patientId.toString()).toString()) {
            throw { statusCode: 400, message: "Patient does not belong to this admission" };
        }
        const timesError = validateOrderTimes(data.frequency, data.timesOfDay ?? []);
        if (timesError) throw { statusCode: 400, message: timesError };
        const durationDays = Math.max(1, Math.min(30, Math.floor(data.durationDays ?? 0) || 0));
        if (!durationDays && data.frequency !== "PRN" && data.frequency !== "STAT") {
            throw { statusCode: 400, message: "Course duration (days) is required" };
        }

        const order = await MedicationOrder.create({
            admissionId: new Types.ObjectId(data.admissionId.toString()),
            patientId: new Types.ObjectId(data.patientId.toString()),
            visitId: data.visitId ? new Types.ObjectId(data.visitId.toString()) : undefined,
            prescribedBy: new Types.ObjectId(prescriberId.toString()),
            medicationName: data.medicationName.trim(),
            dosage: data.dosage?.trim() ?? "",
            route: data.route ?? "ORAL",
            frequency: data.frequency,
            timesOfDay: data.frequency === "STAT" || data.frequency === "PRN" ? [] : [...new Set(data.timesOfDay ?? [])].sort(),
            startDate: data.startDate ? new Date(data.startDate) : new Date(),
            durationDays: data.frequency === "STAT" ? 1 : durationDays || 1,
            instructions: data.instructions?.trim() || undefined,
            status: "ACTIVE",
        });

        try {
            // Expand the order into scheduled nurse doses (the eMAR worklist).
            const doseTimes = expandHospitalDoseTimes(
                order.startDate,
                order.durationDays,
                order.timesOfDay,
                order.frequency
            );
            if (doseTimes.length > MAX_DOSES_PER_ORDER) {
                throw { statusCode: 400, message: `Order would create too many doses (limit ${MAX_DOSES_PER_ORDER})` };
            }
            if (doseTimes.length > 0) {
                await NursingMedication.insertMany(
                    doseTimes.map((scheduledTime) => ({
                        patient: order.patientId,
                        admissionId: order.admissionId,
                        orderId: order._id,
                        medicationName: order.medicationName,
                        dosage: order.dosage,
                        route: order.route,
                        scheduledTime,
                        status: "PENDING",
                        notes: order.instructions,
                    }))
                );
            }
            return { order, dosesCreated: doseTimes.length };
        } catch (error) {
            await NursingMedication.deleteMany({ orderId: order._id });
            await MedicationOrder.findByIdAndDelete(order._id);
            throw error;
        }
    }

    async listOrders(admissionId: Types.ObjectId | string, status?: string) {
        const filter: Record<string, unknown> = {
            admissionId: new Types.ObjectId(admissionId.toString()),
        };
        if (status && status !== "ALL") filter.status = status as MedicationOrderStatus;
        const orders = await MedicationOrder.find(filter)
            .populate("prescribedBy", "name")
            .sort({ createdAt: -1 })
            .lean();
        // Attach dose adherence per order: at x time, did the patient get y?
        const orderIds = orders.map((o) => o._id as Types.ObjectId);
        const doseAgg =
            orderIds.length > 0
                ? await NursingMedication.aggregate([
                      { $match: { orderId: { $in: orderIds } } },
                      { $group: { _id: { orderId: "$orderId", status: "$status" }, count: { $sum: 1 } } },
                  ])
                : [];
        const counts = new Map<string, Record<string, number>>();
        for (const row of doseAgg as Array<{ _id: { orderId: Types.ObjectId; status: string }; count: number }>) {
            const key = row._id.orderId.toString();
            const entry = counts.get(key) ?? {};
            entry[row._id.status] = row.count;
            counts.set(key, entry);
        }
        return orders.map((o) => ({ ...o, doseCounts: counts.get((o._id as Types.ObjectId).toString()) ?? {} }));
    }

    async discontinueOrder(
        id: Types.ObjectId | string,
        actorId: Types.ObjectId | string,
        reason?: string
    ) {
        const order = await MedicationOrder.findById(new Types.ObjectId(id.toString()));
        if (!order) throw { statusCode: 404, message: "Medication order not found" };
        if (order.status !== "ACTIVE") {
            throw { statusCode: 400, message: `Order is already ${order.status}` };
        }
        order.status = "DISCONTINUED";
        order.discontinuedAt = new Date();
        order.discontinuedBy = new Types.ObjectId(actorId.toString());
        if (reason?.trim()) order.discontinueReason = reason.trim();
        await order.save();
        // Future pending doses were never due: remove them, keep history.
        const removed = await NursingMedication.deleteMany({
            orderId: order._id,
            status: "PENDING",
            scheduledTime: { $gte: new Date() },
        });
        return { order, futureDosesCancelled: removed.deletedCount ?? 0 };
    }
}

const medicationOrderService = new MedicationOrderService();
export default medicationOrderService;
