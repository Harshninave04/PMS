export const HOSPITAL_TIME_ZONE = process.env.HOSPITAL_TIME_ZONE || "Asia/Kolkata";

function partsInZone(date: Date, timeZone: string): { year: number; month: number; day: number; hour: number; minute: number; second: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute"), second: get("second") };
}

/** Convert a hospital-local wall clock time to its exact UTC instant. */
export function hospitalLocalTimeToUtc(
  year: number, month: number, day: number, hour: number, minute: number, timeZone = HOSPITAL_TIME_ZONE,
): Date {
  const targetAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  let result = targetAsUtc;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const local = partsInZone(new Date(result), timeZone);
    const representedAsUtc = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second);
    result = targetAsUtc - (representedAsUtc - result);
  }
  return new Date(result);
}

export function expandHospitalDoseTimes(
  startDate: Date,
  durationDays: number,
  timesOfDay: string[],
  frequency: string,
  timeZone = HOSPITAL_TIME_ZONE,
): Date[] {
  if (frequency === "PRN") return [];
  if (frequency === "STAT") return [new Date()];
  const parts = partsInZone(startDate, timeZone);
  const count = Math.max(1, Math.min(30, Math.floor(durationDays) || 1));
  const dates: Date[] = [];
  for (let offset = 0; offset < count; offset += 1) {
    const localDate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + offset));
    const year = localDate.getUTCFullYear();
    const month = localDate.getUTCMonth() + 1;
    const day = localDate.getUTCDate();
    for (const time of [...new Set(timesOfDay)].sort()) {
      const [hour, minute] = time.split(":").map(Number);
      dates.push(hospitalLocalTimeToUtc(year, month, day, hour, minute, timeZone));
    }
  }
  return dates;
}

export function hospitalDayKey(date: Date, timeZone = HOSPITAL_TIME_ZONE): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "00";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function stayDayNumber(admissionDate: Date, eventDate: Date, timeZone = HOSPITAL_TIME_ZONE): number {
  const admissionDay = hospitalDayKey(admissionDate, timeZone);
  const eventDay = hospitalDayKey(eventDate, timeZone);
  const start = Date.parse(`${admissionDay}T00:00:00.000Z`);
  const end = Date.parse(`${eventDay}T00:00:00.000Z`);
  return Math.max(1, Math.floor((end - start) / 86_400_000) + 1);
}
