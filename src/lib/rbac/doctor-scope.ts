import { Types } from "mongoose";
import Appointment from "@/models/appointment.model";

/**
 * Doctor data isolation helpers.
 *
 * A doctor's relationship to patients is not stored on the Patient document
 * (Patient has no doctorId / assignedTo / createdBy), so "assigned to this
 * doctor" is derived from the Appointment.collection: a patient becomes a
 * doctor's patient the moment an appointment with that doctor exists.
 *
 * These helpers are role-based, not grant-based: a doctor is always isolated
 * to their own patients regardless of how broad the stored roll grants are.
 */

export function isDoctorRole(roleName?: string | null): boolean {
    if (!roleName) return false;
    const name = roleName.toUpperCase();
    return name.includes("DOCTOR") || name.includes("CONSULTANT");
}

export function isDoctorActor(context: {
    roleName?: string | null;
    doctorProfileId?: Types.ObjectId;
}): boolean {
    return Boolean(isDoctorRole(context.roleName) && context.doctorProfileId);
}

export function doctorProfileIdOf(context: {
    doctorProfileId?: Types.ObjectId;
}): Types.ObjectId | undefined {
    return context.doctorProfileId;
}

export async function getAssignedPatientIds(
    doctorId: Types.ObjectId
): Promise<Types.ObjectId[]> {
    const patientIds: Types.ObjectId[] = await Appointment.distinct("patientId", {
        doctorId,
        status: { $nin: ["CANCELLED"] }
    });
    return patientIds;
}

export async function isPatientAssignedToDoctor(
    doctorId: Types.ObjectId,
    patientId: Types.ObjectId
): Promise<boolean> {
    const count = await Appointment.countDocuments({
        doctorId,
        patientId,
        status: { $nin: ["CANCELLED"] }
    });
    return count > 0;
}