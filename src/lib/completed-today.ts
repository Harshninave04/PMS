export interface CompletedAppointmentLike {
  doctorId?: unknown;
  consultationEndedAt?: Date | string | null;
  status?: string;
  queueStatus?: string;
}

export function getTodayDateRange(now = new Date()): { start: Date; end: Date } {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

export function buildCompletedTodayFilter(doctorId: unknown, start: Date, end: Date) {
  return {
    doctorId,
    consultationEndedAt: { $gte: start, $lt: end },
    $or: [{ status: "COMPLETED" }, { queueStatus: "COMPLETED" }],
  };
}

export function buildCompletedVisitRecordFilters(appointmentId: unknown, patientId: unknown, doctorUserId: unknown) {
  return {
    clinicalRecord: { appointmentId, recordType: "Consultation" },
    prescription: { appointmentId, patientId, doctorId: doctorUserId },
  };
}

export function isCompletedVisitInScope(
  appointment: CompletedAppointmentLike,
  doctorProfileId: unknown,
  start: Date,
  end: Date
): boolean {
  if (!appointment.doctorId || !doctorProfileId || String(appointment.doctorId) !== String(doctorProfileId)) return false;
  if (appointment.status !== "COMPLETED" && appointment.queueStatus !== "COMPLETED") return false;
  if (!appointment.consultationEndedAt) return false;

  const completedAt = new Date(appointment.consultationEndedAt).getTime();
  return Number.isFinite(completedAt) && completedAt >= start.getTime() && completedAt < end.getTime();
}
