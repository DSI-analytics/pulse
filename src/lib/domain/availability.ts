// Doctor availability & slot generation — pure functions (no DB, unit-testable).

export interface WeeklyRule {
  weekday: number; // 0=Sun … 6=Sat
  startTime: string; // "08:00"
  endTime: string; // "16:00"
  breakStart?: string | null;
  breakEnd?: string | null;
  slotMinutes: number;
}

export type ExceptionType = "FOLGA" | "FERIAS" | "HORARIO_ESPECIAL" | "BLOQUEIO";

export interface DayException {
  type: ExceptionType;
  startTime?: string | null;
  endTime?: string | null;
}

export interface BusyInterval {
  start: Date;
  end: Date;
}

export interface Slot {
  start: Date;
  end: Date;
  taken: boolean;
}

export function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function atTime(day: Date, minutes: number): Date {
  const d = new Date(day);
  d.setHours(0, 0, 0, 0);
  d.setMinutes(minutes);
  return d;
}

export function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/** Does [start,end) collide with any busy interval? Used to prevent double-booking. */
export function hasConflict(busy: BusyInterval[], start: Date, end: Date): boolean {
  return busy.some((b) => overlaps(start, end, b.start, b.end));
}

/**
 * Generate the bookable slots for a doctor on a given day.
 * Applies weekly rule + date exceptions, then marks slots taken by `busy`.
 */
export function generateDaySlots(
  day: Date,
  rule: WeeklyRule | undefined,
  exceptions: DayException[],
  busy: BusyInterval[],
): Slot[] {
  // Full-day blocks remove availability entirely.
  if (exceptions.some((e) => e.type === "FOLGA" || e.type === "FERIAS")) return [];

  let startMin: number;
  let endMin: number;
  const special = exceptions.find((e) => e.type === "HORARIO_ESPECIAL");
  if (special?.startTime && special?.endTime) {
    startMin = timeToMinutes(special.startTime);
    endMin = timeToMinutes(special.endTime);
  } else if (rule) {
    startMin = timeToMinutes(rule.startTime);
    endMin = timeToMinutes(rule.endTime);
  } else {
    return [];
  }

  const slotLen = rule?.slotMinutes ?? 30;
  const breakStart = rule?.breakStart ? timeToMinutes(rule.breakStart) : null;
  const breakEnd = rule?.breakEnd ? timeToMinutes(rule.breakEnd) : null;
  const blocks = exceptions
    .filter((e) => e.type === "BLOQUEIO" && e.startTime && e.endTime)
    .map((e) => [timeToMinutes(e.startTime!), timeToMinutes(e.endTime!)] as const);

  const slots: Slot[] = [];
  for (let m = startMin; m + slotLen <= endMin; m += slotLen) {
    const s = m;
    const e = m + slotLen;
    // Skip lunch break.
    if (breakStart !== null && breakEnd !== null && s < breakEnd && breakStart < e) continue;
    // Skip ad-hoc blocks.
    if (blocks.some(([bs, be]) => s < be && bs < e)) continue;

    const start = atTime(day, s);
    const end = atTime(day, e);
    slots.push({ start, end, taken: hasConflict(busy, start, end) });
  }
  return slots;
}
