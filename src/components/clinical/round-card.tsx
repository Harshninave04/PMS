"use client";

import { useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";

const CP1252_BYTES: Record<number, number> = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87,
  0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91,
  0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98,
  0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f,
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
  return repaired.replace(/[\u2018\u2019\u201a\u201b]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2012-\u2015\u2212]/g, "-")
    .replace(/\u00b7/g, " - ")
    .replace(/\u2026/g, "...")
    .replace(/[\u0080-\u009f\ufffd]/g, "");
}

export interface RoundOrderView {
  _id: string;
  medicationName: string;
  dosage?: string;
  route?: string;
  frequency?: string;
  timesOfDay?: string[];
  durationDays?: number;
  instructions?: string;
  status?: string;
  discontinueReason?: string;
}

export interface RoundView {
  _id: string;
  doctor?: { _id?: string; name?: string } | string;
  condition?: string;
  notes?: string;
  details?: string;
  chiefComplaint?: string;
  objectiveFindings?: string;
  assessment?: string;
  plan?: string;
  visitedAt?: string;
  dateRecorded?: string;
  createdAt?: string;
  addenda?: Array<{ _id: string; text?: string; timestamp?: string; visitedAt?: string; doctor?: { name?: string } | string }>;
  orders?: RoundOrderView[];
}

export function formatRoundDateTime(value?: string, timeZone?: string) {
  if (!value) return "Time not recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Time not recorded";
  return new Intl.DateTimeFormat("en-GB", {
    ...(timeZone ? { timeZone } : {}),
    day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true,
  }).format(date);
}

function personName(person: { name?: string } | string | undefined, fallback: string) {
  const name = cleanRoundDisplayText(typeof person === "string" ? person || fallback : person?.name || fallback);
  return name.replace(/^(dr\.?\s*)+/i, "").trim() || fallback;
}

function conditionStyle(condition?: string) {
  if (condition === "Critical") return "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200";
  if (condition === "Deteriorating") return "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200";
  return "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200";
}

function plural(count: number, singular: string, pluralWord = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralWord}`;
}

function infoChip() {
  return "inline-flex items-center whitespace-nowrap rounded-full border border-emerald-200 bg-white/70 px-2 py-0.5 text-xs text-emerald-950 dark:border-emerald-900 dark:bg-slate-900/50 dark:text-emerald-100";
}

export function RoundCard({ round, bedWard, attendingDoctorId, actions, timeZone }: {
  round: RoundView;
  bedWard: string;
  attendingDoctorId?: string;
  actions?: ReactNode;
  timeZone?: string;
}) {
  const [showFullNote, setShowFullNote] = useState(false);
  const doctorId = typeof round.doctor === "object" ? round.doctor?._id : round.doctor;
  const attending = Boolean(attendingDoctorId && doctorId === attendingDoctorId);
  const date = round.visitedAt || round.dateRecorded || round.createdAt;
  const addenda = [...(round.addenda || [])].sort((left, right) =>
    new Date(right.timestamp || right.visitedAt || 0).getTime() - new Date(left.timestamp || left.visitedAt || 0).getTime()
  );
  const note = cleanRoundDisplayText(round.notes || round.details || [round.chiefComplaint, round.objectiveFindings, round.assessment, round.plan].filter(Boolean).join("\n"));
  const hasLongNote = note.length > 100;
  const doctor = personName(round.doctor, "Unknown doctor");
  const routeLabel = (route: string) => route.charAt(0).toUpperCase() + route.slice(1).toLowerCase();

  return <article className="round-print-card w-full rounded-xl border border-emerald-200 bg-emerald-50/70 p-2.5 shadow-sm dark:border-emerald-900 dark:bg-emerald-950/20 print:bg-white print:shadow-none">
    <header className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 text-xs sm:text-sm">
        <time className="font-semibold text-slate-900 dark:text-white">{formatRoundDateTime(date, timeZone)}</time>
        <span className="text-slate-700 dark:text-slate-200">Dr. {doctor}</span>
        <span className="text-slate-600 dark:text-slate-300">{cleanRoundDisplayText(bedWard) || "Bed/ward not recorded"}</span>
        <Badge variant="outline" className="border-emerald-300 bg-white/60 text-emerald-800 dark:border-emerald-800 dark:bg-slate-900/50 dark:text-emerald-200">{attending ? "Attending" : "Team"}</Badge>
        {round.condition && <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${conditionStyle(round.condition)}`}>{round.condition}</span>}
        {!note && <span className="text-xs text-slate-500 dark:text-slate-400">No note</span>}
      </div>
      {actions && <div className="round-no-print ml-auto shrink-0">{actions}</div>}
    </header>

    {note && <div className="mt-1 flex min-w-0 items-center gap-2 text-sm leading-5 text-slate-700 dark:text-slate-200">
      <p className={`min-w-0 flex-1 ${showFullNote ? "whitespace-pre-wrap" : "line-clamp-1"}`}>{note}</p>
      {hasLongNote && <button type="button" className="round-no-print shrink-0 text-xs font-medium text-emerald-800 underline dark:text-emerald-300" onClick={() => setShowFullNote((shown) => !shown)}>{showFullNote ? "Show less" : "Show more"}</button>}
    </div>}

    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
      <span className="inline-flex rounded-full border border-emerald-300 bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-100">Orders</span>
      {round.orders?.length ? round.orders.map((order) => (
        <span key={order._id} className={`${infoChip()} max-w-full shrink-0`}>
          <strong className="font-semibold">{cleanRoundDisplayText(order.medicationName)}</strong>
          {order.dosage && !cleanRoundDisplayText(order.medicationName).toLowerCase().replace(/\s+/g, "").includes(cleanRoundDisplayText(order.dosage).toLowerCase().replace(/\s+/g, "")) && <span className="ml-1">| {cleanRoundDisplayText(order.dosage)}</span>}
          {!order.dosage && <span className="ml-1 text-amber-700 dark:text-amber-300">| Dose: not set</span>}
          {order.route && <span className="ml-1">| {routeLabel(cleanRoundDisplayText(order.route))}</span>}
          {(order.frequency || order.timesOfDay?.length) && <span className="ml-1">| {[order.frequency ? cleanRoundDisplayText(order.frequency) : "", ...(order.timesOfDay?.length ? [cleanRoundDisplayText(order.timesOfDay.join(", "))] : [])].filter(Boolean).join(" ")}</span>}
          {order.durationDays ? <span className="ml-1">| {plural(order.durationDays, "day", "days")}</span> : null}
          <span className="ml-1 font-medium">| {order.status === "ACTIVE" ? "Active" : order.status === "DISCONTINUED" ? "Stopped" : order.status === "COMPLETED" ? "Completed" : cleanRoundDisplayText(order.status) || "Unknown"}</span>
        </span>
      )) : <span className="text-slate-500 dark:text-slate-400">No orders</span>}
    </div>

    {addenda.length > 0 && <details className="mt-1 border-t border-emerald-200/80 pt-1 dark:border-emerald-900/70">
      <summary className="w-fit cursor-pointer rounded-full border border-emerald-200 bg-white/60 px-2 py-0.5 text-xs font-medium text-emerald-900 dark:border-emerald-900 dark:bg-slate-900/40 dark:text-emerald-100">
        {plural(addenda.length, "addendum", "addenda")}
      </summary>
      <div className="mt-2 space-y-2">{addenda.map((entry) => (
        <div key={entry._id} className="rounded-lg border border-emerald-200 bg-white/50 px-2.5 py-2 dark:border-emerald-900 dark:bg-slate-900/30">
          <p className="text-xs text-slate-500">{formatRoundDateTime(entry.timestamp || entry.visitedAt, timeZone)} - Dr. {personName(entry.doctor, "Unknown doctor")}</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">{cleanRoundDisplayText(entry.text)}</p>
        </div>
      ))}</div>
    </details>}
  </article>;
}
