import Patient from "@/models/patient.model";
import Appointment from "@/models/appointment.model";
import Doctor from "@/models/doctor.model";
import Admission from "@/models/admission.model";
import Bed from "@/models/bed.model";
import Medicine from "@/models/medicine.model";
import PharmacyDispense from "@/models/pharmacy-dispense.model";
import Invoice from "@/models/invoice.model";
// Registered for populate()
import "@/models/user.model";
import "@/models/department.model";
import "@/models/ward.model";
import "@/models/room.model";

export class ReportsService {
  // Helper to get date boundaries based on timeframe
  private getDateFilter(timeframe?: string) {
    if (!timeframe || timeframe === "ALL_TIME") return {};
    const now = new Date();
    const startDate = new Date();

    if (timeframe === "TODAY") {
      startDate.setHours(0, 0, 0, 0);
    } else if (timeframe === "7_DAYS") {
      startDate.setDate(now.getDate() - 7);
    } else if (timeframe === "30_DAYS") {
      startDate.setDate(now.getDate() - 30);
    } else if (timeframe === "90_DAYS" || timeframe === "QUARTER") {
      startDate.setDate(now.getDate() - 90);
    } else if (timeframe === "YTD") {
      startDate.setMonth(0, 1);
      startDate.setHours(0, 0, 0, 0);
    }

    return { $gte: startDate, $lte: now };
  }

  // 1. Operations Hub Summary
  async getSummaryStats(timeframe?: string) {
    const dateFilter = this.getDateFilter(timeframe);
    const dateQuery = Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {};

    const [
      totalPatients,
      totalAppointments,
      totalAdmissions,
      activeAdmissions,
      totalBeds,
      occupiedBedsCount,
      paidInvoices,
      allInvoices,
      lowStockItemsCount
    ] = await Promise.all([
      Patient.countDocuments({ isMerged: { $ne: true } }),
      Appointment.countDocuments(dateQuery),
      Admission.countDocuments(dateQuery),
      Admission.countDocuments({ status: { $in: ["ADMITTED", "ACTIVE"] } }),
      Bed.countDocuments(),
      Bed.countDocuments({ status: { $regex: /^occupied$/i } }),
      Invoice.find({ status: "PAID", ...(Object.keys(dateFilter).length ? { createdAt: dateFilter } : {}) }).lean(),
      Invoice.find(dateQuery).lean(),
      Medicine.countDocuments({ $expr: { $lte: ["$stockQuantity", "$reorderLevel"] } })
    ]);

    const totalRevenue = paidInvoices.reduce((sum, inv) => sum + (Number(inv.finalAmount) || 0), 0);
    const totalBilled = allInvoices.reduce((sum, inv) => sum + (Number(inv.finalAmount) || 0), 0);
    const totalOutstanding = Math.max(0, totalBilled - totalRevenue);

    const bedOccupancyRate = totalBeds > 0 ? Math.round((occupiedBedsCount / totalBeds) * 100) : 0;

    return {
      overview: {
        totalPatients,
        totalAppointments,
        totalAdmissions,
        activeInpatients: activeAdmissions,
        totalBeds,
        occupiedBeds: occupiedBedsCount,
        availableBeds: Math.max(0, totalBeds - occupiedBedsCount),
        bedOccupancyRate: `${bedOccupancyRate}%`,
        totalRevenue,
        totalBilled,
        totalOutstanding,
        lowStockAlerts: lowStockItemsCount
      },
      timeframe: timeframe || "ALL_TIME"
    };
  }

  // 3. Patient Reports & Demographics
  async getPatientReport(timeframe?: string) {
    const dateFilter = this.getDateFilter(timeframe);
    const dateQuery = Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {};

    const [totalPatients, filteredPatients, genderAgg, bloodAgg, allPatients] = await Promise.all([
      Patient.countDocuments({ isMerged: { $ne: true } }),
      Patient.countDocuments({ ...dateQuery, isMerged: { $ne: true } }),
      Patient.aggregate([
        { $match: { isMerged: { $ne: true } } },
        { $group: { _id: "$gender", count: { $sum: 1 } } }
      ]),
      Patient.aggregate([
        { $match: { isMerged: { $ne: true } } },
        { $group: { _id: "$bloodGroup", count: { $sum: 1 } } }
      ]),
      Patient.find({ isMerged: { $ne: true } }).select("age createdAt").lean()
    ]);

    const genderStats: Record<string, number> = {};
    genderAgg.forEach((g) => {
      genderStats[g._id || "Other"] = g.count;
    });

    const bloodGroupStats: Record<string, number> = {};
    bloodAgg.forEach((b) => {
      if (b._id) bloodGroupStats[b._id] = b.count;
    });

    // Age brackets
    let pediatric = 0; // 0 - 17
    let adult = 0; // 18 - 59
    let geriatric = 0; // 60+

    allPatients.forEach((p) => {
      const age = Number(p.age || 0);
      if (age < 18) pediatric++;
      else if (age < 60) adult++;
      else geriatric++;
    });

    return {
      totalPatients,
      newRegistrations: filteredPatients,
      demographics: {
        genderStats,
        bloodGroupStats,
        ageBrackets: {
          pediatric,
          adult,
          geriatric
        }
      }
    };
  }

  // 4. Appointment Reports
  async getAppointmentReport(timeframe?: string) {
    const dateFilter = this.getDateFilter(timeframe);
    const dateQuery = Object.keys(dateFilter).length > 0 ? { appointmentDate: dateFilter } : {};

    const [total, statusAgg, rawAppointments] = await Promise.all([
      Appointment.countDocuments(),
      Appointment.aggregate([
        { $match: dateQuery },
        { $group: { _id: "$status", count: { $sum: 1 } } }
      ]),
      Appointment.find(dateQuery)
        .populate("patientId", "name uhid age gender")
        .populate({
          path: "doctorId",
          select: "specialization departmentId userId consultationFee",
          populate: [
            { path: "userId", select: "name email phone" },
            { path: "departmentId", select: "name code" }
          ]
        })
        .sort({ appointmentDate: -1 })
        .limit(20)
        .lean()
    ]);

    const appointments = rawAppointments.map((appt: any) => {
      const doc = appt.doctorId;
      const doctorName = doc?.userId?.name || doc?.name || "Consulting Physician";
      const department = doc?.departmentId || null;
      return {
        ...appt,
        doctorId: {
          ...doc,
          name: doctorName
        },
        departmentId: department
      };
    });

    const statusCounts: Record<string, number> = {
      CONFIRMED: 0,
      COMPLETED: 0,
      CANCELLED: 0,
      PENDING: 0,
      NO_SHOW: 0
    };

    statusAgg.forEach((s) => {
      if (s._id) statusCounts[s._id] = s.count;
    });

    const completed = statusCounts.COMPLETED || 0;
    const cancelled = (statusCounts.CANCELLED || 0) + (statusCounts.NO_SHOW || 0);
    const completionRate = total > 0 ? `${Math.round((completed / total) * 100)}%` : "0%";

    return {
      totalAppointments: total,
      statusCounts,
      completionRate,
      cancellationCount: cancelled,
      recentAppointments: appointments
    };
  }

  // 5. Doctor Reports
  async getDoctorReport(timeframe?: string) {
    const [doctors, appointments] = await Promise.all([
      Doctor.find()
        .populate("userId", "name email phone role isActive")
        .populate("departmentId", "name code")
        .lean(),
      Appointment.find().populate("doctorId").lean()
    ]);

    const doctorLoadMap: Record<string, number> = {};
    appointments.forEach((a: any) => {
      const docId = a.doctorId?._id?.toString() || a.doctorId?.toString();
      if (docId) {
        doctorLoadMap[docId] = (doctorLoadMap[docId] || 0) + 1;
      }
    });

    const doctorStats = doctors.map((d: any) => {
      const docId = d._id.toString();
      const consultationsCount = doctorLoadMap[docId] || 0;
      const fee = Number(d.consultationFee || 500);
      return {
        id: docId,
        name: d.userId?.name || `Dr. ${d.specialization || "Physician"}`,
        specialization: d.specialization || "General Medicine",
        department: d.departmentId?.name || "OPD",
        status: d.status || "ACTIVE",
        licenseNo: d.licenseNo,
        consultationFee: fee,
        consultationsCount,
        estimatedRevenue: consultationsCount * fee
      };
    }).sort((a, b) => b.consultationsCount - a.consultationsCount);

    return {
      totalDoctors: doctors.length,
      activeDoctors: doctors.filter((d: any) => d.status === "ACTIVE").length,
      doctorPerformance: doctorStats
    };
  }

  // 6. Admission Reports
  async getAdmissionReport(timeframe?: string) {
    const dateFilter = this.getDateFilter(timeframe);
    const dateQuery = Object.keys(dateFilter).length > 0 ? { admissionDate: dateFilter } : {};

    const [rawAdmissions, activeCount] = await Promise.all([
      Admission.find(dateQuery)
        .populate("patientId", "name uhid age gender contact")
        .populate({
          path: "bedId",
          select: "bedNumber status roomId",
          populate: {
            path: "roomId",
            select: "roomNumber wardId",
            populate: { path: "wardId", select: "wardName wardType" }
          }
        })
        .populate("doctorId", "name email")
        .sort({ admissionDate: -1 })
        .lean(),
      Admission.countDocuments({ status: { $in: ["ADMITTED", "ACTIVE"] } })
    ]);

    let emergency = 0;
    let elective = 0;

    const admissions = rawAdmissions.map((a: any) => {
      if (a.admissionType === "EMERGENCY") emergency++;
      else elective++;

      const ward = a.bedId?.roomId?.wardId;
      return {
        ...a,
        departmentId: {
          name: ward?.wardName || "Inpatient (IPD)"
        }
      };
    });

    return {
      totalAdmissions: admissions.length,
      activeInpatients: activeCount,
      admissionTypes: {
        emergency,
        elective
      },
      admissionsList: admissions
    };
  }

  // 12. Pharmacy Reports
  async getPharmacyReport(timeframe?: string) {
    const dateFilter = this.getDateFilter(timeframe);
    const dateQuery = Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {};

    const [dispenses, totalMedicines] = await Promise.all([
      PharmacyDispense.find(dateQuery).sort({ createdAt: -1 }).lean(),
      Medicine.countDocuments()
    ]);

    let totalRevenue = 0;
    let totalItemsDispensed = 0;
    const paymentModes: Record<string, number> = {};
    const medicineDispensedCount: Record<string, number> = {};

    dispenses.forEach((d: any) => {
      totalRevenue += Number(d.totalAmount || 0);
      const mode = d.paymentMode || "CASH";
      paymentModes[mode] = (paymentModes[mode] || 0) + Number(d.totalAmount || 0);

      (d.items || []).forEach((it: any) => {
        totalItemsDispensed += Number(it.quantity || 1);
        const medName = it.medicineName || "Generic Drug";
        medicineDispensedCount[medName] = (medicineDispensedCount[medName] || 0) + Number(it.quantity || 1);
      });
    });

    const topMedicines = Object.entries(medicineDispensedCount)
      .map(([name, qty]) => ({ name, qty }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 10);

    return {
      totalDispenseBills: dispenses.length,
      totalCatalogMedicines: totalMedicines,
      totalRevenue,
      totalItemsDispensed,
      paymentModes,
      topMedicines,
      recentDispenses: dispenses.slice(0, 15)
    };
  }

  // 15. Billing & Revenue Reports
  async getBillingReport(timeframe?: string) {
    const dateFilter = this.getDateFilter(timeframe);
    const dateQuery = Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {};

    const invoices = await Invoice.find(dateQuery)
      .populate("patientId", "name uhid contact")
      .sort({ createdAt: -1 })
      .lean();

    let grossBilled = 0;
    let netCollected = 0;
    let discountTotal = 0;
    let taxTotal = 0;

    const statusMap: Record<string, number> = {
      PAID: 0,
      PARTIALLY_PAID: 0,
      UNPAID: 0,
      OVERDUE: 0,
      CANCELLED: 0
    };

    const departmentRevenue: Record<string, number> = {};

    invoices.forEach((inv: any) => {
      const finalAmt = Number(inv.finalAmount || 0);
      const paidAmt = Number(inv.paidAmount || (inv.status === "PAID" ? finalAmt : 0));
      const disc = Number(inv.discountAmount || 0);
      const tax = Number(inv.taxAmount || 0);

      grossBilled += finalAmt;
      netCollected += paidAmt;
      discountTotal += disc;
      taxTotal += tax;

      const st = inv.status || "UNPAID";
      if (statusMap[st] !== undefined) statusMap[st] += 1;
      else statusMap[st] = 1;

      const dept = inv.department || "General";
      departmentRevenue[dept] = (departmentRevenue[dept] || 0) + finalAmt;
    });

    const outstandingBalance = Math.max(0, grossBilled - netCollected);
    const collectionEfficiency = grossBilled > 0 ? `${Math.round((netCollected / grossBilled) * 100)}%` : "0%";

    return {
      grossBilled,
      netCollected,
      outstandingBalance,
      discountTotal,
      taxTotal,
      collectionEfficiency,
      invoiceStatuses: statusMap,
      departmentRevenue,
      recentInvoices: invoices.slice(0, 20)
    };
  }

}

export const reportsService = new ReportsService();
export default reportsService;
