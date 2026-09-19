export interface DoctorScheduleDraft {
  weekday: number;
  enabled: boolean;
  startTime: string;
  endTime: string;
  breakStart: string;
  breakEnd: string;
}

export interface ValidDoctorSchedule {
  weekday: number;
  startTime: string;
  endTime: string;
  breakStart: string | null;
  breakEnd: string | null;
}

export type DoctorScheduleError = "invalidDays" | "atLeastOneDay" | "invalidTime" | "invalidRange" | "invalidBreak";

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

function minutes(value: string): number {
  const [hours, mins] = value.split(":").map(Number);
  return hours * 60 + mins;
}

/** Validates and normalises a complete seven-day weekly schedule. */
export function validateDoctorSchedule(
  drafts: DoctorScheduleDraft[],
): { ok: true; schedules: ValidDoctorSchedule[] } | { ok: false; error: DoctorScheduleError } {
  const weekdays = drafts.map((draft) => draft.weekday);
  if (drafts.length !== 7 || new Set(weekdays).size !== 7 || weekdays.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) {
    return { ok: false, error: "invalidDays" };
  }

  const enabled = drafts.filter((draft) => draft.enabled);
  if (enabled.length === 0) return { ok: false, error: "atLeastOneDay" };

  const schedules: ValidDoctorSchedule[] = [];
  for (const draft of enabled) {
    const startTime = draft.startTime.trim();
    const endTime = draft.endTime.trim();
    const breakStart = draft.breakStart.trim();
    const breakEnd = draft.breakEnd.trim();

    if (!TIME_PATTERN.test(startTime) || !TIME_PATTERN.test(endTime)) return { ok: false, error: "invalidTime" };
    if (minutes(startTime) >= minutes(endTime)) return { ok: false, error: "invalidRange" };
    if ((breakStart && !breakEnd) || (!breakStart && breakEnd)) return { ok: false, error: "invalidBreak" };
    if (breakStart) {
      if (!TIME_PATTERN.test(breakStart) || !TIME_PATTERN.test(breakEnd)) return { ok: false, error: "invalidTime" };
      if (minutes(breakStart) <= minutes(startTime) || minutes(breakEnd) >= minutes(endTime) || minutes(breakStart) >= minutes(breakEnd)) {
        return { ok: false, error: "invalidBreak" };
      }
    }

    schedules.push({
      weekday: draft.weekday,
      startTime,
      endTime,
      breakStart: breakStart || null,
      breakEnd: breakEnd || null,
    });
  }

  return { ok: true, schedules: schedules.sort((a, b) => a.weekday - b.weekday) };
}
