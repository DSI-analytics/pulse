// Validação de recursos FHIR recebidos (§21).
//
// Nenhum JSON é aceite só por trazer um `resourceType`: cada recurso escrito é
// validado quanto ao tipo, à estrutura, aos tipos de dados, às referências e
// aos campos que a aplicação exige para conseguir gravar no domínio interno.

import type { OperationIssue } from "./outcome";
import { isSupportedResource, type FhirResourceType } from "./ids";

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; issues: OperationIssue[] };

function issue(code: OperationIssue["code"], diagnostics: string, expression?: string): OperationIssue {
  return { severity: "error", code, diagnostics, ...(expression ? { expression: [expression] } : {}) };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime());
}

function isIsoDateTime(value: string): boolean {
  return !Number.isNaN(new Date(value).getTime());
}

/** Extrai o id de uma referência "Patient/abc"; devolve null se malformada. */
export function referenceId(value: unknown, expected: FhirResourceType): string | null {
  if (!isObject(value)) return null;
  const ref = str(value.reference);
  if (!ref) return null;
  const [type, id] = ref.split("/");
  if (type !== expected || !id) return null;
  return id;
}

function codeableText(value: unknown): string | null {
  if (!isObject(value)) return null;
  const text = str(value.text);
  if (text) return text;
  const coding = value.coding;
  if (Array.isArray(coding) && coding.length && isObject(coding[0])) {
    return str(coding[0].display) ?? str(coding[0].code);
  }
  return null;
}

function codeableCoding(value: unknown): { code: string | null; system: string | null } {
  if (!isObject(value)) return { code: null, system: null };
  const coding = value.coding;
  if (Array.isArray(coding) && coding.length && isObject(coding[0])) {
    return { code: str(coding[0].code), system: str(coding[0].system) };
  }
  return { code: null, system: null };
}

/** Estrutura mínima comum: objecto JSON com o `resourceType` esperado. */
export function validateEnvelope(body: unknown, expected: FhirResourceType): ValidationResult<Record<string, unknown>> {
  if (!isObject(body)) {
    return { ok: false, issues: [issue("structure", "O corpo do pedido tem de ser um objecto JSON.")] };
  }
  const type = str(body.resourceType);
  if (!type) return { ok: false, issues: [issue("required", "`resourceType` em falta.", "resourceType")] };
  if (!isSupportedResource(type)) {
    return { ok: false, issues: [issue("not-supported", `resourceType "${type}" não é suportado.`, "resourceType")] };
  }
  if (type !== expected) {
    return {
      ok: false,
      issues: [issue("invalid", `resourceType "${type}" não corresponde ao endpoint /${expected}.`, "resourceType")],
    };
  }
  return { ok: true, value: body };
}

// ── Patient ──────────────────────────────────────────────────────────────

export interface PatientInput {
  name: string;
  gender: "MASCULINO" | "FEMININO" | "OUTRO" | null;
  birthDate: string | null;
  phone: string | null;
  email: string | null;
  addressText: string | null;
  city: string | null;
  country: string | null;
  identifiers: { system: string | null; value: string }[];
}

const GENDER_IN: Record<string, PatientInput["gender"]> = {
  male: "MASCULINO",
  female: "FEMININO",
  other: "OUTRO",
  unknown: null,
};

export function validatePatient(body: Record<string, unknown>): ValidationResult<PatientInput> {
  const issues: OperationIssue[] = [];

  let name: string | null = null;
  if (Array.isArray(body.name) && body.name.length && isObject(body.name[0])) {
    const first = body.name[0] as Record<string, unknown>;
    const text = str(first.text);
    const given = Array.isArray(first.given) ? first.given.filter((g): g is string => typeof g === "string") : [];
    const family = str(first.family);
    name = text ?? ([given.join(" "), family].filter(Boolean).join(" ").trim() || null);
  }
  if (!name || name.length < 3) issues.push(issue("required", "`name` é obrigatório e precisa de pelo menos 3 caracteres.", "Patient.name"));

  let gender: PatientInput["gender"] = null;
  const genderRaw = str(body.gender);
  if (genderRaw) {
    if (!(genderRaw in GENDER_IN)) {
      issues.push(issue("value", "`gender` tem de ser male | female | other | unknown.", "Patient.gender"));
    } else {
      gender = GENDER_IN[genderRaw]!;
    }
  }

  const birthDate = str(body.birthDate);
  if (birthDate && !isIsoDate(birthDate)) {
    issues.push(issue("value", "`birthDate` tem de estar no formato AAAA-MM-DD.", "Patient.birthDate"));
  }

  let phone: string | null = null;
  let email: string | null = null;
  if (body.telecom !== undefined) {
    if (!Array.isArray(body.telecom)) {
      issues.push(issue("structure", "`telecom` tem de ser uma lista.", "Patient.telecom"));
    } else {
      for (const entry of body.telecom) {
        if (!isObject(entry)) continue;
        const system = str(entry.system);
        const value = str(entry.value);
        if (!value) continue;
        if (system === "phone" && !phone) phone = value;
        if (system === "email" && !email) email = value;
      }
    }
  }

  let addressText: string | null = null;
  let city: string | null = null;
  let country: string | null = null;
  if (Array.isArray(body.address) && body.address.length && isObject(body.address[0])) {
    const first = body.address[0] as Record<string, unknown>;
    const line = Array.isArray(first.line) ? first.line.filter((l): l is string => typeof l === "string") : [];
    addressText = str(first.text) ?? (line.length ? line.join(", ") : null);
    city = str(first.city);
    country = str(first.country);
  }

  const identifiers: PatientInput["identifiers"] = [];
  if (body.identifier !== undefined) {
    if (!Array.isArray(body.identifier)) {
      issues.push(issue("structure", "`identifier` tem de ser uma lista.", "Patient.identifier"));
    } else {
      for (const entry of body.identifier) {
        if (!isObject(entry)) continue;
        const value = str(entry.value);
        if (value) identifiers.push({ system: str(entry.system), value });
      }
    }
  }

  if (issues.length) return { ok: false, issues };
  return {
    ok: true,
    value: { name: name!, gender, birthDate, phone, email, addressText, city, country, identifiers },
  };
}

// ── AllergyIntolerance ───────────────────────────────────────────────────

export interface AllergyInput {
  patientRef: string;
  substance: string;
  code: string | null;
  codeSystem: string | null;
  category: "MEDICAMENTO" | "ALIMENTO" | "AMBIENTAL" | "BIOLOGICO" | "OUTRO";
  kind: "ALERGIA" | "INTOLERANCIA";
  severity: "LEVE" | "MODERADA" | "GRAVE" | "FATAL";
  status: "ACTIVA" | "INACTIVA" | "RESOLVIDA" | "REFUTADA";
  reaction: string | null;
  identifiedAt: string | null;
}

const CATEGORY_IN: Record<string, AllergyInput["category"]> = {
  medication: "MEDICAMENTO",
  food: "ALIMENTO",
  environment: "AMBIENTAL",
  biologic: "BIOLOGICO",
};

export function validateAllergyIntolerance(body: Record<string, unknown>): ValidationResult<AllergyInput> {
  const issues: OperationIssue[] = [];

  const patientRef = referenceId(body.patient, "Patient");
  if (!patientRef) issues.push(issue("required", "`patient` tem de referenciar Patient/{id}.", "AllergyIntolerance.patient"));

  const substance = codeableText(body.code);
  if (!substance) issues.push(issue("required", "`code` tem de identificar a substância.", "AllergyIntolerance.code"));
  const coding = codeableCoding(body.code);

  const typeRaw = str(body.type);
  if (typeRaw && typeRaw !== "allergy" && typeRaw !== "intolerance") {
    issues.push(issue("value", "`type` tem de ser allergy ou intolerance.", "AllergyIntolerance.type"));
  }

  let category: AllergyInput["category"] = "OUTRO";
  if (Array.isArray(body.category) && body.category.length) {
    const first = body.category[0];
    if (typeof first === "string") category = CATEGORY_IN[first] ?? "OUTRO";
  }

  const criticality = str(body.criticality);
  let severity: AllergyInput["severity"] = "MODERADA";
  if (criticality === "high") severity = "GRAVE";
  else if (criticality === "low") severity = "LEVE";

  let reaction: string | null = null;
  if (Array.isArray(body.reaction) && body.reaction.length && isObject(body.reaction[0])) {
    const first = body.reaction[0] as Record<string, unknown>;
    if (Array.isArray(first.manifestation) && first.manifestation.length) {
      reaction = codeableText(first.manifestation[0]);
    }
    const sev = str(first.severity);
    if (sev === "severe") severity = "GRAVE";
    else if (sev === "mild") severity = "LEVE";
  }

  const clinical = codeableCoding(body.clinicalStatus).code;
  const verification = codeableCoding(body.verificationStatus).code;
  const status: AllergyInput["status"] =
    verification === "refuted" ? "REFUTADA" : clinical === "resolved" ? "RESOLVIDA" : clinical === "inactive" ? "INACTIVA" : "ACTIVA";

  const identifiedAt = str(body.onsetDateTime);
  if (identifiedAt && !isIsoDateTime(identifiedAt)) {
    issues.push(issue("value", "`onsetDateTime` inválido.", "AllergyIntolerance.onsetDateTime"));
  }

  if (issues.length) return { ok: false, issues };
  return {
    ok: true,
    value: {
      patientRef: patientRef!,
      substance: substance!,
      code: coding.code,
      codeSystem: coding.system,
      category,
      kind: typeRaw === "intolerance" ? "INTOLERANCIA" : "ALERGIA",
      severity,
      status,
      reaction,
      identifiedAt,
    },
  };
}

// ── Condition ────────────────────────────────────────────────────────────

export interface ConditionInput {
  patientRef: string;
  encounterRef: string | null;
  description: string;
  code: string | null;
  codeSystem: string | null;
  certainty: "PROVISORIO" | "CONFIRMADO" | "REFUTADO";
  isActive: boolean;
  onsetDate: string | null;
}

export function validateCondition(body: Record<string, unknown>): ValidationResult<ConditionInput> {
  const issues: OperationIssue[] = [];

  const patientRef = referenceId(body.subject, "Patient");
  if (!patientRef) issues.push(issue("required", "`subject` tem de referenciar Patient/{id}.", "Condition.subject"));

  const description = codeableText(body.code);
  if (!description) issues.push(issue("required", "`code` tem de descrever o diagnóstico.", "Condition.code"));
  const coding = codeableCoding(body.code);

  const verification = codeableCoding(body.verificationStatus).code;
  const certainty: ConditionInput["certainty"] =
    verification === "confirmed" ? "CONFIRMADO" : verification === "refuted" ? "REFUTADO" : "PROVISORIO";

  const clinical = codeableCoding(body.clinicalStatus).code;
  const onsetDate = str(body.onsetDateTime);
  if (onsetDate && !isIsoDateTime(onsetDate)) issues.push(issue("value", "`onsetDateTime` inválido.", "Condition.onsetDateTime"));

  if (body.encounter !== undefined && body.encounter !== null && !referenceId(body.encounter, "Encounter")) {
    issues.push(issue("value", "`encounter` tem de referenciar Encounter/{id}.", "Condition.encounter"));
  }

  if (issues.length) return { ok: false, issues };
  return {
    ok: true,
    value: {
      patientRef: patientRef!,
      encounterRef: referenceId(body.encounter, "Encounter"),
      description: description!,
      code: coding.code,
      codeSystem: coding.system,
      certainty,
      isActive: clinical !== "inactive" && clinical !== "resolved",
      onsetDate,
    },
  };
}

// ── Observation (sinais vitais) ──────────────────────────────────────────

export interface ObservationInput {
  patientRef: string;
  encounterRef: string | null;
  recordedAt: string;
  values: Record<string, number>;
}

/** LOINC → campo interno de VitalSign. */
const LOINC_MAP: Record<string, string> = {
  "8480-6": "systolic",
  "8462-4": "diastolic",
  "8867-4": "heartRate",
  "9279-1": "respiratoryRate",
  "8310-5": "temperature",
  "59408-5": "oxygenSaturation",
  "2708-6": "oxygenSaturation",
  "29463-7": "weightKg",
  "8302-2": "heightCm",
  "39156-5": "bmi",
  "2339-0": "glucose",
  "72514-3": "painScore",
};

function readQuantity(node: unknown): number | null {
  if (!isObject(node)) return null;
  const quantity = node.valueQuantity;
  if (!isObject(quantity)) return null;
  const value = quantity.value;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function validateObservation(body: Record<string, unknown>): ValidationResult<ObservationInput> {
  const issues: OperationIssue[] = [];

  const patientRef = referenceId(body.subject, "Patient");
  if (!patientRef) issues.push(issue("required", "`subject` tem de referenciar Patient/{id}.", "Observation.subject"));

  const status = str(body.status);
  if (!status) issues.push(issue("required", "`status` é obrigatório.", "Observation.status"));

  const recordedAt = str(body.effectiveDateTime) ?? new Date().toISOString();
  if (!isIsoDateTime(recordedAt)) issues.push(issue("value", "`effectiveDateTime` inválido.", "Observation.effectiveDateTime"));

  const values: Record<string, number> = {};
  const collect = (node: unknown) => {
    if (!isObject(node)) return;
    const { code } = codeableCoding(node.code);
    if (!code) return;
    const field = LOINC_MAP[code];
    if (!field) return;
    const value = readQuantity(node);
    if (value !== null) values[field] = value;
  };

  collect(body);
  if (Array.isArray(body.component)) for (const component of body.component) collect(component);

  if (!Object.keys(values).length) {
    issues.push(
      issue(
        "value",
        "Nenhum sinal vital reconhecido. Use códigos LOINC suportados em `code` ou `component.code` " +
          `(${Object.keys(LOINC_MAP).join(", ")}).`,
        "Observation.component",
      ),
    );
  }

  if (body.encounter !== undefined && body.encounter !== null && !referenceId(body.encounter, "Encounter")) {
    issues.push(issue("value", "`encounter` tem de referenciar Encounter/{id}.", "Observation.encounter"));
  }

  if (issues.length) return { ok: false, issues };
  return {
    ok: true,
    value: { patientRef: patientRef!, encounterRef: referenceId(body.encounter, "Encounter"), recordedAt, values },
  };
}
