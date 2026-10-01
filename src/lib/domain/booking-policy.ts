export const DEFAULT_MIN_BOOKING_LEAD_MINUTES = 0;
export const MAX_MIN_BOOKING_LEAD_MINUTES = 30 * 24 * 60;

export function minimumBookableAt(
  now: Date,
  leadMinutes: number = DEFAULT_MIN_BOOKING_LEAD_MINUTES,
): Date {
  const safeLead = Number.isFinite(leadMinutes)
    ? Math.min(MAX_MIN_BOOKING_LEAD_MINUTES, Math.max(0, Math.trunc(leadMinutes)))
    : DEFAULT_MIN_BOOKING_LEAD_MINUTES;
  return new Date(now.getTime() + safeLead * 60_000);
}

export function isStartBookable(startAt: Date, now: Date, leadMinutes: number): boolean {
  return !Number.isNaN(startAt.getTime()) && startAt.getTime() >= minimumBookableAt(now, leadMinutes).getTime();
}
