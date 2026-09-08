import { describe, expect, it } from "vitest";
import { DUPLICATE_THRESHOLD, nameKey, phoneKey, rankDuplicates, scoreMatch } from "./patient-matching";

describe("nameKey", () => {
  it("normalises accents, particles and word order", () => {
    expect(nameKey("Ana Maria de Sousa")).toBe(nameKey("SOUSA, Ana María"));
  });
});

describe("phoneKey", () => {
  it("compares by the last nine digits", () => {
    expect(phoneKey("+258 84 000 0000")).toBe(phoneKey("840000000"));
    expect(phoneKey("123")).toBe("");
  });
});

describe("scoreMatch", () => {
  const base = { name: "Ana Machava", birthDate: "1990-04-21", gender: "FEMININO", phone: "840000000" };

  it("scores an identical person above the duplicate threshold", () => {
    const { score } = scoreMatch(base, { id: "p1", ...base });
    expect(score).toBeGreaterThanOrEqual(DUPLICATE_THRESHOLD);
  });

  it("penalises a different birth date even when the name matches", () => {
    const { score } = scoreMatch(base, { id: "p2", ...base, birthDate: "1975-01-02" });
    expect(score).toBeLessThan(DUPLICATE_THRESHOLD);
  });

  it("treats a shared identity document as strong evidence", () => {
    const { score, reasons } = scoreMatch(
      { name: "A. Machava", documentNumbers: ["110100123456B"] },
      { id: "p3", name: "Ana Machava", documentNumbers: ["110100123456b"] },
    );
    expect(reasons).toContain("Documento de identificação igual");
    expect(score).toBeGreaterThanOrEqual(DUPLICATE_THRESHOLD);
  });

  it("does not flag two different people who share nothing", () => {
    const { score } = scoreMatch(base, { id: "p4", name: "João Cossa", birthDate: "1980-11-02", gender: "MASCULINO" });
    expect(score).toBe(0);
  });
});

describe("rankDuplicates", () => {
  it("excludes the record itself and sorts by score", () => {
    const subject = { id: "me", name: "Ana Machava", birthDate: "1990-04-21", phone: "840000000" };
    const ranked = rankDuplicates(subject, [
      subject,
      { id: "weak", name: "Ana Machava", birthDate: "1991-01-01" },
      { id: "strong", name: "Ana Machava", birthDate: "1990-04-21", phone: "840000000" },
    ]);
    expect(ranked.map((r) => r.id)).not.toContain("me");
    expect(ranked[0].id).toBe("strong");
  });
});
