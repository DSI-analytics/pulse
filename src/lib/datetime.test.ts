import { describe, expect, it } from "vitest";
import { dayRange } from "./datetime";

describe("dayRange", () => {
  it("returns the exact UTC bounds of a day in Africa/Maputo", () => {
    const range = dayRange(new Date("2026-09-19T12:00:00.000Z"));
    expect(range.start.toISOString()).toBe("2026-09-18T22:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-09-19T21:59:59.999Z");
  });
});
