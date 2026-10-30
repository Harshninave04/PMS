import { Types } from "mongoose";
import { ClinicalRecord } from "@/models/clinical-record.model";
import { MedicationOrder } from "@/models/medication-order.model";
import NursingMedication from "@/models/nursing-medication.model";
import DailyNursingRecord from "@/models/daily-nursing-record.model";
import { Vitals } from "@/models/vitals.model";
import Invoice from "@/models/invoice.model";
import Payment from "@/models/payment.model";
import { formatHospitalDateTime } from "@/lib/hospital-date";
import { stayDayNumber } from "@/lib/hospital-time";

const text = (...values: unknown[]) => values
  .filter((value) => typeof value === "string" && value.trim())
  .map((value) => (value as string).trim())
  .join(" — ");

export async function buildAutoTreatmentSummary(admissionId: Types.ObjectId, timeZone: string): Promise<string> {
  const [records, medicationOrders, administeredMedicines] = await Promise.all([
    ClinicalRecord.find({ admissionId, status: "Final" })
      .select("recordType visitType orderType title details notes text assessment plan objectiveFindings dateRecorded visitedAt createdAt")
      .sort({ dateRecorded: 1, createdAt: 1 })
      .lean(),
    MedicationOrder.find({ admissionId })
      .select("medicationName dosage route frequency instructions startDate createdAt")
      .sort({ createdAt: 1 })
      .lean(),
    NursingMedication.find({ admissionId, status: "GIVEN" })
      .select("medicationName dosage route administeredTime scheduledTime createdAt")
      .sort({ administeredTime: 1, scheduledTime: 1 })
      .lean(),
  ]);

  const rounds = records.filter((record) => record.recordType === "Progress Note" || record.visitType === "Round" || record.visitType === "Pre-Discharge");
  const proceduresAndInvestigations = records.filter((record) => record.recordType === "Clinical Order" && ["Procedure", "Lab", "Radiology"].includes(String(record.orderType)));
  const lines: string[] = [];

  if (rounds.length) {
    lines.push("Rounds and clinical course:");
    for (const round of rounds) {
      const when = formatHospitalDateTime(round.visitedAt || round.dateRecorded || round.createdAt, timeZone);
      const clinicalNotes = text(round.assessment, round.plan, round.objectiveFindings, round.notes, round.details, round.text);
      const line = [when, clinicalNotes].filter(Boolean).join(" — ");
      if (line) lines.push(`• ${line}`);
    }
  }

  if (proceduresAndInvestigations.length) {
    lines.push("Procedures and investigations:");
    for (const order of proceduresAndInvestigations) {
      const when = formatHospitalDateTime(order.dateRecorded || order.createdAt, timeZone);
      const description = text(order.orderType, order.title, order.details);
      const line = [when, description].filter(Boolean).join(" — ");
      if (line) lines.push(`• ${line}`);
    }
  }

  if (medicationOrders.length || administeredMedicines.length) {
    lines.push("Medicines:");
    for (const order of medicationOrders) {
      const when = formatHospitalDateTime(order.startDate || order.createdAt, timeZone);
      const regimen = text(order.medicationName, order.dosage, order.route, order.frequency, order.instructions);
      lines.push(`• Prescribed ${when ? `${when}: ` : ""}${regimen}`);
    }
    for (const medicine of administeredMedicines) {
      const when = formatHospitalDateTime(medicine.administeredTime || medicine.scheduledTime || medicine.createdAt, timeZone);
      lines.push(`• Given ${when ? `${when}: ` : ""}${text(medicine.medicationName, medicine.dosage, medicine.route)}`);
    }
  }

  return lines.join("\n").slice(0, 12000);
}

function clinicalText(record: Record<string, unknown>) {
  return text(record.assessment, record.plan, record.objectiveFindings, record.notes, record.details, record.text);
}

function vitalText(record: Record<string, any>) {
  return [
    record.bloodPressure && `BP ${record.bloodPressure}`,
    record.pulse != null && `Pulse ${record.pulse}`,
    record.heartRate != null && `HR ${record.heartRate}`,
    record.temperature != null && `Temp ${record.temperature}`,
    record.respiratoryRate != null && `RR ${record.respiratoryRate}`,
    record.oxygenSaturation != null && `SpO₂ ${record.oxygenSaturation}%`,
    record.weight != null && `Weight ${record.weight}`,
    record.height != null && `Height ${record.height}`,
  ].filter(Boolean).join(" · ");
}

function iso(value: unknown): string {
  const date = value instanceof Date ? value : new Date(value as string);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

export async function buildDischargeFullFile(admission: any, timeZone: string) {
  const admissionId = new Types.ObjectId(String(admission._id));
  const admissionDate = new Date(admission.admissionDate);
  const endDate = admission.dischargeDate ? new Date(admission.dischargeDate) : new Date();
  const [clinicalRecords, nursingRecords, vitals, medicationOrders, administeredMedicines, invoices] = await Promise.all([
    ClinicalRecord.find({ admissionId, status: "Final" })
      .select("recordType visitType orderType title details notes text assessment plan objectiveFindings dateRecorded visitedAt createdAt result testResult")
      .sort({ dateRecorded: 1, createdAt: 1 }).lean(),
    DailyNursingRecord.find({ admissionId, status: "Final" })
      .populate("author", "name")
      .sort({ nursingDay: 1, recordDate: 1, createdAt: 1 }).lean(),
    Vitals.find({ admissionId }).populate("recordedBy", "name").sort({ dateRecorded: 1 }).lean(),
    MedicationOrder.find({ admissionId }).populate("prescribedBy", "name").sort({ startDate: 1, createdAt: 1 }).lean(),
    NursingMedication.find({ admissionId }).populate("administeredBy", "name").sort({ administeredTime: 1, scheduledTime: 1 }).lean(),
    Invoice.find({ admissionId, status: { $ne: "CANCELLED" } }).sort({ createdAt: 1 }).lean(),
  ]);

  const events: Array<{ id: string; kind: string; at: string; dayNumber: number; title: string; detail?: string; status?: string }> = [];
  const addEvent = (record: Record<string, any>, kind: string, title: string, detail?: string, status?: string, when?: unknown) => {
    const at = iso(when ?? record.visitedAt ?? record.administeredTime ?? record.recordDate ?? record.dateRecorded ?? record.createdAt ?? record.startDate);
    if (!at) return;
    const date = new Date(at);
    events.push({
      id: String(record._id ?? `${kind}-${date.getTime()}-${events.length}`),
      kind,
      at,
      dayNumber: stayDayNumber(admissionDate, date, timeZone),
      title,
      ...(detail ? { detail } : {}),
      ...(status ? { status } : {}),
    });
  };

  const procedures = clinicalRecords.filter((record) => record.recordType === "Clinical Order" && record.orderType === "Procedure");
  const investigations = clinicalRecords.filter((record) => record.recordType === "Clinical Order" && ["Lab", "Radiology"].includes(String(record.orderType)));
  const rounds = clinicalRecords.filter((record) => record.recordType === "Progress Note" || record.visitType === "Round" || record.visitType === "Pre-Discharge");

  for (const record of rounds) addEvent(record, "round", record.visitType || "Doctor round", clinicalText(record));
  for (const record of procedures) addEvent(record, "procedure", record.title || "Procedure", text(record.details, record.notes));
  for (const record of investigations) addEvent(record, "test", record.title || `${record.orderType} order`, text(record.details, record.notes), undefined, record.dateRecorded || record.createdAt);
  for (const record of nursingRecords as Array<Record<string, any>>) {
    const notes = text(record.observations, record.procedures, record.medicationAdministration, record.progress, record.additionalNotes);
    addEvent(record, "nursing", "Nursing note", notes, record.status);
    if (record.vitals && Object.values(record.vitals).some((value) => value !== undefined && value !== "")) {
      addEvent(record, "vitals", "Recorded vitals", Object.entries(record.vitals).filter(([, value]) => value !== undefined && value !== "").map(([key, value]) => `${key}: ${value}`).join(" · "), undefined, record.recordDate);
    }
  }
  for (const record of vitals as Array<Record<string, any>>) {
    const details = text(
      record.bloodPressure && `BP ${record.bloodPressure}`,
      record.heartRate != null && `HR ${record.heartRate}`,
      record.temperature != null && `Temp ${record.temperature}`,
      record.respiratoryRate != null && `RR ${record.respiratoryRate}`,
      record.oxygenSaturation != null && `SpO₂ ${record.oxygenSaturation}%`,
    );
    if (details) addEvent(record, "vitals", "Vitals", details, undefined, record.dateRecorded);
  }
  for (const record of medicationOrders as Array<Record<string, any>>) {
    addEvent(record, "medicine-order", `Medicine prescribed: ${record.medicationName}`, text(record.dosage, record.route, record.frequency, record.instructions), record.status, record.startDate || record.createdAt);
  }
  for (const record of administeredMedicines as Array<Record<string, any>>) {
    addEvent(record, "medicine", `${record.status === "GIVEN" ? "Medicine given" : "Medicine dose"}: ${record.medicationName}`, text(record.dosage, record.route, record.notes, record.withheldReason), record.status, record.administeredTime || record.scheduledTime || record.createdAt);
  }
  events.sort((left, right) => new Date(left.at).getTime() - new Date(right.at).getTime());

  const stayDays = Math.min(500, Math.max(1, stayDayNumber(admissionDate, endDate, timeZone)));
  const days = Array.from({ length: stayDays }, (_, index) => ({
    dayNumber: index + 1,
    events: events.filter((event) => event.dayNumber === index + 1),
  }));

  const invoiceIds = invoices.map((invoice) => invoice._id);
  const payments = await Payment.find({
    $or: [
      { admissionId },
      ...(invoiceIds.length ? [{ invoiceId: { $in: invoiceIds } }] : []),
    ],
  }).sort({ date: 1, createdAt: 1 }).lean();

  const investigationSummary = investigations.map((record: any) => ({
    date: iso(record.dateRecorded || record.createdAt),
    type: String(record.orderType || "Investigation"),
    title: String(record.title || record.details || ""),
    testName: String(record.title || ""),
    detail: String(record.details || ""),
    status: String(record.status || "Final"),
    result: typeof record.result === "string" && record.result.trim()
      ? record.result.trim()
      : typeof record.testResult === "string" && record.testResult.trim() ? record.testResult.trim() : "",
  })).filter((record) => record.title || record.detail);
  const medicationMap = new Map<string, {
    date: string; name: string; dose: string; route: string; frequency: string;
    detail: string; status: string; kind: "order" | "given"; givenCount: number; lastGivenAt: string;
  }>();
  const medicineKey = (record: Record<string, any>) => [record.medicationName, record.dosage, record.route]
    .map((part) => String(part || "").trim().toLowerCase()).join("|");
  for (const record of medicationOrders as Array<Record<string, any>>) {
    const key = medicineKey(record);
    const existing = medicationMap.get(key);
    medicationMap.set(key, {
      date: iso(record.startDate || record.createdAt),
      name: String(record.medicationName || ""),
      dose: String(record.dosage || ""),
      route: String(record.route || ""),
      frequency: String(record.frequency || ""),
      detail: text(record.dosage, record.route, record.frequency, record.instructions),
      status: String(record.status || ""),
      kind: existing?.kind === "given" ? "given" : "order",
      givenCount: existing?.givenCount || 0,
      lastGivenAt: existing?.lastGivenAt || "",
    });
  }
  for (const record of administeredMedicines as Array<Record<string, any>>) {
    if (record.status !== "GIVEN") continue;
    const key = medicineKey(record);
    const when = iso(record.administeredTime || record.scheduledTime || record.createdAt);
    const existing = medicationMap.get(key);
    if (existing) {
      existing.givenCount += 1;
      if (!existing.lastGivenAt || (when && new Date(when).getTime() > new Date(existing.lastGivenAt).getTime())) existing.lastGivenAt = when;
      existing.kind = "given";
    } else {
      medicationMap.set(key, {
        date: when,
        name: String(record.medicationName || ""),
        dose: String(record.dosage || ""),
        route: String(record.route || ""),
        frequency: "",
        detail: text(record.dosage, record.route),
        status: "GIVEN",
        kind: "given",
        givenCount: 1,
        lastGivenAt: when,
      });
    }
  }
  const medicineSummary = [...medicationMap.values()].filter((medicine) => medicine.name);
  const medicationSummary = [
    ...(medicationOrders as Array<Record<string, any>>).map((record) => ({
      date: iso(record.startDate || record.createdAt),
      name: String(record.medicationName || ""),
      detail: text(record.dosage, record.route, record.frequency, record.instructions),
      status: String(record.status || ""),
    })),
    ...(administeredMedicines as Array<Record<string, any>>).filter((record) => record.status === "GIVEN").map((record) => ({
      date: iso(record.administeredTime || record.scheduledTime || record.createdAt),
      name: String(record.medicationName || ""),
      detail: text(record.dosage, record.route),
      status: String(record.status),
    })),
  ];
  const vitalSummary = [
    ...(vitals as Array<Record<string, any>>).map((record) => ({
      date: iso(record.dateRecorded || record.createdAt),
      detail: vitalText(record),
    })),
    ...(nursingRecords as Array<Record<string, any>>).map((record) => ({
      date: iso(record.recordDate || record.createdAt),
      detail: vitalText(record.vitals || {}),
    })),
  ].filter((record) => record.date && record.detail).sort((left, right) => new Date(left.date).getTime() - new Date(right.date).getTime());

  const latestInvoice = [...invoices].sort((left: any, right: any) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())[0];
  const advances = latestInvoice
    ? (payments as Array<Record<string, any>>).filter((payment) => payment.type === "ADVANCE" && String(payment.invoiceId) === String(latestInvoice._id))
    : [];
  const advanceReceived = advances.reduce((sum, payment) => sum + Math.max(0, Number(payment.amount) || 0), 0);
  const billSummary = latestInvoice ? {
    total: Math.max(0, Number(latestInvoice.finalAmount) || 0),
    advanceAdjusted: Math.min(advanceReceived, Math.max(0, Number(latestInvoice.paidAmount) || 0), Math.max(0, Number(latestInvoice.finalAmount) || 0)),
    paid: Math.max(0, Number(latestInvoice.paidAmount) || 0),
    balance: Math.max(0, Number(latestInvoice.balanceAmount) || 0),
    invoiceNumber: latestInvoice.invoiceNumber || String(latestInvoice._id),
  } : null;

  return {
    days,
    transfers: Array.isArray(admission.transferHistory) ? admission.transferHistory : [],
    careTeam: {
      doctors: Array.isArray(admission.assignedDoctors) ? admission.assignedDoctors : [],
      nurses: Array.isArray(admission.assignedNurses) ? admission.assignedNurses : [],
    },
    allergies: Array.isArray(admission.patientId?.allergies) ? admission.patientId.allergies : [],
    procedures: procedures.map((record) => ({ date: iso(record.dateRecorded || record.createdAt), title: record.title, detail: record.details })),
    investigations: investigationSummary,
    medications: medicationSummary,
    medicineSummary,
    vitals: vitalSummary,
    billSummary,
    invoices,
    payments,
  };
}
