import { describe, expect, it } from "vitest";
import {
  codeSystemUrl,
  toAllergyIntolerance,
  toCondition,
  toMedicationRequests,
  toObservation,
  toPatient,
  type AllergyRow,
  type DiagnosisRow,
  type PatientRow,
  type PrescriptionRow,
  type RefCtx,
  type VitalSignRow,
} from "./mappers";

const identity = { fhirId: "f-1", versionId: 3, lastUpdated: new Date("2026-05-01T10:00:00.000Z") };

const ctx: RefCtx = {
  patient: () => ({ fhirId: "pat-1" }),
  practitioner: () => ({ fhirId: "prac-1" }),
  encounter: () => ({ fhirId: "enc-1" }),
  organization: { fhirId: "org-1", name: "Clínica Central" },
};

const patient: PatientRow = {
  id: "p1", code: "PAC-00042", name: "Ana Maria Machava",
  birthDate: new Date("1990-04-21T00:00:00.000Z"), gender: "FEMININO", maritalStatus: "CASADO",
  phone: "840000000", phoneAlt: null, email: "ana@example.test",
  address: null, street: "Av. Julius Nyerere", streetNumber: "120", neighbourhood: "Polana",
  city: "Maputo", district: null, province: "Maputo", country: "Moçambique",
  preferredLanguage: "Português", isActive: true, deactivatedAt: null,
  emergencyContactName: "João Machava", emergencyContactRelation: "Irmão", emergencyContactPhone: "841111111",
  identityDocuments: [{ type: "BI", number: "110100123456B", issuer: "DNIC", expiresAt: new Date("2030-01-01T00:00:00.000Z") }],
};

describe("toPatient", () => {
  const resource = toPatient(patient, identity, { fhirId: "org-1", name: "Clínica Central" });

  it("produces a valid R4 Patient with meta version and lastUpdated", () => {
    expect(resource.resourceType).toBe("Patient");
    expect(resource.id).toBe("f-1");
    expect(resource.meta).toEqual({ versionId: "3", lastUpdated: "2026-05-01T10:00:00.000Z" });
  });

  it("never exposes the internal database id", () => {
    expect(JSON.stringify(resource)).not.toContain('"p1"');
  });

  it("maps the patient number and identity documents to identifiers", () => {
    const values = resource.identifier.map((i) => i.value);
    expect(values).toContain("PAC-00042");
    expect(values).toContain("110100123456B");
  });

  it("maps gender, name parts, telecom and address", () => {
    expect(resource.gender).toBe("female");
    expect(resource.name[0].family).toBe("Machava");
    expect(resource.telecom?.map((t) => t.value)).toContain("ana@example.test");
    expect(resource.address?.[0].line).toEqual(["Av. Julius Nyerere, 120", "Polana"]);
  });

  it("maps the emergency contact to Patient.contact", () => {
    expect(resource.contact?.[0].telecom?.[0].value).toBe("841111111");
  });
});

describe("toCondition", () => {
  const diagnosis: DiagnosisRow = {
    id: "d1", description: "Hipertensão essencial", code: "I10", codeSystem: "ICD-10",
    kind: "PRINCIPAL", certainty: "CONFIRMADO", onsetDate: null,
    recordedAt: new Date("2026-05-01T10:00:00.000Z"), isActive: true,
    patientId: "p1", encounterId: "e1", notes: null,
  };

  it("maps certainty and clinical status to the FHIR code systems", () => {
    const resource = toCondition(diagnosis, identity, ctx);
    expect(resource.resourceType).toBe("Condition");
    expect(resource.clinicalStatus.coding[0].code).toBe("active");
    expect(resource.verificationStatus.coding[0].code).toBe("confirmed");
    expect(resource.code.coding?.[0]).toMatchObject({ system: "http://hl7.org/fhir/sid/icd-10", code: "I10" });
    expect(resource.subject).toEqual({ reference: "Patient/pat-1" });
    expect(resource.encounter).toEqual({ reference: "Encounter/enc-1" });
  });

  it("marks a refuted diagnosis correctly", () => {
    const resource = toCondition({ ...diagnosis, certainty: "REFUTADO", isActive: false }, identity, ctx);
    expect(resource.verificationStatus.coding[0].code).toBe("refuted");
    expect(resource.clinicalStatus.coding[0].code).toBe("inactive");
  });
});

describe("codeSystemUrl", () => {
  it("maps known terminologies and falls back for unknown ones", () => {
    expect(codeSystemUrl("ICD-10")).toBe("http://hl7.org/fhir/sid/icd-10");
    expect(codeSystemUrl("SNOMED-CT")).toBe("http://snomed.info/sct");
    expect(codeSystemUrl(null)).toBeNull();
    expect(codeSystemUrl("interno")).toContain("CodeSystem/interno");
  });
});

describe("toAllergyIntolerance", () => {
  const allergy: AllergyRow = {
    id: "a1", substance: "Penicilina", code: null, codeSystem: null,
    category: "MEDICAMENTO", kind: "ALERGIA", reaction: "Urticária", severity: "GRAVE",
    status: "ACTIVA", identifiedAt: null, createdAt: new Date("2026-05-01T10:00:00.000Z"),
    patientId: "p1", notes: null,
  };

  it("maps severity to criticality and the reaction manifestation", () => {
    const resource = toAllergyIntolerance(allergy, identity, ctx);
    expect(resource.resourceType).toBe("AllergyIntolerance");
    expect(resource.criticality).toBe("high");
    expect(resource.category).toEqual(["medication"]);
    expect(resource.reaction?.[0].severity).toBe("severe");
    expect(resource.patient).toEqual({ reference: "Patient/pat-1" });
  });

  it("marks a refuted allergy through verificationStatus", () => {
    const resource = toAllergyIntolerance({ ...allergy, status: "REFUTADA" }, identity, ctx);
    expect(resource.verificationStatus.coding[0].code).toBe("refuted");
  });
});

describe("toObservation", () => {
  const vitals: VitalSignRow = {
    id: "v1", recordedAt: new Date("2026-05-01T10:00:00.000Z"), patientId: "p1", encounterId: "e1",
    systolic: 128, diastolic: 82, heartRate: 72, respiratoryRate: 16, temperature: 36.7,
    oxygenSaturation: 98, weightKg: 70, heightCm: 175, bmi: 22.9, glucose: null, painScore: null,
    notes: null,
  };

  it("emits one vital-signs Observation with LOINC-coded components", () => {
    const resource = toObservation(vitals, identity, ctx);
    expect(resource.resourceType).toBe("Observation");
    expect(resource.status).toBe("final");
    expect(resource.category[0].coding[0].code).toBe("vital-signs");
    const codes = resource.component.map((c) => (c as { code: { coding: { code: string }[] } }).code.coding[0].code);
    expect(codes).toContain("8480-6"); // sistólica
    expect(codes).toContain("8462-4"); // diastólica
    expect(codes).toContain("39156-5"); // IMC
    expect(codes).not.toContain("2339-0"); // glicemia não medida
  });
});

describe("toMedicationRequests", () => {
  const prescription: PrescriptionRow = {
    id: "r1", number: "REC-2026-00007", status: "ACTIVA",
    issuedAt: new Date("2026-05-01T10:00:00.000Z"), validUntil: null, notes: null,
    patientId: "p1", doctorId: "doc1", encounterId: "e1",
    items: [
      { id: "i1", medicationName: "Amoxicilina", activeIngredient: "Amoxicilina", dose: "500", doseUnit: "mg", route: "ORAL", frequency: "8/8h", durationDays: 7, quantity: "21 comprimidos", instructions: "Após as refeições" },
      { id: "i2", medicationName: "Paracetamol", activeIngredient: null, dose: "1", doseUnit: "g", route: null, frequency: "SOS", durationDays: null, quantity: null, instructions: null },
    ],
  };

  it("emits one MedicationRequest per item sharing a groupIdentifier", () => {
    const resources = toMedicationRequests(prescription, identity, ctx);
    expect(resources).toHaveLength(2);
    expect(resources[0].id).toBe("f-1");
    expect(resources[1].id).toBe("f-1-2");
    expect(resources.every((r) => r.groupIdentifier.value === "REC-2026-00007")).toBe(true);
    expect(resources[0].status).toBe("active");
    expect(resources[0].dosageInstruction[0].text).toContain("500 mg");
  });

  it("maps a suspended prescription to on-hold", () => {
    const [first] = toMedicationRequests({ ...prescription, status: "SUSPENSA" }, identity, ctx);
    expect(first.status).toBe("on-hold");
  });
});
