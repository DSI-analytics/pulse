import { describe, expect, it } from "vitest";
import { operationOutcome } from "./outcome";
import {
  referenceId,
  validateAllergyIntolerance,
  validateCondition,
  validateEnvelope,
  validateObservation,
  validatePatient,
} from "./validation";

describe("validateEnvelope", () => {
  it("rejects a non-object body", () => {
    const result = validateEnvelope("não é json", "Patient");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0].code).toBe("structure");
  });

  it("rejects a missing resourceType", () => {
    const result = validateEnvelope({ name: [] }, "Patient");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0].code).toBe("required");
  });

  it("rejects an unknown resourceType", () => {
    const result = validateEnvelope({ resourceType: "Invoice" }, "Patient");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0].code).toBe("not-supported");
  });

  it("rejects a resourceType that does not match the endpoint", () => {
    const result = validateEnvelope({ resourceType: "Observation" }, "Patient");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0].diagnostics).toContain("/Patient");
  });

  it("accepts a matching envelope", () => {
    expect(validateEnvelope({ resourceType: "Patient" }, "Patient").ok).toBe(true);
  });
});

describe("operationOutcome", () => {
  it("produces a well-formed OperationOutcome", () => {
    const outcome = operationOutcome([{ severity: "error", code: "invalid", diagnostics: "erro" }]);
    expect(outcome.resourceType).toBe("OperationOutcome");
    expect(outcome.issue[0]).toMatchObject({ severity: "error", code: "invalid", diagnostics: "erro" });
  });
});

describe("referenceId", () => {
  it("accepts a well-formed reference and rejects the rest", () => {
    expect(referenceId({ reference: "Patient/abc" }, "Patient")).toBe("abc");
    expect(referenceId({ reference: "Encounter/abc" }, "Patient")).toBeNull();
    expect(referenceId({ reference: "abc" }, "Patient")).toBeNull();
    expect(referenceId("Patient/abc", "Patient")).toBeNull();
    expect(referenceId(null, "Patient")).toBeNull();
  });
});

describe("validatePatient", () => {
  it("accepts a minimal valid Patient", () => {
    const result = validatePatient({
      resourceType: "Patient",
      name: [{ given: ["Ana"], family: "Machava" }],
      gender: "female",
      birthDate: "1990-04-21",
      telecom: [{ system: "phone", value: "840000000" }],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.name).toBe("Ana Machava");
      expect(result.value.gender).toBe("FEMININO");
      expect(result.value.phone).toBe("840000000");
    }
  });

  it("rejects a missing name", () => {
    const result = validatePatient({ resourceType: "Patient" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0].expression).toEqual(["Patient.name"]);
  });

  it("rejects an invalid gender code and a malformed birthDate", () => {
    const result = validatePatient({ resourceType: "Patient", name: [{ text: "Ana Machava" }], gender: "F", birthDate: "21/04/1990" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const expressions = result.issues.flatMap((i) => i.expression ?? []);
      expect(expressions).toContain("Patient.gender");
      expect(expressions).toContain("Patient.birthDate");
    }
  });

  it("rejects a telecom that is not a list", () => {
    const result = validatePatient({ resourceType: "Patient", name: [{ text: "Ana Machava" }], telecom: "840000000" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.some((i) => i.code === "structure")).toBe(true);
  });
});

describe("validateAllergyIntolerance", () => {
  it("accepts a valid resource and maps criticality to severity", () => {
    const result = validateAllergyIntolerance({
      resourceType: "AllergyIntolerance",
      patient: { reference: "Patient/pat-1" },
      code: { text: "Penicilina" },
      type: "allergy",
      category: ["medication"],
      criticality: "high",
      reaction: [{ manifestation: [{ text: "Urticária" }], severity: "severe" }],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toMatchObject({
        patientRef: "pat-1",
        substance: "Penicilina",
        category: "MEDICAMENTO",
        kind: "ALERGIA",
        severity: "GRAVE",
        status: "ACTIVA",
      });
    }
  });

  it("rejects a missing patient reference and a missing substance", () => {
    const result = validateAllergyIntolerance({ resourceType: "AllergyIntolerance" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues).toHaveLength(2);
  });

  it("rejects an invalid type", () => {
    const result = validateAllergyIntolerance({
      resourceType: "AllergyIntolerance",
      patient: { reference: "Patient/pat-1" },
      code: { text: "Pólen" },
      type: "sensibilidade",
    });
    expect(result.ok).toBe(false);
  });
});

describe("validateCondition", () => {
  it("accepts a coded condition", () => {
    const result = validateCondition({
      resourceType: "Condition",
      subject: { reference: "Patient/pat-1" },
      code: { coding: [{ system: "http://hl7.org/fhir/sid/icd-10", code: "I10", display: "Hipertensão" }] },
      verificationStatus: { coding: [{ code: "confirmed" }] },
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toMatchObject({ code: "I10", certainty: "CONFIRMADO", isActive: true });
  });

  it("rejects a malformed encounter reference", () => {
    const result = validateCondition({
      resourceType: "Condition",
      subject: { reference: "Patient/pat-1" },
      code: { text: "Gripe" },
      encounter: { reference: "Patient/pat-1" },
    });
    expect(result.ok).toBe(false);
  });
});

describe("validateObservation", () => {
  it("maps LOINC-coded components to internal vital fields", () => {
    const result = validateObservation({
      resourceType: "Observation",
      status: "final",
      subject: { reference: "Patient/pat-1" },
      effectiveDateTime: "2026-05-01T10:00:00.000Z",
      component: [
        { code: { coding: [{ code: "8480-6" }] }, valueQuantity: { value: 128, unit: "mmHg" } },
        { code: { coding: [{ code: "8462-4" }] }, valueQuantity: { value: 82, unit: "mmHg" } },
      ],
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.values).toEqual({ systolic: 128, diastolic: 82 });
  });

  it("rejects an Observation with no recognised vital sign", () => {
    const result = validateObservation({
      resourceType: "Observation",
      status: "final",
      subject: { reference: "Patient/pat-1" },
      component: [{ code: { coding: [{ code: "99999-9" }] }, valueQuantity: { value: 1 } }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0].code).toBe("value");
  });

  it("rejects a missing subject", () => {
    const result = validateObservation({ resourceType: "Observation", status: "final" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.some((i) => i.expression?.includes("Observation.subject"))).toBe(true);
  });
});
