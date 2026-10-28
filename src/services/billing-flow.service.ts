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

export interface SuggestedInvoiceItem {
    name: string;
    price: number;
    quantity: number;
    discount: number;
    tax: number;
    total: number;
    source: "BED" | "ROUNDS" | "MEDICATION";
    detail?: string;
}

function applyBranchConvention(query: Record<string, unknown>, actor?: BillingActor) {
    if (actor && !actor.isSuperAdmin && actor.orgScope === "BRANCH" && actor.branchId) {
        query.branchId = new Types.ObjectId(actor.branchId.toString());
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
    applyBranchConvention(query, actor);

    const admissions = await Admission.find(query)
        .populate("patientId", "name uhid age gender contact bloodGroup allergies insurance")
        .populate("doctorId", "name")
        .populate("dischargeRequestedBy", "name")
        .populate("billingRequestedBy", "name")
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
              .select("_id admissionId invoiceNumber finalAmount status createdAt")
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
            flaggedByName: names.flaggedByName,
            dischargeRequestNotes: (adm.dischargeRequestNotes as string | undefined) || undefined,
            sentByName: names.sentByName,
            billingRequestedAt: adm.billingRequestedAt as Date | undefined,
            expectedDischargeAt: adm.expectedDischargeAt as Date | undefined,
            admissionDate: adm.admissionDate,
            diagnosis: adm.initialDiagnosis || adm.reasonForAdmission || "Clinical Care",
            nurseNoteCount: notes.length,
            latestNurseNote: latestNote?.text as string | undefined,
            invoice: invoice
                ? {
                      invoiceId: invoice._id,
                      invoiceNumber: invoice.invoiceNumber,
                      finalAmount: invoice.finalAmount,
                      status: invoice.status,
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

function buildBedAndNursingRows(
    bed: Record<string, unknown> | undefined,
    ward: Record<string, unknown> | undefined,
    days: number
): SuggestedInvoiceItem[] {
    const bedRate = firstDefined(bed?.bedRatePerDay, ward?.bedRatePerDay);
    const nursingRate = firstDefined(bed?.nursingRatePerDay, ward?.nursingRatePerDay);
    const wardLabel = (ward?.wardName as string) || (ward?.wardType as string) || "General";
    const rows: SuggestedInvoiceItem[] = [
        {
            name: `Bed charges — ${wardLabel}`,
            price: bedRate ?? 0,
            quantity: days,
            discount: 0,
            tax: 0,
            total: round2((bedRate ?? 0) * days),
            source: "BED",
            detail:
                bedRate === undefined
                    ? "No bed rate configured — set it in Wards & Beds (red rows block save)"
                    : `${fmtRate(bedRate)}/day · stays stay editable in this bill only`,
        },
        {
            name: "Nursing charges",
            price: nursingRate ?? 0,
            quantity: days,
            discount: 0,
            tax: 0,
            total: round2((nursingRate ?? 0) * days),
            source: "BED",
            detail:
                nursingRate === undefined
                    ? "No nursing rate configured — set it in Wards & Beds (red rows block save)"
                    : undefined,
        },
    ];
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

// Pre-computed charge rows for one flagged stay: bed + nursing x days,
// doctor rounds from the care timeline, and every dose the eMAR recorded
// as GIVEN (drugs have no unit master price yet, so price is left editable).
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

    const [rounds, givenDoses, supplyRecords] = await Promise.all([
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

    const items: SuggestedInvoiceItem[] = [
        ...buildBedAndNursingRows(bed, ward, stayDays),
        ...(await buildDoctorRoundRows(rounds)),
    ];

    const medicationMap = new Map<string, number>();
    for (const dose of givenDoses) {
        const key = `${dose.medicationName} | ${dose.dosage || ""}`;
        medicationMap.set(key, (medicationMap.get(key) ?? 0) + 1);
    }
    for (const [key, units] of Array.from(medicationMap.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
        const [medicationName, dosage] = key.split(" | ");
        items.push({
            name: dosage ? `Medication — ${medicationName} (${dosage})` : `Medication — ${medicationName}`,
            price: 0,
            quantity: units,
            discount: 0,
            tax: 0,
            total: 0,
            source: "MEDICATION",
            detail: `${units} dose(s) recorded as given on the eMAR — set the price`,
        });
    }

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
    };

    return { context, items };
}

export type BillingDraft = Awaited<ReturnType<typeof buildAdmissionDraft>>;
