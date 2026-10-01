import { describe, expect, it } from "vitest";
import { nextSequenceValue } from "./sequences";

describe("nextSequenceValue", () => {
  it("continua depois do maior número mesmo quando existem lacunas", () => {
    expect(nextSequenceValue("diagnosticOrder", 2026, [
      "PED-2026-00001",
      "PED-2026-00003",
      "PED-2025-00999",
    ])).toBe(4);
  });

  it("ignora números malformados e começa em um quando não há emissões", () => {
    expect(nextSequenceValue("diagnosticOrder", 2026, ["PED-2026-ABC", "REC-2026-00009"])).toBe(1);
  });
});
