"use client";
import { Badge } from "@/components/ui/badge";
import type { ReactNode } from "react";

const CP1252_BYTES: Record<number, number> = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85,
  0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a,
  0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92,
  0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
  0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c,
  0x017e: 0x9e, 0x0178: 0x9f,
};

/** Repairs common UTF-8 text that was decoded as Windows-1252, for display only. */
export function cleanRoundDisplayText(value?: string) {
  if (!value) return "";
  const safeValue = value.replace(/\u00e2\u20ac[\ufffd\u009c\u009d]/g, '"');
  const repaired = safeValue.replace(/[\u00c2-\u00c3\u00e2][\u0080-\u00ff\u20ac\u201a\u0192\u201e\u2026\u2020\u2021\u02c6\u2030\u0160\u2039\u0152\u017d\u2018\u2019\u201c\u201d\u2022\u2013\u2014\u02dc\u2122\u0161\u203a\u0153\u017e\u0178]{1,2}/g, (sequence) => {
    const bytes = Array.from(sequence, (character) => {
      const code = character.codePointAt(0) ?? 0;
      return code <= 0xff ? code : CP1252_BYTES[code];
    });
    if (bytes.some((byte) => byte === undefined)) return sequence;
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(bytes as number[]));
    } catch {
      return sequence;
    }
  });
  return repaired
    .replace(/[\u2018\u2019\u201a\u201b]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2012-\u2015\u2212]/g, "-")
    .replace(/\u00b7/g, " - ")
    .replace(/\u2026/g, "...")
    .replace(/[\u0080-\u009f\ufffd]/g, "");
}
export interface RoundOrderView {
  _id: string; medicationName: string; dosage?: string; route?: string; frequency?: string;
  timesOfDay?: string[]; durationDays?: number; instructions?: string; status?: string; discontinueReason?: string;
}
export interface RoundView {
  _id: string; doctor?: { _id?: string; name?: string } | string; condition?: string;
  notes?: string; details?: string; chiefComplaint?: string; objectiveFindings?: string; assessment?: string; plan?: string;
  visitedAt?: string; dateRecorded?: string; createdAt?: string;
  addenda?: Array<{ _id: string; text?: string; timestamp?: string; visitedAt?: string; doctor?: { name?: string } | string }>;
  orders?: RoundOrderView[];
}
function personName(person: { name?: string } | string | undefined, fallback: string) {
  return cleanRoundDisplayText(typeof person === "string" ? person || fallback : person?.name || fallback);
}
function dateLabel(value?: string) {
  if (!value) return "Time not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Time not recorded" : date.toLocaleString();
}
function conditionStyle(condition?: string) {
  if (condition === "Critical") return "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200";
  if (condition === "Deteriorating") return "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200";
  if (condition === "Improving") return "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200";
  return "border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200";
}
export function RoundCard({ round, bedWard, attendingDoctorId, actions }: {
  round: RoundView; bedWard: string; attendingDoctorId?: string; actions?: ReactNode;
}) {
  const doctorId = typeof round.doctor === "object" ? round.doctor?._id : round.doctor;
  const attending = Boolean(attendingDoctorId && doctorId === attendingDoctorId);
  const date = round.visitedAt || round.dateRecorded || round.createdAt;
  const addenda = [...(round.addenda || [])].sort((a, b) =>
    new Date(b.timestamp || b.visitedAt || 0).getTime() - new Date(a.timestamp || a.visitedAt || 0).getTime()
  );
  const note = cleanRoundDisplayText(round.notes || round.details || [round.chiefComplaint, round.objectiveFindings, round.assessment, round.plan].filter(Boolean).join("\n") || "No round note recorded.");
  return <article className="round-print-card rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
    <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-slate-100 pb-3 dark:border-slate-800">
      <time className="text-sm font-semibold text-slate-900 dark:text-white">{dateLabel(date)}</time>
      <span className="text-sm text-slate-600 dark:text-slate-300">Dr. {personName(round.doctor, "Unknown doctor")}</span>
      <span className="text-sm text-slate-500 dark:text-slate-400">{bedWard || "Bed/ward not recorded"}</span>
      <Badge variant="outline">{attending ? "Attending" : "Team"}</Badge>
      {addenda.length > 0 && <Badge variant="outline">Edited</Badge>}
    </header>
    <div className="pt-3">
      {round.condition && <span className={"inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold " + conditionStyle(round.condition)}>{round.condition}</span>}
      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700 dark:text-slate-200">{note}</p>
    </div>
    <section className="mt-3 border-t border-slate-100 pt-3 dark:border-slate-800">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Orders given in this round</h4>
      {round.orders?.length ? <ul className="mt-2 space-y-2">{round.orders.map((order) =>
        <li key={order._id} className="rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800/60">
          <div className="flex flex-wrap items-center gap-2"><span className="font-medium text-slate-900 dark:text-white">{cleanRoundDisplayText(order.medicationName)}</span><span>{cleanRoundDisplayText(order.dosage) || "Dose not recorded"}</span><span>{cleanRoundDisplayText(order.route) || "Route not recorded"}</span><span>{cleanRoundDisplayText(order.frequency) || "Schedule not recorded"}{order.timesOfDay?.length ? " - " + cleanRoundDisplayText(order.timesOfDay.join(", ")) : ""}</span><span>{order.durationDays ? order.durationDays + " days" : "Duration not recorded"}</span><Badge variant="outline">{order.status === "ACTIVE" ? "Active" : order.status === "DISCONTINUED" ? "Stopped" : order.status || "Unknown"}</Badge></div>
          {order.instructions && <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">Nurse instruction: {cleanRoundDisplayText(order.instructions)}</p>}
          {order.status === "DISCONTINUED" && order.discontinueReason && <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">Stopped: {cleanRoundDisplayText(order.discontinueReason)}</p>}
        </li>
      )}</ul> : <p className="mt-1 text-sm text-slate-500">No medicine orders recorded for this round.</p>}
    </section>
    {addenda.length > 0 && <section className="mt-3 border-t border-slate-100 pt-3 dark:border-slate-800">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Addenda</h4>
      <div className="mt-2 space-y-2">{addenda.map((entry) =>
        <div key={entry._id} className="rounded-lg border-l-2 border-emerald-500 bg-emerald-50/60 px-3 py-2 dark:bg-emerald-950/20">
          <p className="text-xs text-slate-500">{dateLabel(entry.timestamp || entry.visitedAt)} - Dr. {personName(entry.doctor, "Unknown doctor")}</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">{cleanRoundDisplayText(entry.text)}</p>
        </div>
      )}</div>
    </section>}
    {actions && <div className="round-no-print mt-3">{actions}</div>}
  </article>;
}
