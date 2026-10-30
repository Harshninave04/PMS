"use client";

import React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Loader2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HospitalHeader } from "@/components/print/hospital-header";
import { useHospitalProfile } from "@/components/hospital-profile/hospital-profile-context";
import { formatHospitalDate, formatHospitalDateTime, formatLengthOfStay } from "@/lib/hospital-date";
import { fmtMoney } from "@/lib/money";

interface PacketData {
  admission: any;
  invoice: any;
  advanceAdjusted: number;
  fullFile: {
    days: Array<{ dayNumber: number; events: Array<{ id: string; kind: string; at: string; title: string; detail?: string; status?: string }> }>;
    transfers: any[];
    careTeam: { doctors: any[]; nurses: any[] };
    allergies: any[];
    procedures: Array<{ date: string; title?: string; detail?: string }>;
    investigations: Array<{ date: string; type: string; title: string; detail?: string }>;
    medications: Array<{ date: string; name: string; detail: string; status: string }>;
    invoices: any[];
    payments: any[];
  };
  documentId: string;
}

const personName = (value: any) => typeof value === "object" ? value?.name : "";
const idString = (value: any) => typeof value === "object" ? value?._id : value;
const field = (value: unknown) => typeof value === "string" ? value.trim() : "";
const dateOrDash = (value: any, zone: string) => formatHospitalDateTime(value, zone);
const nameList = (values: any[]) => values.map((value) => personName(value) || (typeof value === "string" ? value : "")).filter(Boolean);

function Section({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return <section className={`packet-section ${className}`}><h3 className="section-title">{title}</h3>{children}</section>;
}

function DataTable({ headers, rows }: { headers: string[]; rows: React.ReactNode[][] }) {
  if (!rows.length) return null;
  return <div className="overflow-x-auto"><table className="packet-table"><thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody></table></div>;
}

export default function DischargePacketPage() {
  const params = useParams<{ id: string }>();
  const hospital = useHospitalProfile();
  const admissionId = params.id;
  const [packet, setPacket] = React.useState<PacketData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [mode, setMode] = React.useState<"summary" | "full">("summary");
  const [selectedDay, setSelectedDay] = React.useState("");

  React.useEffect(() => {
    let cancelled = false;
    fetch(`/api/admission/${encodeURIComponent(admissionId)}/discharge-packet`)
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error(result.message || "Unable to load discharge packet.");
        return result.data as PacketData;
      })
      .then((data) => { if (!cancelled) setPacket(data); })
      .catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : "Unable to load discharge packet."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [admissionId]);

  const jumpToDay = (value: string) => {
    setSelectedDay(value);
    if (value) document.getElementById(`day-${value}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  if (loading) return <div className="flex min-h-72 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-emerald-600" /></div>;
  if (error || !packet) return <div className="mx-auto max-w-2xl rounded-xl border bg-white p-8 text-center shadow-sm"><h1 className="text-xl font-semibold text-slate-900">Discharge packet unavailable</h1><p className="mt-2 text-sm text-slate-600">{error || "The discharge packet could not be loaded."}</p><Link href="/dashboard" className="mt-5 inline-flex"><Button variant="outline"><ArrowLeft className="mr-2 h-4 w-4" />Return to dashboard</Button></Link></div>;

  const { admission, invoice, advanceAdjusted, fullFile } = packet;
  const patient = admission.patientId ?? {};
  const bed = admission.bedId ?? {};
  const ward = bed.roomId?.wardId;
  const paid = Math.max(0, Number(invoice.paidAmount) || 0);
  const followUp = [admission.followUpDate ? `Date: ${formatHospitalDate(admission.followUpDate, hospital.timeZone)}` : "", field(admission.followUpInstructions), field(admission.dischargeAdvice)].filter(Boolean).join("\n");
  const patientName = field(patient.name) || "Not recorded";
  const patientId = field(patient.uhid) || idString(admission.patientId) || "Not recorded";
  const doctorNames = [...new Set([personName(admission.doctorId), ...nameList(fullFile.careTeam.doctors)].filter(Boolean))];
  const nurseNames = [...new Set(nameList(fullFile.careTeam.nurses))];
  const billRows = fullFile.invoices.map((item) => [
    dateOrDash(item.createdAt, hospital.timeZone), item.invoiceNumber || String(item._id), fmtMoney(Number(item.finalAmount) || 0), item.status || "",
  ]);
  const paymentRows = fullFile.payments.map((item) => [
    dateOrDash(item.date || item.createdAt, hospital.timeZone), item.receiptNumber || "", item.type || "PAYMENT", item.method || "", fmtMoney(Number(item.amount) || 0),
  ]);

  return (
    <div className={`packet-shell mx-auto max-w-5xl space-y-4 pb-8 ${mode === "full" ? "full-mode" : "summary-mode"}`}>
      <div className="packet-toolbar no-print flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white p-3 shadow-sm">
        <Link href="/dashboard" className="inline-flex"><Button variant="outline"><ArrowLeft className="mr-2 h-4 w-4" />Back</Button></Link>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border p-1" role="group" aria-label="Packet detail mode">
            <Button variant={mode === "summary" ? "default" : "ghost"} size="sm" onClick={() => setMode("summary")}>Summary</Button>
            <Button variant={mode === "full" ? "default" : "ghost"} size="sm" onClick={() => setMode("full")}>Full file</Button>
          </div>
          {mode === "full" && fullFile.days.length > 0 && <select aria-label="Jump to hospital day" className="h-9 rounded-md border bg-white px-2 text-sm" value={selectedDay} onChange={(event) => jumpToDay(event.target.value)}><option value="">Jump to day…</option>{fullFile.days.map(({ dayNumber }) => <option key={dayNumber} value={dayNumber}>Day {dayNumber}</option>)}</select>}
          <Button onClick={() => window.print()} className="gap-2"><Printer className="h-4 w-4" />Print / Save as PDF</Button>
        </div>
      </div>

      <article id="print-area" className="packet-document bg-white p-8 text-slate-900 shadow-sm">
        <div className="running-header"><span>{hospital.name}</span><span>{patientName} · UHID {patientId}</span></div>
        <div className="running-footer"><span>{packet.documentId}</span></div>
        <HospitalHeader className="packet-hospital-header" />
        <div className="text-center py-3">
          <h1 className="text-xl font-bold uppercase tracking-wide">Discharge Summary</h1>
          <p className="text-xs text-slate-600">Final patient discharge document</p>
          <p className="mt-1 text-xs text-slate-500">Document ID: {packet.documentId}</p>
        </div>

        <Section title="Patient and admission details">
          <div className="detail-grid">
            <p><b>Patient:</b> {patientName}</p><p><b>Age / Gender:</b> {[patient.age != null ? `${patient.age} years` : "", patient.gender].filter(Boolean).join(" / ") || "Not recorded"}</p>
            <p><b>Patient ID / UHID:</b> {patientId}</p><p><b>Admission type:</b> {admission.admissionType || "Not recorded"}</p>
            <p><b>Admission date:</b> {formatHospitalDateTime(admission.admissionDate, hospital.timeZone) || "Not recorded"}</p><p><b>Discharge date:</b> {formatHospitalDateTime(admission.dischargeDate, hospital.timeZone) || "Not recorded"}</p>
            <p><b>Length of stay:</b> {formatLengthOfStay(admission.admissionDate, admission.dischargeDate)}</p><p><b>Ward / Bed:</b> {[ward?.wardName, bed.bedNumber ? `Bed ${bed.bedNumber}` : ""].filter(Boolean).join(" / ") || "Not recorded"}</p>
            <p><b>Primary doctor:</b> {personName(admission.doctorId) || "Not recorded"}</p>
          </div>
        </Section>

        <Section title="Clinical discharge details">
          <div className="detail-grid"><p><b>Condition at discharge:</b> {admission.dischargeCondition || "Not recorded"}</p><p><b>Final diagnosis:</b> {field(admission.finalDiagnosis) || "Not recorded"}</p></div>
          <div className="mt-3"><b>Hospital treatment summary</b><p className="mt-1 whitespace-pre-wrap">{field(admission.dischargeSummary) || "Not recorded"}</p></div>
          {followUp && <div className="mt-3"><b>Discharge advice and follow-up</b><p className="mt-1 whitespace-pre-wrap">{followUp}</p></div>}
          {Array.isArray(admission.dischargeMedications) && admission.dischargeMedications.length > 0 && <div className="mt-3"><b>Discharge medications</b><ul className="mt-1 list-disc pl-5">{admission.dischargeMedications.map((medicine: any, index: number) => <li key={medicine._id || index}>{[medicine.medicineName, medicine.dosage, medicine.frequency, medicine.duration, medicine.instructions].filter(Boolean).join(" · ")}</li>)}</ul></div>}
        </Section>

        <Section title="Final bill summary" className="billing-section">
          <div className="detail-grid"><p>Total payable: <b>{fmtMoney(Number(invoice.finalAmount) || 0)}</b></p><p>Advance adjusted: <b>{fmtMoney(advanceAdjusted)}</b></p><p>Amount paid: <b>{fmtMoney(paid)}</b></p><p>Balance due: <b>{fmtMoney(Number(invoice.balanceAmount) || 0)}</b></p></div>
          <p className="mt-2 text-xs">Final invoice: {invoice.invoiceNumber || invoice._id}</p>
        </Section>

        {mode === "full" && <>
          <div className="table-of-contents page-start"><h2 className="section-title">Contents</h2><ol className="list-decimal space-y-1 pl-5 text-sm"><li>Patient and admission details</li><li>Care team, allergies and bed transfers</li><li>Procedures and diagnosis</li><li>Day-wise clinical timeline</li><li>Medication and investigation summary</li><li>Billing and payment history</li><li>Discharge advice and signatures</li></ol></div>

          {(doctorNames.length > 0 || nurseNames.length > 0 || fullFile.allergies.length > 0 || fullFile.transfers.length > 0) && <Section title="Care team, allergies and bed transfers" className="page-start">
            {doctorNames.length > 0 && <p><b>Doctors:</b> {doctorNames.join(", ")}</p>}{nurseNames.length > 0 && <p><b>Nurses:</b> {nurseNames.join(", ")}</p>}
            {fullFile.allergies.length > 0 && <p><b>Allergies:</b> {fullFile.allergies.map((allergy: any) => typeof allergy === "string" ? allergy : allergy?.name || allergy?.allergen || allergy?.description).filter(Boolean).join(", ")}</p>}
            {fullFile.transfers.length > 0 && <DataTable headers={["Date", "From bed", "To bed", "Reason", "Notes"]} rows={fullFile.transfers.map((transfer: any) => [dateOrDash(transfer.transferDate, hospital.timeZone), String(transfer.fromBedId?.bedNumber || transfer.fromBedId || ""), String(transfer.toBedId?.bedNumber || transfer.toBedId || ""), transfer.reason || "", transfer.notes || ""])}/ >}
          </Section>}

          {(fullFile.procedures.length > 0 || admission.finalDiagnosis) && <Section title="Procedures and final diagnosis">
            <p><b>Final diagnosis:</b> {field(admission.finalDiagnosis) || "Not recorded"}</p>
            <DataTable headers={["Date", "Procedure", "Details"]} rows={fullFile.procedures.map((item) => [dateOrDash(item.date, hospital.timeZone), item.title || "", item.detail || ""])}/>
          </Section>}

          <Section title="Day-wise clinical timeline" className="page-start day-section">
            {fullFile.days.map(({ dayNumber, events }) => <section id={`day-${dayNumber}`} key={dayNumber} className="day-card"><h4>Day {dayNumber}</h4>{events.length ? <DataTable headers={["Time", "Record", "Details"]} rows={events.map((event) => [dateOrDash(event.at, hospital.timeZone), <>{event.title}{event.status && <span className="status-chip">{event.status}</span>}</>, event.detail || ""])}/> : <p className="text-sm text-slate-600">No entries recorded for this day.</p>}</section>)}
          </Section>

          {(fullFile.medications.length > 0 || fullFile.investigations.length > 0) && <Section title="Medication and investigation summary">
            <DataTable headers={["Date", "Medicine", "Dose / instructions", "Status"]} rows={fullFile.medications.map((item) => [dateOrDash(item.date, hospital.timeZone), item.name, item.detail, item.status])}/>
            <DataTable headers={["Date", "Type", "Investigation", "Details"]} rows={fullFile.investigations.map((item) => [dateOrDash(item.date, hospital.timeZone), item.type, item.title, item.detail || ""])}/>
          </Section>}

          <Section title="Date-wise billing and payment history" className="page-start billing-section">
            <h4 className="mb-2 font-semibold">Invoices</h4><DataTable headers={["Date", "Invoice", "Total", "Status"]} rows={billRows}/>
            <h4 className="mb-2 mt-4 font-semibold">Payments and advances</h4><DataTable headers={["Date", "Receipt", "Type", "Method", "Amount"]} rows={paymentRows}/>
            <div className="detail-grid mt-4"><p>Total payable: <b>{fmtMoney(Number(invoice.finalAmount) || 0)}</b></p><p>Advance adjusted: <b>{fmtMoney(advanceAdjusted)}</b></p><p>Amount paid: <b>{fmtMoney(paid)}</b></p><p>Balance due: <b>{fmtMoney(Number(invoice.balanceAmount) || 0)}</b></p></div>
          </Section>
        </>}

        <Section title="Signatures" className={mode === "full" ? "page-start signature-section" : "signature-section"}>
          <div className="signature-grid">{["Patient / Attendant", "Doctor", "Hospital Authority"].map((label) => <div key={label}><div className="signature-line"/><b>{label}</b><p>Signature &amp; date</p></div>)}</div>
        </Section>
        <p className="screen-document-id">Document ID: {packet.documentId}</p>
      </article>

      <style>{`
        .packet-document { position: relative; font-size: 12px; line-height: 1.5; }
        .packet-section { margin-top: 14px; padding: 12px; border: 1px solid #cbd5e1; border-radius: 5px; break-inside: avoid; page-break-inside: avoid; }
        .section-title { margin: 0 0 9px; padding: 5px 8px; background: #eef2f5; border-left: 3px solid #64748b; font-size: 12px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; }
        .detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 7px 18px; }
        .packet-table { width: 100%; border-collapse: collapse; font-size: 11px; }
        .packet-table th, .packet-table td { border: 1px solid #cbd5e1; padding: 6px 7px; text-align: left; vertical-align: top; }
        .packet-table th { background: #eef2f5; font-weight: 700; }
        .packet-table tbody tr:nth-child(even) { background: #f7f8f9; }
        .packet-table tr { break-inside: avoid; page-break-inside: avoid; }
        .page-start { break-before: page; page-break-before: always; }
        .day-card { margin: 9px 0; break-inside: avoid; page-break-inside: avoid; }
        .day-card h4 { padding: 5px 7px; margin-bottom: 5px; border: 1px solid #cbd5e1; background: #f5f6f7; font-weight: 700; }
        .status-chip { display: inline-block; margin-left: 5px; border-radius: 999px; background: #e2e8f0; color: #334155; padding: 1px 6px; font-size: 9px; }
        .signature-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 22px; padding-top: 24px; text-align: center; font-size: 10px; }
        .signature-line { height: 24px; border-bottom: 1px solid #64748b; margin-bottom: 5px; }
        .signature-grid p { color: #64748b; }
        .running-header, .running-footer { display: none; }
        @page { size: A4; margin: 18mm 13mm 17mm; }
        @media print {
          html, body { background: white !important; color: black !important; }
          body * { visibility: hidden !important; }
          #print-area, #print-area * { visibility: visible !important; }
          #print-area { position: absolute !important; left: 0 !important; top: 0 !important; width: 100% !important; max-width: none !important; padding: 0 !important; margin: 0 !important; box-shadow: none !important; color: black !important; }
          .no-print, nav, aside, [data-sidebar], header[role="banner"] { display: none !important; }
          .packet-document { font-size: 10pt; }
          .packet-section { border-radius: 0; border-color: #888; }
          .section-title, .packet-table th, .day-card h4 { background: #eee !important; color: black !important; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
          .packet-table tbody tr:nth-child(even) { background: #f6f6f6 !important; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
          .status-chip { background: white !important; color: black !important; border: 1px solid #777; }
          .running-header { display: flex; position: fixed; top: -13mm; left: 0; right: 0; justify-content: space-between; border-bottom: 1px solid #888; padding-bottom: 3px; font-size: 8pt; }
          .running-footer { display: block; position: fixed; bottom: -12mm; left: 0; right: 0; border-top: 1px solid #888; padding-top: 3px; font-size: 8pt; }
          @page { @bottom-right { content: "Page " counter(page) " of " counter(pages); font-size: 8pt; } }
          .page-start { break-before: page; page-break-before: always; }
          .day-card, .packet-table tr, .signature-section { break-inside: avoid; page-break-inside: avoid; }
          .screen-document-id { display: none; }
        }
      `}</style>
    </div>
  );
}
