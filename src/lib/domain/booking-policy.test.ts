import { describe, expect, it } from "vitest";
import { isStartBookable, minimumBookableAt } from "./booking-policy";

describe("booking policy", () => {
  const now = new Date("2026-09-27T08:00:00.000Z");

  it("allows a future same-day slot when no lead time is configured", () => {
    expect(isStartBookable(new Date("2026-09-27T08:30:00.000Z"), now, 0)).toBe(true);
  });

  it("enforces the configured minimum interval", () => {
    expect(isStartBookable(new Date("2026-09-27T08:59:59.999Z"), now, 60)).toBe(false);
    expect(isStartBookable(new Date("2026-09-27T09:00:00.000Z"), now, 60)).toBe(true);
  });

  it("converts days stored as minutes into the cutoff", () => {
    expect(minimumBookableAt(now, 1440).toISOString()).toBe("2026-09-28T08:00:00.000Z");
  });
});
