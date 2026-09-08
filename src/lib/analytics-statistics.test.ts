import { describe, expect, it } from "vitest";
import { percentage, percentile, proportionConfidenceInterval, summarizeDistribution } from "./analytics-statistics";

describe("analytics statistics", () => {
  it("calculates interpolated percentiles", () => {
    expect(percentile([10, 20, 30, 40], 0.5)).toBe(25);
    expect(percentile([1, 2, 3, 4, 5], 0.9)).toBeCloseTo(4.6);
  });

  it("summarises a distribution", () => {
    expect(summarizeDistribution([1, 2, 2, 3])).toMatchObject({
      count: 4, mean: 2, median: 2, mode: 2, min: 1, max: 3,
    });
  });

  it("handles empty denominators", () => {
    expect(percentage(2, 0)).toBe(0);
    expect(proportionConfidenceInterval(0, 0)).toEqual({ low: 0, high: 0 });
  });

  it("returns a bounded Wilson interval", () => {
    const interval = proportionConfidenceInterval(10, 100);
    expect(interval.low).toBeGreaterThan(0);
    expect(interval.low).toBeLessThan(10);
    expect(interval.high).toBeGreaterThan(10);
    expect(interval.high).toBeLessThan(100);
  });
});
