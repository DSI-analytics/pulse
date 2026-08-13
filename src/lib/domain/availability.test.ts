import { describe, it, expect } from "vitest";
import { generateDaySlots, hasConflict, overlaps, type WeeklyRule } from "./availability";

const rule: WeeklyRule = {
  weekday: 1,
  startTime: "08:00",
  endTime: "16:00",
  breakStart: "12:30",
  breakEnd: "13:30",
  slotMinutes: 30,
};
const day = new Date("2026-08-17T00:00:00"); // a Monday

describe("overlaps", () => {
  it("detects overlapping intervals", () => {
    const a = new Date("2026-08-17T09:00:00");
    const b = new Date("2026-08-17T09:30:00");
    const c = new Date("2026-08-17T09:15:00");
    const d = new Date("2026-08-17T09:45:00");
    expect(overlaps(a, b, c, d)).toBe(true);
  });
  it("treats touching intervals as non-overlapping", () => {
    const a = new Date("2026-08-17T09:00:00");
    const b = new Date("2026-08-17T09:30:00");
    const c = new Date("2026-08-17T09:30:00");
    const d = new Date("2026-08-17T10:00:00");
    expect(overlaps(a, b, c, d)).toBe(false);
  });
});

describe("generateDaySlots", () => {
  it("generates 14 slots for 08:00–16:00 with a lunch break", () => {
    const slots = generateDaySlots(day, rule, [], []);
    // 16 half-hours minus 2 lunch slots = 14
    expect(slots).toHaveLength(14);
    expect(slots.every((s) => !s.taken)).toBe(true);
  });

  it("excludes the lunch break window", () => {
    const slots = generateDaySlots(day, rule, [], []);
    const times = slots.map((s) => `${s.start.getHours()}:${String(s.start.getMinutes()).padStart(2, "0")}`);
    expect(times).not.toContain("12:30");
    expect(times).not.toContain("13:00");
    expect(times).toContain("13:30");
  });

  it("returns no slots on a full-day exception (FOLGA)", () => {
    const slots = generateDaySlots(day, rule, [{ type: "FOLGA" }], []);
    expect(slots).toHaveLength(0);
  });

  it("honours special hours override", () => {
    const slots = generateDaySlots(
      day,
      rule,
      [{ type: "HORARIO_ESPECIAL", startTime: "08:00", endTime: "10:00" }],
      [],
    );
    expect(slots).toHaveLength(4); // 08:00–10:00 @ 30min
  });

  it("marks slots taken when they conflict with a busy interval", () => {
    const busy = [{ start: new Date("2026-08-17T09:00:00"), end: new Date("2026-08-17T09:30:00") }];
    const slots = generateDaySlots(day, rule, [], busy);
    const nine = slots.find((s) => s.start.getHours() === 9 && s.start.getMinutes() === 0);
    expect(nine?.taken).toBe(true);
  });
});

describe("hasConflict (double-booking prevention)", () => {
  const busy = [{ start: new Date("2026-08-17T09:00:00"), end: new Date("2026-08-17T09:30:00") }];
  it("flags an overlapping booking", () => {
    expect(hasConflict(busy, new Date("2026-08-17T09:15:00"), new Date("2026-08-17T09:45:00"))).toBe(true);
  });
  it("allows a back-to-back booking", () => {
    expect(hasConflict(busy, new Date("2026-08-17T09:30:00"), new Date("2026-08-17T10:00:00"))).toBe(false);
  });
});
