import { format } from "date-fns";
import { pt } from "date-fns/locale";
import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";

export const CLINIC_TZ = process.env.APP_TZ ?? "Africa/Maputo";

/** "13 Ago 2026" */
export function formatDatePt(date: Date | string): string {
  return formatInTimeZone(new Date(date), CLINIC_TZ, "dd MMM yyyy", { locale: pt });
}

/** "13/08/2026" */
export function formatDateShort(date: Date | string): string {
  return formatInTimeZone(new Date(date), CLINIC_TZ, "dd/MM/yyyy");
}

/** "08:30" */
export function formatTime(date: Date | string): string {
  return formatInTimeZone(new Date(date), CLINIC_TZ, "HH:mm");
}

/** "13 Ago 2026, 08:30" */
export function formatDateTimePt(date: Date | string): string {
  return formatInTimeZone(new Date(date), CLINIC_TZ, "dd MMM yyyy, HH:mm", { locale: pt });
}

/** "seg", "ter"… */
export function weekdayShort(date: Date | string): string {
  return formatInTimeZone(new Date(date), CLINIC_TZ, "EEE", { locale: pt });
}

/** "Agosto 2026" (capitalised) */
export function monthLabel(date: Date | string): string {
  const s = formatInTimeZone(new Date(date), CLINIC_TZ, "MMMM yyyy", { locale: pt });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Today's date in the clinic timezone, as yyyy-MM-dd (never the UTC day). */
export function clinicTodayIso(): string {
  return formatInTimeZone(new Date(), CLINIC_TZ, "yyyy-MM-dd");
}

/** "Quinta-feira, 14 Ago 2026" */
export function formatWeekdayDatePt(date: Date | string): string {
  const s = formatInTimeZone(new Date(date), CLINIC_TZ, "EEEE, dd MMM yyyy", { locale: pt });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Clinic-local "now". */
export function clinicNow(): Date {
  return toZonedTime(new Date(), CLINIC_TZ);
}

/** Start/end of a local day, as UTC Date instances suitable for DB range queries. */
export function dayRange(date: Date = new Date()): { start: Date; end: Date } {
  const iso = formatInTimeZone(date, CLINIC_TZ, "yyyy-MM-dd");
  const start = fromZonedTime(`${iso}T00:00:00.000`, CLINIC_TZ);
  const end = fromZonedTime(`${iso}T23:59:59.999`, CLINIC_TZ);
  return { start, end };
}

export { format, pt };
