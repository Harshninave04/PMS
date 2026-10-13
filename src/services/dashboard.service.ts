import DashboardRepository from "@/repositories/dashboard.repository";
import Appointment from "@/models/appointment.model";
import type { Types } from "mongoose";

interface ReceptionistAppointmentRow {
  tokenNumber?: string;
  patientId?: { _id?: unknown; name?: string } | null;
  doctorId?: { name?: string; userId?: { name?: string } } | null;
  appointmentTime?: string;
  status?: string;
  queueStatus?: string;
}

interface ReceptionistDashboardCounts {
  bookedToday: number;
  waiting: number;
  completedToday: number;
  pendingPayment: number;
}

export function buildReceptionistDashboardData(
  counts: ReceptionistDashboardCounts,
  appointments: ReceptionistAppointmentRow[]
) {
  const sortedAppointments = [...appointments].sort((a, b) =>
    (a.tokenNumber ?? "").localeCompare(b.tokenNumber ?? "", undefined, { numeric: true })
  );

  return {
    ...counts,
    appointments: sortedAppointments.slice(0, 10).map((appointment) => {
      const status = appointment.queueStatus || appointment.status || "";
      const displayStatus = ["CANCELLED", "NO_SHOW", "SKIPPED"].includes(status) || appointment.status === "CANCELLED"
        ? "Cancelled"
        : ["COMPLETED"].includes(status) || appointment.status === "COMPLETED"
          ? "Completed"
          : status === "IN_CONSULTATION" || appointment.status === "IN_PROGRESS"
            ? "With doctor"
            : "Waiting";

      return {
        token: appointment.tokenNumber ?? "",
        patient: appointment.patientId?.name ?? "",
        patientId: appointment.patientId?._id?.toString() ?? "",
        doctor: appointment.doctorId?.userId?.name || appointment.doctorId?.name || "",
        time: appointment.appointmentTime ?? "",
        status: displayStatus,
      };
    }),
  };
}

class DashboardService {
  async getDoctorDashboardStats(doctorProfileId: Types.ObjectId) {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);
    const scope = { doctorId: doctorProfileId, appointmentDate: { $gte: todayStart, $lt: todayEnd } };

    const [waiting, inConsultation, completedToday] = await Promise.all([
      Appointment.countDocuments({ ...scope, queueStatus: { $in: ["WAITING", "TRIAGE"] }, status: { $nin: ["CANCELLED"] } }),
      Appointment.countDocuments({ ...scope, $or: [{ queueStatus: "IN_CONSULTATION" }, { status: "IN_PROGRESS" }] }),
      Appointment.countDocuments({ ...scope, $or: [{ queueStatus: "COMPLETED" }, { status: "COMPLETED" }] }),
    ]);

    return { waiting, inConsultation, completedToday };
  }

  async getReceptionistDashboardStats(branchId: Types.ObjectId) {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);
    const scope = { branchId, appointmentDate: { $gte: todayStart, $lt: todayEnd } };

    const [bookedToday, waiting, completedToday, pendingPayment, appointments] = await Promise.all([
      Appointment.countDocuments(scope),
      Appointment.countDocuments({
        ...scope,
        $or: [
          { queueStatus: { $in: ["WAITING", "TRIAGE", "CALLED"] } },
          { status: { $in: ["SCHEDULED", "CONFIRMED", "CHECKED_IN"] } },
        ],
      }),
      Appointment.countDocuments({ ...scope, $or: [{ queueStatus: "COMPLETED" }, { status: "COMPLETED" }] }),
      Appointment.countDocuments({
        ...scope,
        paymentStatus: "PENDING",
        status: { $nin: ["CANCELLED", "COMPLETED", "NO_SHOW"] },
        queueStatus: { $nin: ["CANCELLED", "COMPLETED", "NO_SHOW", "SKIPPED"] },
      }),
      Appointment.find(scope)
        .populate("patientId", "name")
        .populate({ path: "doctorId", select: "name", populate: { path: "userId", select: "name" } })
        .lean(),
    ]);

    return buildReceptionistDashboardData(
      { bookedToday, waiting, completedToday, pendingPayment },
      appointments as ReceptionistAppointmentRow[]
    );
  }

  async getDashboardStats() {
    const totalPatients = await DashboardRepository.getTotalPatients();
    const totalDoctors = await DashboardRepository.getTotalDoctors();
    const totalAppointments = await DashboardRepository.getTotalAppointments();
    const todayAppointments = await DashboardRepository.getTodayAppointments();
    const occupiedBeds = await DashboardRepository.getOccupiedBedsCount();
    const totalBeds = await DashboardRepository.getTotalBedsCount();
    const recentPatientsData = await DashboardRepository.getRecentPatients(5);
    
    const formattedRecent = recentPatientsData.map(p => ({
        name: p.name,
        id: p.id || p.uhid || "P-NEW",
        doctor: p.doctor || "Attending Physician", 
        status: p.status || "Active", 
        time: p.time || (p.createdAt ? new Date(p.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "Just now")
    }));

    return {
      totalPatients,
      totalDoctors,
      totalAppointments,
      todayAppointments,
      occupiedBeds,
      totalBeds,
      recentPatients: formattedRecent
    };
  }
}

export default new DashboardService();
