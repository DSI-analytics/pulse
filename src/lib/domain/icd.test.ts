import { describe, expect, it } from "vitest";
import { formatDiagnosisSummary, isValidIcdCode, normaliseIcdCode, normaliseSearchText, stripHighlight } from "./icd";

describe("stripHighlight", () => {
  it("removes the WHO highlight markup", () => {
    expect(stripHighlight("<em class='found'>Cól</em>era")).toBe("Cólera");
  });

  it("removes any other tag and decodes entities", () => {
    expect(stripHighlight("Diabetes <b>mellitus</b> tipo&nbsp;2")).toBe("Diabetes mellitus tipo 2");
    expect(stripHighlight("Asma &amp; rinite")).toBe("Asma & rinite");
  });

  it("collapses whitespace and tolerates empty input", () => {
    expect(stripHighlight("  Febre   tifóide ")).toBe("Febre tifóide");
    expect(stripHighlight("")).toBe("");
  });
});

describe("normaliseSearchText", () => {
  it("lowercases and drops accents", () => {
    expect(normaliseSearchText("Cólera")).toBe("colera");
    expect(normaliseSearchText("Infecção  INTESTINAL")).toBe("infeccao intestinal");
  });
});

describe("normaliseIcdCode", () => {
  it("trims, uppercases and removes inner spaces", () => {
    expect(normaliseIcdCode(" 1a00 ")).toBe("1A00");
    expect(normaliseIcdCode("8b60 .1")).toBe("8B60.1");
  });
});

describe("isValidIcdCode", () => {
  it("accepts the shapes used by the MMS linearization", () => {
    expect(isValidIcdCode("1A00")).toBe(true);
    expect(isValidIcdCode("8B60.1")).toBe(true);
    expect(isValidIcdCode("XN109")).toBe(true);
    expect(isValidIcdCode("LD2F.1Y")).toBe(true);
  });

  it("rejects blocks, free text and post-coordination", () => {
    expect(isValidIcdCode("")).toBe(false);
    expect(isValidIcdCode("1")).toBe(false);
    expect(isValidIcdCode("BlockL1-1A0")).toBe(false);
    expect(isValidIcdCode("1A00/5A11")).toBe(false);
    expect(isValidIcdCode("1A00&XA0055")).toBe(false);
    expect(isValidIcdCode("Cólera")).toBe(false);
  });
});

describe("formatDiagnosisSummary", () => {
  it("joins code and title", () => {
    expect(
      formatDiagnosisSummary([
        { code: "1a00", title: "<em class='found'>Cólera</em>" },
        { code: "5A11", title: "Diabetes tipo 2" },
      ]),
    ).toBe("1A00 — Cólera; 5A11 — Diabetes tipo 2");
  });

  it("returns an empty string without entries", () => {
    expect(formatDiagnosisSummary([])).toBe("");
  });
});
