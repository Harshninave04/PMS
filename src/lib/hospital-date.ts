import { DEFAULT_HOSPITAL_TIME_ZONE } from "@/types/hospital-profile";

function dateParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "00";
  return { year: value("year"), month: value("month"), day: value("day"), hour: value("hour"), minute: value("minute") };
}

export function toHospitalDateTimeInput(value: Date | string, timeZone = DEFAULT_HOSPITAL_TIME_ZONE): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = dateParts(date, timeZone);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export function hospitalDateTimeInputToUtc(value: string, timeZone = DEFAULT_HOSPITAL_TIME_ZONE): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const [, yearText, monthText, dayText, hourText, minuteText] = match;
  const [year, month, day, hour, minute] = [yearText, monthText, dayText, hourText, minuteText].map(Number);
  const target = Date.UTC(year, month - 1, day, hour, minute);
  let instant = target;
  try {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const local = dateParts(new Date(instant), timeZone);
      const represented = Date.UTC(Number(local.year), Number(local.month) - 1, Number(local.day), Number(local.hour), Number(local.minute));
      instant += target - represented;
    }
  } catch {
    return null;
  }
  const converted = new Date(instant);
  const convertedParts = dateParts(converted, timeZone);
  if (`${convertedParts.year}-${convertedParts.month}-${convertedParts.day}T${convertedParts.hour}:${convertedParts.minute}` !== value) return null;
  return converted;
}

export function formatHospitalDateTime(value?: Date | string | null, timeZone = DEFAULT_HOSPITAL_TIME_ZONE): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h12",
  }).formatToParts(date);
  const valueOf = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${valueOf("day")} ${valueOf("month")} ${valueOf("year")}, ${valueOf("hour")}:${valueOf("minute")} ${valueOf("dayPeriod").toUpperCase()}`;
}

export function formatHospitalDate(value?: Date | string | null, timeZone = DEFAULT_HOSPITAL_TIME_ZONE): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, day: "2-digit", month: "short", year: "numeric" }).formatToParts(date);
  const valueOf = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${valueOf("day")} ${valueOf("month")} ${valueOf("year")}`;
}

export function formatLengthOfStay(startValue?: Date | string | null, endValue?: Date | string | null, now = Date.now()): string {
  if (!startValue) return "Not recorded";
  const start = new Date(startValue).getTime();
  const end = endValue ? new Date(endValue).getTime() : now;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return "Not recorded";
  const totalHours = Math.max(1, Math.ceil((end - start) / 3_600_000));
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  return `${days} ${days === 1 ? "day" : "days"} ${hours} ${hours === 1 ? "hour" : "hours"}`;
}
