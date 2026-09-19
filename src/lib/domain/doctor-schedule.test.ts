import { describe, expect, it } from "vitest";
import { validateDoctorSchedule, type DoctorScheduleDraft } from "./doctor-schedule";

const week = (): DoctorScheduleDraft[] => Array.from({ length: 7 }, (_, weekday) => ({
  weekday,
  enabled: weekday >= 1 && weekday <= 5,
  startTime: "08:00",
  endTime: "16:00",
  breakStart: "12:30",
  breakEnd: "13:30",
}));

describe("validateDoctorSchedule", () => {
  it("normalises enabled days and optional breaks", () => {
    const drafts = week();
    drafts[1].breakStart = "";
    drafts[1].breakEnd = "";
    const result = validateDoctorSchedule(drafts);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.schedules).toHaveLength(5);
      expect(result.schedules[0]).toMatchObject({ weekday: 1, breakStart: null, breakEnd: null });
    }
  });

  it("requires at least one working day", () => {
    expect(validateDoctorSchedule(week().map((day) => ({ ...day, enabled: false })))).toEqual({ ok: false, error: "atLeastOneDay" });
  });

  it("rejects an invalid work interval", () => {
    const drafts = week();
    drafts[1].endTime = "07:00";
    expect(validateDoctorSchedule(drafts)).toEqual({ ok: false, error: "invalidRange" });
  });

  it("rejects a break outside working hours", () => {
    const drafts = week();
    drafts[1].breakStart = "07:30";
    expect(validateDoctorSchedule(drafts)).toEqual({ ok: false, error: "invalidBreak" });
  });
});
