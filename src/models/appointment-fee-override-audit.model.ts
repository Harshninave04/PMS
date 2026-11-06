import mongoose, { Schema, Types } from "mongoose";

export interface IAppointmentFeeOverrideAudit {
  appointmentId: Types.ObjectId;
  doctorId: Types.ObjectId;
  actorId: Types.ObjectId;
  roleName: string;
  configuredFee: number;
  overriddenFee: number;
  createdAt: Date;
}

const appointmentFeeOverrideAuditSchema = new Schema<IAppointmentFeeOverrideAudit>(
  {
    appointmentId: { type: Schema.Types.ObjectId, ref: "Appointment", required: true },
    doctorId: { type: Schema.Types.ObjectId, ref: "Doctor", required: true },
    actorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    roleName: { type: String, required: true },
    configuredFee: { type: Number, required: true },
    overriddenFee: { type: Number, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

appointmentFeeOverrideAuditSchema.index({ appointmentId: 1, createdAt: -1 });

const AppointmentFeeOverrideAudit = mongoose.models.AppointmentFeeOverrideAudit ||
  mongoose.model<IAppointmentFeeOverrideAudit>("AppointmentFeeOverrideAudit", appointmentFeeOverrideAuditSchema);

export default AppointmentFeeOverrideAudit;
