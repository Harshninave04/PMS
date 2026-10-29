import Admission from "@/models/admission.model";
import "@/models/patient.model";
import "@/models/user.model";
import "@/models/bed.model";
import "@/models/room.model";
import "@/models/ward.model";
import "@/models/doctor.model";
import Doctor from "@/models/doctor.model";
import { ClinicalRecord } from "@/models/clinical-record.model";
import NursingMedication from "@/models/nursing-medication.model";
import Medicine from "@/models/medicine.model";
import { MedicationOrder } from "@/models/medication-order.model";
import PaymentModel from "@/models/payment.model";
import NursingMedicalSupply from "@/models/nursing-medical-supply.model";
import Service from "@/models/service.model";
import Organization from "@/models/organization.model";
import Invoice from "@/models/invoice.model";
import { Types } from "mongoose";
import { num, round2 } from "@/lib/money";

export interface BillingActor {
    userId?: Types.ObjectId | string;
    roleName?: string;
    isSuperAdmin?: boolean;
    branchId?: Types.ObjectId | string;
    organizationId?: Types.ObjectId | string;
    orgScope?: string;
}

const ACTIVE_INPATIENT_STATUSES = ["ADMITTED", "TRANSFERRED"];

export function resolveBillingBranchId(actor?: BillingActor): string | undefined {
    const branchId = actor?.branchId || actor?.organizationId;
    return branchId?.toString();
}

export interface SuggestedInvoiceItem {
    name: string;
    price: number;
    quantity: number;
    discount: number;
    tax: number;
    total: number;
    source: "BED" | "ROUNDS" | "MEDICATION" | "ORDER" | "ICU_MONITORING";
    detail?: string;
}

// Wards whose patients are monitored around the clock: the draft adds an
// hourly monitoring row priced from the "ICU Monitoring" service (Billing >
// Rates) when the ward type matches.
const MONITORED_WARD_TYPES = new Set(["ICU", "CCU", "NICU", "PICU"]);

async function applyBranchConvention(query: Record<string, unknown>, actor?: BillingActor) {
    if (!actor || actor.isSuperAdmin || actor.orgScope === "GLOBAL") return;
    if (actor.orgScope === "BRANCH") {
        const branchId = resolveBillingBranchId(actor);
        if (branchId && Types.ObjectId.isValid(branchId)) query.branchId = new Types.ObjectId(branchId);
        else query.branchId = { $in: [] };
        return;
    }
    if (actor.orgScope === "ORGANIZATION") {
        const organizationId = actor.organizationId?.toString();
        if (!organizationId || !Types.ObjectId.isValid(organizationId)) {
            query.branchId = { $in: [] };
            return;
        }
        const branchIds = await Organization.find({
            $or: [
                { _id: new Types.ObjectId(organizationId) },
                { headQuarter: new Types.ObjectId(organizationId) },
            ],
        }).distinct("_id");
        query.branchId = { $in: branchIds };
    }
}

// Legacy data cover: some older admissions kept a Doctor-profile id inside
// `doctorId` (the model now refs User), so the plain populate silently leaves
// the raw ObjectId and cards fall back to "Attending Physician". For those
// rows only, resolve the name through the Doctor profile's user.
function rawIdString(value: unknown): string {
    if (value instanceof Types.ObjectId) return value.toString();
    if (typeof value === "string") return value;
    if (value && typeof value === "object") {
        const doc = value as { _id?: unknown };
        if (doc._id) return String(doc._id);
    }
    return "";
}

async function resolveLegacyDoctorNames(admissions: Array<Record<string, unknown>>): Promise<Map<string, string>> {
    const unresolved = new Set<string>();
    for (const admission of admissions) {
        if (!admission.doctorId) continue;
        const doctor = admission.doctorId as { name?: unknown };
        if (doctor && typeof doctor.name === "string") continue; // resolved already
        const id = rawIdString(admission.doctorId);
        if (id && Types.ObjectId.isValid(id)) unresolved.add(id);
    }
    if (unresolved.size === 0) return new Map();
    const doctors = await Doctor.find({ _id: { $in: Array.from(unresolved).map((id) => new Types.ObjectId(id)) } })
        .select("userId")
        .populate("userId", "name")
        .lean();
    const names = new Map<string, string>();
    for (const doctor of doctors as Array<{ _id?: unknown; userId?: { name?: unknown } | null }>) {
        const id = doctor._id ? String(doctor._id) : "";
        const name = doctor.userId?.name;
        if (id && typeof name === "string" && name) names.set(id, name);
    }
    return names;
}

interface QueueNames {
    doctorName?: string;
    flaggedByName?: string;
    sentByName?: string;
}

// Composes display names for one admission, including the legacy fallbacks:
// sent-by falls back to the latest nurse handover when the billing handoff
// stamp cannot be resolved.
function composeQueueNames(admission: Record<string, unknown>, legacyDoctors: Map<string, string>): QueueNames {
    const doctor = admission.doctorId as { name?: string } | undefined;
    const flaggedBy = admission.dischargeRequestedBy as { name?: string } | undefined;
    const sentBy = admission.billingRequestedBy as { name?: string } | undefined;
    const handovers = Array.isArray(admission.nursingHandoverHistory)
        ? (admission.nursingHandoverHistory as Array<{ fromNurseId?: { name?: string } }>)
        : [];
    const latestHandover = handovers[handovers.length - 1];

    const resolvedDoctor = doctor?.name
        ? `Dr. ${doctor.name}`
        : legacyDoctors.get(rawIdString(admission.doctorId));

    return {
        doctorName: resolvedDoctor || "Attending Physician",
        flaggedByName: typeof flaggedBy?.name === "string" && flaggedBy.name ? flaggedBy.name : undefined,
        sentByName:
            typeof sentBy?.name === "string" && sentBy.name
                ? sentBy.name
                : typeof latestHandover?.fromNurseId?.name === "string" && latestHandover.fromNurseId.name
                    ? latestHandover.fromNurseId.name
                    : undefined,
    };
}

// The accountant's intake: stays the nurse marked "Sent to billing".
// Billed stays (a non-cancelled invoice already linked) carry their invoice.
export async function getBillingQueue(actor?: BillingActor) {
    const query: Record<string, unknown> = {
        dischargeRequested: true,
        billingRequested: true,
        status: { $in: ACTIVE_INPATIENT_STATUSES },
    };
    await applyBranchConvention(query, actor);

    const admissions = await Admission.find(query)
        .populate("patientId", "name uhid age gender contact bloodGroup allergies insurance")
        .populate("doctorId", "name")
        .populate("dischargeRequestedBy", "name")
        .populate("billingRequestedBy", "name")
        .populate("assignedNurses", "name")
        .populate("assignedDoctors", "name")
        .populate("nursingHandoverHistory.fromNurseId", "name")
        .populate({
            path: "bedId",
            populate: {
                path: "roomId",
                populate: { path: "wardId" }
            }
        })
        .sort({ billingRequestedAt: 1 })
        .lean();

    const legacyDoctorNames = await resolveLegacyDoctorNames(admissions as Array<Record<string, unknown>>);

    const admissionIds = admissions.map((row) => row._id);
    const invoices = admissionIds.length
        ? await Invoice.find({
              admissionId: { $in: admissionIds },
              status: { $ne: "CANCELLED" },
          })
              .select("_id admissionId invoiceNumber finalAmount paidAmount balanceAmount status billingStatus createdAt")
              .lean()
        : [];
    const invoiceByAdmission = new Map<string, (typeof invoices)[number]>();
    for (const invoice of invoices) {
        const key = invoice.admissionId?.toString();
        if (key && !invoiceByAdmission.has(key)) invoiceByAdmission.set(key, invoice);
    }

    return admissions.map((adm: Record<string, unknown>) => {
        const bed = adm.bedId as Record<string, unknown> | undefined;
        const room = bed?.roomId as Record<string, unknown> | undefined;
        const ward = room?.wardId as Record<string, unknown> | undefined;
        const patient = adm.patientId as Record<string, unknown> | undefined;
        const insurance = adm.insurance as { provider?: string; policyNumber?: string } | undefined;
        const notes = Array.isArray(adm.dischargeNotes)
            ? (adm.dischargeNotes as Array<Record<string, unknown>>)
            : [];
        const latestNote = notes.length > 0 ? notes[notes.length - 1] : undefined;
        const admissionId = String(adm._id ?? "");
        const invoice = invoiceByAdmission.get(admissionId);
        const names = composeQueueNames(adm, legacyDoctorNames);
        const assignedNurses = Array.isArray(adm.assignedNurses)
            ? (adm.assignedNurses as Array<Record<string, unknown>>).map((nurse) => String(nurse.name || "")).filter(Boolean)
            : [];
        const assignedDoctors = Array.isArray(adm.assignedDoctors)
            ? (adm.assignedDoctors as Array<Record<string, unknown>>).map((doctor) => String(doctor.name || "")).filter(Boolean)
            : [];
        const invoiceFinalAmount = invoice ? num(invoice.finalAmount) : 0;
        const invoicePaidAmount = invoice ? num(invoice.paidAmount) : 0;

        return {
            admissionId: adm._id,
            patientId: patient?._id,
            patientName: patient?.name || "Admitted Patient",
            uhid: patient?.uhid || "UHID-PENDING",
            age: patient?.age,
            gender: patient?.gender,
            allergies: patient?.allergies || [],
            insurance: insurance?.provider || "Self Pay",
            insurancePolicyNumber: insurance?.policyNumber,
            bedNumber: bed?.bedNumber || "Unassigned",
            roomNumber: room?.roomNumber || "Ward Room",
            wardName: ward?.wardName || "General Ward",
            wardType: ward?.wardType || "General",
            doctorName: names.doctorName,
            assignedDoctorNames: assignedDoctors.length ? assignedDoctors : [names.doctorName].filter(Boolean),
            assignedNurseNames: assignedNurses,
            flaggedByName: names.flaggedByName,
            dischargeRequestNotes: (adm.dischargeRequestNotes as string | undefined) || undefined,
            sentByName: names.sentByName,
            billingRequestedAt: adm.billingRequestedAt as Date | undefined,
            expectedDischargeAt: adm.expectedDischargeAt as Date | undefined,
            admissionDate: adm.admissionDate,
            admissionType: adm.admissionType,
            diagnosis: adm.initialDiagnosis || adm.reasonForAdmission || "Clinical Care",
            status: adm.status,
            dischargeRequested: Boolean(adm.dischargeRequested),
            billingRequested: Boolean(adm.billingRequested),
            nurseNoteCount: notes.length,
            latestNurseNote: latestNote?.text as string | undefined,
            invoice: invoice
                ? {
                      invoiceId: invoice._id,
                      invoiceNumber: invoice.invoiceNumber,
                      finalAmount: invoice.finalAmount,
                      paidAmount: invoicePaidAmount,
                      balanceAmount: invoice.balanceAmount !== undefined
                          ? round2(Math.max(0, num(invoice.balanceAmount)))
                          : round2(Math.max(0, invoiceFinalAmount - invoicePaidAmount)),
                      status: invoice.status,
                      billingStatus: invoice.billingStatus || "BILLING_COMPLETED",
                      createdAt: invoice.createdAt,
                  }
                : undefined,
        };
    });
}

export async function getLinkedInvoice(admissionId: Types.ObjectId | string) {
    const id = new Types.ObjectId(admissionId.toString());
    return await Invoice.findOne({ admissionId: id, status: { $ne: "CANCELLED" } })
        .sort({ createdAt: 1 })
        .lean();
}

// One interval of the stay on a single bed. `from`/`to` are only for display
// (details), the priced quantity is the ceiling of days.
interface BedSegment {
    bed?: Record<string, unknown> | null;
    days: number;
    from?: Date;
    to?: Date;
}

// Split the stay into bed segments using the transfer history: every transfer
// date closes the previous segment (on its from-bed / previous to-bed) and the
// current bed covers the last segment up to the billing cut-off. Days follow
// the same ceiling convention as the single-segment billing.
function buildBedSegments(
    admissionDate: Date,
    cutoffDate: Date,
    bed: Record<string, unknown> | undefined,
    transferHistory: Array<Record<string, unknown>>
): BedSegment[] {
    const cutoff = cutoffDate.getTime();
    const segments: BedSegment[] = [];
    let cursor = admissionDate.getTime();

    const push = (segmentBed: Record<string, unknown> | null | undefined, end: number) => {
        segments.push({
            bed: segmentBed ?? undefined,
            days: Math.max(1, Math.ceil((end - cursor) / 86400000)),
            from: new Date(cursor),
            to: new Date(end),
        });
        cursor = end;
    };

    const transfers = transferHistory
        .filter((transfer) => transfer.transferDate)
        .map((transfer) => ({ to: transfer.toBedId, from: transfer.fromBedId, at: new Date(transfer.transferDate as Date) }))
        .sort((a, b) => a.at.getTime() - b.at.getTime())
        .filter((transfer) => transfer.at.getTime() < cutoff);

    if (transfers.length === 0) {
        push(bed, cutoff);
        return segments;
    }

    // Segment 1 lives on the first transfer's from-bed; intermediate segments
    // on the to-bed of the previous transfer; the final segment on the current
    // (populated) bed up to the cut-off.
    push(transfers[0].from as Record<string, unknown>, transfers[0].at.getTime());
    for (let i = 1; i < transfers.length; i++) {
        push(transfers[i - 1].to as Record<string, unknown>, transfers[i].at.getTime());
    }
    push(bed, cutoff);
    return segments;
}

// Billing rates come from the Wards & Beds configuration (Bed overrides first,
// then the ward rate). An unset rate yields 0 — its draft row renders red and
// the bill cannot be saved until the rate is configured. Even though the rate
// can still be edited inside the bill, the master is never written back.
function firstDefined(...values: unknown[]): number | undefined {
    for (const value of values) {
        if (value !== undefined && value !== null && Number.isFinite(Number(value))) return Number(value);
    }
    return undefined;
}

function buildSegmentRows(segments: BedSegment[]): SuggestedInvoiceItem[] {
    const rows: SuggestedInvoiceItem[] = [];
    const multi = segments.length > 1;
    segments.forEach((segment, index) => {
        const bed = segment.bed ?? undefined;
        const ward = (bed?.roomId as Record<string, unknown> | undefined)?.wardId as Record<string, unknown> | undefined;
        const bedRate = firstDefined(bed?.bedRatePerDay, ward?.bedRatePerDay);
        const nursingRate = firstDefined(bed?.nursingRatePerDay, ward?.nursingRatePerDay);
        const wardLabel = (ward?.wardName as string) || (ward?.wardType as string) || "General";
        const suffix = multi ? ` (segment ${index + 1})` : "";
        const rangeLabel = segment.from && segment.to
            ? ` · ${segment.from.toLocaleDateString("en-IN")} → ${segment.to.toLocaleDateString("en-IN")}`
            : "";
        rows.push({
            name: `Bed charges — ${wardLabel}${suffix}`,
            price: bedRate ?? 0,
            quantity: segment.days,
            discount: 0,
            tax: 0,
            total: round2((bedRate ?? 0) * segment.days),
            source: "BED",
            detail:
                bedRate === undefined
                    ? "No bed rate configured — set it in Wards & Beds (red rows block save)"
                    : `${fmtRate(bedRate)}/day${rangeLabel} · stays editable in this bill only`,
        });
        rows.push({
            name: `Nursing charges${suffix}`,
            price: nursingRate ?? 0,
            quantity: segment.days,
            discount: 0,
            tax: 0,
            total: round2((nursingRate ?? 0) * segment.days),
            source: "BED",
            detail:
                nursingRate === undefined
                    ? "No nursing rate configured — set it in Wards & Beds (red rows block save)"
                    : multi && rangeLabel
                        ? `${fmtRate(nursingRate)}/day${rangeLabel}`
                        : undefined,
        });
    });
    return rows;
}

// tiny formatter for detail strings only (₹ with 2 decimals at most)
function fmtRate(value: number): string {
    return `₹${value % 1 === 0 ? value : value.toFixed(2)}`;
}

// Doctor round rows are billed from each doctor's consultation fee (the fee
// lives on the Doctor profile, joined via the round's doctor/author User id).
// Doctors without a fee or profile produce a red row that blocks save until
// the fee is configured; the bill row itself stays editable but the master is
// never updated from billing.
async function buildDoctorRoundRows(rounds: Array<Record<string, unknown>>): Promise<SuggestedInvoiceItem[]> {
    const byDoctor = new Map<string, { count: number; latest?: unknown }>();
    for (const round of rounds) {
        const owner = rawIdString(round.doctor ?? round.author) || "__unattributed__";
        const entry = byDoctor.get(owner) ?? { count: 0, latest: undefined };
        entry.count += 1;
        const stamp = round.visitedAt ?? round.dateRecorded ?? round.createdAt;
        if (!entry.latest || new Date(stamp as Date) > new Date(entry.latest as Date)) entry.latest = stamp;
        byDoctor.set(owner, entry);
    }

    if (byDoctor.size === 0) return [];

    const ownerIds = Array.from(byDoctor.keys()).filter((owner) => owner !== "__unattributed__");
    const profiles = ownerIds.length
        ? await Doctor.find({ userId: { $in: ownerIds.map((oid) => new Types.ObjectId(oid)) } })
              .select("userId consultationFee")
              .populate("userId", "name")
              .lean()
        : [];
    const profileByUserId = new Map<string, { fee: number; name?: string }>();
    for (const profile of profiles as Array<{ userId?: { _id?: unknown; name?: unknown } | null; consultationFee?: unknown }>) {
        const userId = profile.userId?._id ? String(profile.userId._id) : "";
        if (!userId) continue;
        profileByUserId.set(userId, {
            fee: round2(num(profile.consultationFee)),
            name: typeof profile.userId?.name === "string" ? profile.userId.name : undefined,
        });
    }

    const ordered = Array.from(byDoctor.entries()).sort((a, b) => b[1].count - a[1].count);
    const rows: SuggestedInvoiceItem[] = [];
    for (const [owner, entry] of ordered) {
        const latestLabel = entry.latest ? new Date(entry.latest as Date).toLocaleDateString() : "";
        if (owner === "__unattributed__") {
            rows.push({
                name: `Doctor charges — ${entry.count} round(s) without a doctor`,
                price: 0,
                quantity: entry.count,
                discount: 0,
                tax: 0,
                total: 0,
                source: "ROUNDS",
                detail:
                    `No doctor recorded on these rounds — set a price or delete with a reason` +
                    (latestLabel ? ` · last round ${latestLabel}` : ""),
            });
            continue;
        }
        const profile = profileByUserId.get(owner);
        const fee = profile?.fee ?? 0;
        rows.push({
            name: `Doctor charges — ${profile?.name ? `Dr. ${profile.name}` : "unlisted doctor"} (${entry.count} round(s))`,
            price: fee,
            quantity: entry.count,
            discount: 0,
            tax: 0,
            total: round2(fee * entry.count),
            source: "ROUNDS",
            detail:
                fee > 0
                    ? `Billed from the consultation fee on the doctor profile${latestLabel ? ` · last round ${latestLabel}` : ""}`
                    : `${profile ? "Consultation fee not set — configure it in Staff > Doctors" : "No doctor profile exists — add one in Staff > Doctors"} (red rows block save)`,
        });
    }
    return rows;
}

// One row per clinical order title (Lab / Radiology / Procedure / Diet orders
// the doctor placed on the stay), priced from the Services rate list when the
// title matches an active service; otherwise a red editable row.
function buildClinicalOrderRows(orders: Array<Record<string, unknown>>, serviceByExactName: Map<string, number>): SuggestedInvoiceItem[] {
    const grouped = new Map<string, { orderType: string; title: string; count: number }>();
    for (const order of orders) {
        const orderType = String(order.orderType || "Other").trim();
        const title =
            String(order.title || "").trim() ||
            String(order.details || "").trim().slice(0, 80) ||
            orderType;
        const key = `${orderType}|${title.toLowerCase()}`;
        const entry = grouped.get(key) ?? { orderType, title, count: 0 };
        entry.count += 1;
        grouped.set(key, entry);
    }
    const rows: SuggestedInvoiceItem[] = [];
    for (const [, entry] of Array.from(grouped.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
        const rate = serviceByExactName.get(entry.title.trim().toLowerCase());
        const price = rate && rate > 0 ? rate : 0;
        rows.push({
            name: `${entry.orderType} — ${entry.title}`,
            price,
            quantity: entry.count,
            discount: 0,
            tax: 0,
            total: round2(price * entry.count),
            source: "ORDER",
            detail:
                price > 0
                    ? `Priced from the Services rate list · ${entry.count} order(s) recorded`
                    : `No rate match in Services (Billing > Rates) — set the rate or delete the line (red rows block save)`,
        });
    }
    return rows;
}

// Hourly monitoring rows for ICU/CCU/NICU/PICU segments: the monitored hours
// come only from segments whose ward type is monitored (days × 24), priced
// from the "ICU Monitoring" service when configured, red otherwise.
function buildIcuMonitoringRows(segments: BedSegment[], serviceByExactName: Map<string, number>): SuggestedInvoiceItem[] {
    const monitoredHours = segments.reduce((sum, segment) => {
        const ward = (segment.bed?.roomId as Record<string, unknown> | undefined)?.wardId as Record<string, unknown> | undefined;
        const wardType = String(ward?.wardType || "").toUpperCase();
        return MONITORED_WARD_TYPES.has(wardType) ? sum + segment.days * 24 : sum;
    }, 0);
    if (!monitoredHours) return [];
    const rate = serviceByExactName.get("icu monitoring");
    const price = rate && rate > 0 ? rate : 0;
    return [
        {
            name: "ICU monitoring — hourly",
            price,
            quantity: monitoredHours,
            discount: 0,
            tax: 0,
            total: round2(price * monitoredHours),
            source: "ICU_MONITORING",
            detail:
                price > 0
                    ? `Billed from the Services rate list ("ICU Monitoring") · ${monitoredHours} monitored hour(s)`
                    : `No "ICU Monitoring" rate in Services (Billing > Rates) — add it to price ${monitoredHours} monitored hours (red rows block save)`,
        },
    ];
}

// Pre-computed charge rows for one flagged stay: bed + nursing per transfer
// segment (days per bed interval), hourly monitoring for ICU-type segments,
// doctor rounds from the care timeline, clinical
// orders (Lab/Radiology/Procedure/Diet), and every dose the eMAR recorded as
// GIVEN — prices come from the Services rate list and pharmacy stock where a
// match exists; anything unmatched stays editable and red until priced.
export async function buildAdmissionDraft(admissionId: Types.ObjectId | string, actor?: BillingActor) {
    const id = new Types.ObjectId(admissionId.toString());
    const admissionFilter: Record<string, unknown> = { _id: id };
    if (actor && !actor.isSuperAdmin && actor.orgScope === "BRANCH") {
        const allowedBranch = actor.branchId?.toString() || actor.organizationId?.toString();
        if (!allowedBranch || !Types.ObjectId.isValid(allowedBranch)) {
            throw { statusCode: 403, message: "Forbidden: Branch scope is missing" };
        }
        admissionFilter.branchId = new Types.ObjectId(allowedBranch);
    } else if (actor && !actor.isSuperAdmin && actor.orgScope === "ORGANIZATION") {
        const organizationId = actor.organizationId?.toString();
        if (!organizationId || !Types.ObjectId.isValid(organizationId)) {
            throw { statusCode: 403, message: "Forbidden: Organization scope is missing" };
        }
        const organizationBranchIds = await Organization.find({
            $or: [{ _id: new Types.ObjectId(organizationId) }, { headQuarter: new Types.ObjectId(organizationId) }],
        }).distinct("_id");
        admissionFilter.branchId = { $in: organizationBranchIds };
    }

    const admission = await Admission.findOne(admissionFilter)
        .populate("patientId", "name uhid age gender contact bloodGroup allergies insurance")
        .populate("doctorId", "name")
        .populate("dischargeRequestedBy", "name")
        .populate("billingRequestedBy", "name")
        .populate("nursingHandoverHistory.fromNurseId", "name")
        .populate("dischargeNotes.by", "name")
        .populate({
            path: "bedId",
            populate: {
                path: "roomId",
                populate: { path: "wardId" }
            }
        })
        .populate({
            path: "transferHistory.fromBedId",
            populate: {
                path: "roomId",
                populate: { path: "wardId" }
            }
        })
        .populate({
            path: "transferHistory.toBedId",
            populate: {
                path: "roomId",
                populate: { path: "wardId" }
            }
        })
        .lean();

    if (!admission) {
        throw { statusCode: 404, message: "Admission not found" };
    }
    const bed = admission.bedId as Record<string, unknown> | undefined;
    const room = bed?.roomId as Record<string, unknown> | undefined;
    const ward = room?.wardId as Record<string, unknown> | undefined;
    const patient = admission.patientId as Record<string, unknown> | undefined;
    const insurance = admission.insurance as { provider?: string; policyNumber?: string } | undefined;
    const names = composeQueueNames(admission as Record<string, unknown>, await resolveLegacyDoctorNames([admission as Record<string, unknown>]));
    const notes = Array.isArray(admission.dischargeNotes)
        ? (admission.dischargeNotes as Array<Record<string, unknown>>).map((note) => ({
              text: note.text,
              at: note.at as Date,
              nurseName: (note.by as { name?: string } | undefined)?.name || "Nurse",
          }))
        : [];

    const [rounds, givenDoses, supplyRecords, clinicalOrders, activeMedicationOrders, pendingDoses, advanceReceipts] = await Promise.all([
        ClinicalRecord.find({
            admissionId: id,
            recordType: "Progress Note",
            $or: [{ visitType: "Round" }, { visitType: { $exists: false } }],
        })
            .select("doctor author visitedAt dateRecorded createdAt")
            .sort({ visitedAt: -1, dateRecorded: -1, createdAt: -1 })
            .limit(500)
            .lean(),
        NursingMedication.find({ admissionId: id, status: "GIVEN" })
            .select("medicationName dosage")
            .sort({ scheduledTime: 1 })
            .limit(2000)
            .lean(),
        NursingMedicalSupply.find({ admissionId: id, patient: admission.patientId })
            .populate("author", "name")
            .sort({ nursingDay: 1, recordedAt: 1 })
            .lean(),
        ClinicalRecord.find({
            admissionId: id,
            recordType: "Clinical Order",
            orderType: { $in: ["Lab", "Radiology", "Procedure", "Diet"] },
        })
            .select("title details orderType dateRecorded createdAt")
            .sort({ createdAt: 1 })
            .limit(300)
            .lean(),
        MedicationOrder.find({ admissionId: id, status: "ACTIVE" })
            .select("medicationName dosage frequency")
            .sort({ createdAt: 1 })
            .limit(100)
            .lean(),
        NursingMedication.find({ admissionId: id, status: "PENDING" })
            .select("scheduledTime")
            .sort({ scheduledTime: 1 })
            .limit(2000)
            .lean(),
        // Phase 3.6: advances received for this stay that no bill has consumed
        // yet (invoiceId unset) — the bill creation applies them automatically.
        PaymentModel.find({ admissionId: id, type: "ADVANCE", invoiceId: null })
            .select("amount receiptNumber date")
            .sort({ date: 1 })
            .limit(50)
            .lean(),
    ]);

    const supplyNames = Array.from(new Set(supplyRecords.map((record) => String(record.itemName || "").trim()).filter(Boolean)));
    const matchingServices = supplyNames.length
        ? await Service.find({
              active: true,
              $or: supplyNames.map((name) => ({ name: { $regex: `^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" } })),
          }).select("name category defaultRate").lean()
        : [];
    const serviceByName = new Map(matchingServices.map((service) => [service.name.trim().toLowerCase(), service]));
    const medicalSupplies = supplyRecords.map((record) => {
        const service = serviceByName.get(String(record.itemName || "").trim().toLowerCase());
        const rate = service && Number(service.defaultRate) > 0 ? Number(service.defaultRate) : undefined;
        const author = record.author as { name?: string } | undefined;
        return {
            id: String(record._id),
            itemName: record.itemName,
            category: record.category,
            quantity: record.quantity,
            nursingDay: record.nursingDay,
            notes: record.notes || "",
            recordedAt: record.recordedAt,
            nurseName: author?.name || "Nurse",
            serviceName: service?.name,
            rate,
            missingRate: rate === undefined,
        };
    });

    const admissionDate = new Date(admission.admissionDate as Date);
    const cutoffDate = admission.expectedDischargeAt
        ? new Date(admission.expectedDischargeAt as Date)
        : new Date();
    const stayDays = Math.max(
        1,
        Math.ceil((cutoffDate.getTime() - admissionDate.getTime()) / 86400000)
    );

    // One bed segment per ward/bed interval of the stay (Phase 3.5).
    const segments = buildBedSegments(
        admissionDate,
        cutoffDate,
        bed,
        Array.isArray(admission.transferHistory)
            ? (admission.transferHistory as Array<Record<string, unknown>>)
            : []
    );

    // Price lookups run as one batch each: active services by exact name (the
    // same matching the supplies section uses) and pharmacy stock prices by
    // medicine name for the eMAR doses.
    const orderTitles = Array.from(
        new Set(
            clinicalOrders
                .map((order) => String(order.title || "").trim())
                .filter(Boolean)
        )
    );
    const needsIcuMonitoring = segments.some((segment) => {
        const segmentWard = (segment.bed?.roomId as Record<string, unknown> | undefined)?.wardId as Record<string, unknown> | undefined;
        return MONITORED_WARD_TYPES.has(String(segmentWard?.wardType || "").toUpperCase());
    });
    const serviceCandidateNames = [...orderTitles, ...(needsIcuMonitoring ? ["ICU Monitoring"] : [])];
    const [orderServiceMatches, pharmacyMedicines] = await Promise.all([
        serviceCandidateNames.length
            ? Service.find({
                  active: true,
                  $or: serviceCandidateNames.map((name) => ({
                      name: { $regex: `^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" },
                  })),
              }).select("name defaultRate").lean()
            : Promise.resolve([]),
        (() => {
            const medicationNames = Array.from(
                new Set(givenDoses.map((dose) => String(dose.medicationName || "").trim()).filter(Boolean))
            );
            return medicationNames.length
                ? Medicine.find({
                      name: {
                          $in: medicationNames.map((name) => new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i")),
                      },
                  }).select("name unitPrice").lean()
                : Promise.resolve([]);
        })(),
    ]);

    const serviceByExactName = new Map<string, number>();
    for (const service of orderServiceMatches as Array<{ name?: unknown; defaultRate?: unknown }>) {
        const name = String(service.name || "").trim().toLowerCase();
        const rate = round2(num(service.defaultRate));
        if (name && !serviceByExactName.has(name)) serviceByExactName.set(name, rate);
    }
    const pharmacyPriceByName = new Map<string, number>();
    for (const medicine of pharmacyMedicines as Array<{ name?: unknown; unitPrice?: unknown }>) {
        const name = String(medicine.name || "").trim().toLowerCase();
        const price = round2(num(medicine.unitPrice));
        if (name && !pharmacyPriceByName.has(name)) pharmacyPriceByName.set(name, price);
    }

    const medicationRows: SuggestedInvoiceItem[] = [];
    const medicationMap = new Map<string, number>();
    for (const dose of givenDoses) {
        const key = `${dose.medicationName} | ${dose.dosage || ""}`;
        medicationMap.set(key, (medicationMap.get(key) ?? 0) + 1);
    }
    for (const [key, units] of Array.from(medicationMap.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
        const [medicationName, dosage] = key.split(" | ");
        const pharmacyPrice = pharmacyPriceByName.get(medicationName.trim().toLowerCase());
        const price = pharmacyPrice && pharmacyPrice > 0 ? pharmacyPrice : 0;
        medicationRows.push({
            name: dosage ? `Medication — ${medicationName} (${dosage})` : `Medication — ${medicationName}`,
            price,
            quantity: units,
            discount: 0,
            tax: 0,
            total: round2(price * units),
            source: "MEDICATION",
            detail:
                price > 0
                    ? `${units} dose(s) given on the eMAR · unit price from the pharmacy stock list`
                    : `${units} dose(s) recorded as given on the eMAR — no pharmacy price match, set it`,
        });
    }

    const items: SuggestedInvoiceItem[] = [
        ...buildSegmentRows(segments),
        ...buildIcuMonitoringRows(segments, serviceByExactName),
        ...(await buildDoctorRoundRows(rounds)),
        ...buildClinicalOrderRows(clinicalOrders, serviceByExactName),
        ...medicationRows,
    ];

    const context = {
        admissionId: admission._id,
        patient: {
            name: patient?.name || "Admitted Patient",
            uhid: patient?.uhid || "UHID-PENDING",
            age: (patient?.age as number) ?? undefined,
            gender: (patient?.gender as string) ?? undefined,
            contact: (patient?.contact as string) ?? undefined,
            bloodGroup: (patient?.bloodGroup as string) ?? undefined,
            allergies: (patient?.allergies as string[] | undefined) || [],
        },
        insurance,
        bedNumber: bed?.bedNumber || "Unassigned",
        roomNumber: room?.roomNumber || "Ward Room",
        wardName: ward?.wardName || "General Ward",
        wardType: (ward?.wardType as string) || "General",
        doctorName: names.doctorName,
        flaggedByName: names.flaggedByName,
        dischargeRequestNotes: (admission.dischargeRequestNotes as string | undefined) || undefined,
        sentByName: names.sentByName,
        billingRequestedAt: admission.billingRequestedAt as Date | undefined,
        expectedDischargeAt: admission.expectedDischargeAt as Date | undefined,
        admissionDate: admission.admissionDate,
        stayDays,
        roundCount: rounds.length,
        doseUnits: givenDoses.length,
        nurseNotes: notes,
        medicalSupplies,
        // Pending-charge disclosure (Phase 3.4): the bill rows only cover doses
        // GIVEN so far, so the accountant must see — and confirm — what is
        // still pending before saving.
        pendingMedicationOrders: (activeMedicationOrders as Array<Record<string, unknown>>).map((order) => ({
            name: String(order.medicationName || ""),
            dosage: String(order.dosage || ""),
            frequency: String(order.frequency || ""),
        })),
        pendingDoseCount: (pendingDoses as Array<unknown>).length,
        // Advances to use (Phase 3.6): applied automatically at bill creation,
        // oldest receipt first, capped at the final amount.
        advancesAvailable: (advanceReceipts as Array<Record<string, unknown>>).map((receipt) => ({
            amount: round2(num(receipt.amount)),
            receiptNumber: String(receipt.receiptNumber || ""),
            date: receipt.date as Date,
        })),
        advanceTotal: round2(
            (advanceReceipts as Array<Record<string, unknown>>).reduce(
                (sum, receipt) => sum + round2(num(receipt.amount)),
                0
            )
        ),
    };

    return { context, items };
}

export type BillingDraft = Awaited<ReturnType<typeof buildAdmissionDraft>>;
