import DashboardRepository from "@/repositories/dashboard.repository";
import Appointment from "@/models/appointment.model";
import type { Types } from "mongoose";

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
