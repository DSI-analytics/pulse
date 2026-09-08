import { describe, expect, it } from "vitest";
import { checkAllergyConflicts, normaliseSubstance, requiresOverride, type AllergyRecord } from "./allergy-check";

const penicillin: AllergyRecord = {
  id: "a1",
  substance: "Penicilina",
  substanceKey: normaliseSubstance("Penicilina"),
  severity: "GRAVE",
  kind: "ALERGIA",
  reaction: "Urticária generalizada",
};

const lactose: AllergyRecord = {
  id: "a2",
  substance: "Lactose",
  substanceKey: normaliseSubstance("Lactose"),
  severity: "LEVE",
  kind: "INTOLERANCIA",
  reaction: null,
};

describe("normaliseSubstance", () => {
  it("strips accents, case and punctuation", () => {
    expect(normaliseSubstance("  Ácido Acetil-Salicílico ")).toBe("acido acetil salicilico");
  });
});

describe("checkAllergyConflicts", () => {
  it("matches on the active ingredient", () => {
    const warnings = checkAllergyConflicts(
      { medicationName: "Amoxil 500 mg", activeIngredient: "Penicilina" },
      [penicillin, lactose],
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({ allergyId: "a1", matchedOn: "principio_activo", confidence: "exacta" });
  });

  it("matches on the medication name when there is no ingredient", () => {
    const warnings = checkAllergyConflicts({ medicationName: "Penicilina G", activeIngredient: null }, [penicillin]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].matchedOn).toBe("medicamento");
    expect(warnings[0].confidence).toBe("parcial");
  });

  it("does not invent conflicts for unrelated drugs", () => {
    expect(checkAllergyConflicts({ medicationName: "Paracetamol", activeIngredient: "Paracetamol" }, [penicillin, lactose])).toEqual([]);
  });

  it("orders the most severe warning first", () => {
    const warnings = checkAllergyConflicts(
      { medicationName: "Composto com penicilina e lactose", activeIngredient: null },
      [lactose, penicillin],
    );
    expect(warnings.map((w) => w.severity)).toEqual(["GRAVE", "LEVE"]);
  });
});

describe("requiresOverride", () => {
  it("requires explicit confirmation only for severe or fatal allergies", () => {
    expect(requiresOverride(checkAllergyConflicts({ medicationName: "Penicilina" }, [penicillin]))).toBe(true);
    expect(requiresOverride(checkAllergyConflicts({ medicationName: "Lactose" }, [lactose]))).toBe(false);
  });
});
