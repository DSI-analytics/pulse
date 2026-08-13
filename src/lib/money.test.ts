import { describe, it, expect } from "vitest";
import { formatMZN, formatMZNExact, parseMZN } from "./money";

describe("money formatting (centavos)", () => {
  it("formats centavos as dot-grouped MZN", () => {
    expect(formatMZN(184000000)).toBe("1.840.000 MZN");
    expect(formatMZN(125000_00)).toBe("125.000 MZN");
    expect(formatMZN(0)).toBe("0 MZN");
  });

  it("formats exact amounts with two decimals", () => {
    expect(formatMZNExact(150050)).toBe("1.500,50 MZN");
  });

  it("parses pt-style input into centavos", () => {
    expect(parseMZN("1.500,50")).toBe(150050);
    expect(parseMZN("1500.5")).toBe(150050);
    expect(parseMZN("2 000")).toBe(200000);
    expect(parseMZN("70,00 MZN")).toBe(7000);
  });

  it("round-trips", () => {
    const centavos = 4200000;
    expect(parseMZN(formatMZNExact(centavos))).toBe(centavos);
  });
});
