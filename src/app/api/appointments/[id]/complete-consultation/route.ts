import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/dbConnect";
import mongoose from "mongoose";
import Appointment from "@/models/appointment.model";
import { ClinicalRecord } from "@/models/clinical-record.model";
import Prescription from "@/models/prescription.model";
import { authorizeRequest, requirePermission } from "@/lib/rbac/guard";
import { PERMISSION_KEYS } from "@/types/rbac";
import { canCompleteAppointment, isDoctorRole } from "@/lib/rbac/doctor-scope";
import { supportsMongoTransactions } from "@/lib/mongo-transaction-support";
import { buildConsultationDocuments, isAppointmentReadyForConsultation, normalizeConsultationInput } from "@/lib/consultation-save";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requirePermission(request, "opd.queue:update");
  if (denied) return denied;

  const authResult = await authorizeRequest(request, PERMISSION_KEYS.CLINICAL_RECORD_CREATE, "Clinical Record");
  if (!authResult.isAuthorized) return authResult.response;

  const resolvedParams = await params; const appointmentId = resolvedParams.id;
  if (!appointmentId || !mongoose.Types.ObjectId.isValid(appointmentId)) {
    return NextResponse.json({ success: false, error: "Invalid appointment ID" }, { status: 400 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch (e) {
    return NextResponse.json({ success: false, error: "Invalid request body" }, { status: 400 });
  }

  const normalized = normalizeConsultationInput(body);
  if (!normalized.data) {
    return NextResponse.json({ success: false, error: normalized.error }, { status: 400 });
  }

  try {
    await dbConnect();

    const appointment = await Appointment.findById(appointmentId)
      .populate("patientId")
      .populate({
        path: "doctorId",
        populate: { path: "userId", select: "name email" },
      })
      .lean();

    if (!appointment) {
      return NextResponse.json({ success: false, error: "Appointment not found" }, { status: 404 });
    }

    const aptAny = appointment as any;
    const aptPatientId = aptAny.patientId?._id || aptAny.patientId;
    const aptDoctorProfileId = aptAny.doctorId?._id || aptAny.doctorId;
    const appointmentDoctorUserId = aptAny.doctorId?.userId?._id || aptAny.doctorId?.userId;

    if (!canCompleteAppointment(authResult.context, aptDoctorProfileId)) {
      return NextResponse.json(
        { success: false, error: "Forbidden: You can only complete your own appointments" },
        { status: 403 }
      );
    }

    if (!appointmentDoctorUserId) {
      return NextResponse.json({ success: false, error: "Appointment doctor profile is incomplete" }, { status: 409 });
    }
    if (
      isDoctorRole(authResult.context.roleName) &&
      String(appointmentDoctorUserId) !== authResult.context.userId.toString()
    ) {
      return NextResponse.json(
        { success: false, error: "Forbidden: You can only complete your own appointments" },
        { status: 403 }
      );
    }
    const doctorUserId = isDoctorRole(authResult.context.roleName)
      ? authResult.context.userId
      : appointmentDoctorUserId;

    const status = aptAny.status || aptAny.queueStatus;
    const queueStatus = aptAny.queueStatus;
    const existingRecord = await ClinicalRecord.findOne({ appointmentId, recordType: "Consultation" }).lean();
    if ((status === "COMPLETED" || queueStatus === "COMPLETED") && existingRecord) {
      const existingPrescription = await Prescription.findOne({ appointmentId }).lean();
      return NextResponse.json({
        success: true,
        duplicate: true,
        data: { clinicalRecord: existingRecord, prescription: existingPrescription },
      });
    }
    if (status === "COMPLETED" || queueStatus === "COMPLETED") {
      return NextResponse.json({ success: false, error: "Appointment is already completed" }, { status: 409 });
    }
    if (status === "CANCELLED" || queueStatus === "CANCELLED") {
      return NextResponse.json(
        { success: false, error: "Cannot complete a cancelled appointment" },
        { status: 409 }
      );
    }
    if (existingRecord) {
      return NextResponse.json({ success: false, error: "A consultation record already exists for this appointment" }, { status: 409 });
    }
    if (!isAppointmentReadyForConsultation(queueStatus, status)) {
      return NextResponse.json(
        { success: false, error: "Appointment must be called or in consultation before it can be completed" },
        { status: 409 }
      );
    }

    const documents = buildConsultationDocuments(normalized.data, {
      appointmentId,
      patientId: aptPatientId,
      doctorUserId,
      branchId: authResult.context.branchId,
    });

    const mongoClient = mongoose.connection.getClient() as ReturnType<
      typeof mongoose.connection.getClient
    > & { topology?: { description?: { type?: string } } };
    const usedTransaction = supportsMongoTransactions(mongoClient.topology?.description?.type);
    const session = usedTransaction ? await mongoose.startSession() : null;
    const consultationEndedAt = new Date();
    let createdClinicalRecordId: mongoose.Types.ObjectId | undefined;
    let createdPrescriptionId: mongoose.Types.ObjectId | undefined;
    let appointmentUpdateAttempted = false;

    try {
      if (session) await session.startTransaction();

      const clinicalRecord = await ClinicalRecord.create([documents.clinicalRecord], session ? { session } : {});
      createdClinicalRecordId = clinicalRecord[0]?._id;

      let prescription = null;
      if (documents.prescription) {
        prescription = await Prescription.create(
          [documents.prescription],
          session ? { session } : {}
        );
        createdPrescriptionId = prescription[0]?._id;
      }

      appointmentUpdateAttempted = true;
      const completedAppointment = await Appointment.findOneAndUpdate(
        {
          _id: appointmentId,
          doctorId: aptDoctorProfileId,
          status: { $nin: ["COMPLETED", "CANCELLED"] },
          $or: [
            { queueStatus: "CALLED" },
            { queueStatus: "IN_CONSULTATION" },
            { status: "IN_PROGRESS" },
          ],
        },
        {
          status: "COMPLETED",
          queueStatus: "COMPLETED",
          consultationEndedAt,
        },
        session ? { session, new: true } : { new: true }
      );
      if (!completedAppointment) throw new Error("Appointment status changed before the consultation could be completed");

      if (session) {
        await session.commitTransaction();
      }

      return NextResponse.json({
        success: true,
        data: {
          clinicalRecord: clinicalRecord?.[0] || clinicalRecord,
          prescription: prescription?.[0] || prescription,
        },
      });
    } catch (err: any) {
      if (session) {
        try {
          await session.abortTransaction();
        } catch (e) {}
      } else {
        if (appointmentUpdateAttempted) {
          const restoreSet: Record<string, unknown> = {};
          const restoreUnset: Record<string, ""> = {};
          if (aptAny.status === undefined) restoreUnset.status = "";
          else restoreSet.status = aptAny.status;
          if (aptAny.queueStatus === undefined) restoreUnset.queueStatus = "";
          else restoreSet.queueStatus = aptAny.queueStatus;
          if (aptAny.consultationEndedAt === undefined) restoreUnset.consultationEndedAt = "";
          else restoreSet.consultationEndedAt = aptAny.consultationEndedAt;
          try {
            await Appointment.updateOne(
              { _id: appointmentId, status: "COMPLETED", queueStatus: "COMPLETED", consultationEndedAt },
              { ...(Object.keys(restoreSet).length ? { $set: restoreSet } : {}), ...(Object.keys(restoreUnset).length ? { $unset: restoreUnset } : {}) }
            );
          } catch (e) {}
        }
        if (createdPrescriptionId) {
          try { await Prescription.deleteOne({ _id: createdPrescriptionId }); } catch (e) {}
        }
        if (createdClinicalRecordId) {
          try { await ClinicalRecord.deleteOne({ _id: createdClinicalRecordId }); } catch (e) {}
        }
      }

      if (err?.code === 11000) {
        const existingRecord = await ClinicalRecord.findOne({ appointmentId, recordType: "Consultation" }).lean();
        const existingPrescription = await Prescription.findOne({ appointmentId }).lean();
        if (existingRecord) {
          return NextResponse.json(
            {
              success: true,
              data: { clinicalRecord: existingRecord, prescription: existingPrescription },
              duplicate: true,
            },
            { status: 200 }
          );
        }
        return NextResponse.json({ success: false, error: "Duplicate consultation record" }, { status: 409 });
      }

      throw err;
    } finally {
      session?.endSession();
    }
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
