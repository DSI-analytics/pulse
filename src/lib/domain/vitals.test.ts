import { describe, expect, it } from "vitest";
import { BMI_BAND_LABEL, bmiBand, computeBmi, flagVitals, parseVital } from "./vitals";

describe("computeBmi", () => {
  it("calculates BMI to one decimal", () => {
    expect(computeBmi(70, 175)).toBe(22.9);
  });

  it("returns null when data is missing or implausible", () => {
    expect(computeBmi(null, 175)).toBeNull();
    expect(computeBmi(70, null)).toBeNull();
    expect(computeBmi(0, 175)).toBeNull();
    expect(computeBmi(70, 10)).toBeNull();
    expect(computeBmi(900, 175)).toBeNull();
  });
});

describe("bmiBand", () => {
  it("classifies each band", () => {
    expect(bmiBand(17)).toBe("BAIXO_PESO");
    expect(bmiBand(22)).toBe("NORMAL");
    expect(bmiBand(27)).toBe("EXCESSO_PESO");
    expect(bmiBand(33)).toBe("OBESIDADE");
    expect(bmiBand(null)).toBeNull();
  });

  it("has a label for every band", () => {
    expect(BMI_BAND_LABEL[bmiBand(22)!]).toBe("Normal");
  });
});

describe("flagVitals", () => {
  it("returns nothing when every value is within range", () => {
    expect(flagVitals({ systolic: 120, diastolic: 80, heartRate: 70, temperature: 36.5, oxygenSaturation: 98 })).toEqual([]);
  });

  it("flags a high systolic pressure as a warning", () => {
    const flags = flagVitals({ systolic: 150, diastolic: 85 });
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({ key: "systolic", direction: "ALTO", severity: "AVISO" });
  });

  it("escalates to critical outside the critical range", () => {
    const flags = flagVitals({ oxygenSaturation: 85 });
    expect(flags[0]).toMatchObject({ key: "oxygenSaturation", direction: "BAIXO", severity: "CRITICO" });
  });

  it("ignores parameters that were not measured", () => {
    expect(flagVitals({ systolic: null, heartRate: undefined })).toEqual([]);
  });
});

describe("parseVital", () => {
  it("accepts comma decimals and empty values", () => {
    expect(parseVital("temperature", "36,8")).toBe(36.8);
    expect(parseVital("temperature", "")).toBeNull();
    expect(parseVital("temperature", null)).toBeNull();
  });

  it("rejects values outside physically plausible limits", () => {
    expect(() => parseVital("temperature", "60")).toThrow(/fora dos limites/);
    expect(() => parseVital("heartRate", "abc")).toThrow(/inválido/);
  });
});
