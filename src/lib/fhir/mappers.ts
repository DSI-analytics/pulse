// Camada de mapeamento Domínio interno → HL7 FHIR R4.
//
// O modelo interno não é alterado para se parecer com FHIR: estas funções são
// puras e traduzem linhas já lidas da base de dados em recursos FHIR. Assim, a
// evolução do domínio e a evolução do perfil de interoperabilidade ficam
// desacopladas.
//
//   Paciente              -> Patient
//   Profissional          -> Practitioner
//   Clínica               -> Organization
//   Episódio / Consulta   -> Encounter
//   Marcação              -> Appointment
//   Sinal vital           -> Observation
//   Diagnóstico           -> Condition
//   Alergia               -> AllergyIntolerance
//   Medicamento           -> Medication
//   Prescrição            -> MedicationRequest
//   Resultado             -> DiagnosticReport
//   Procedimento          -> Procedure
//   Documento             -> DocumentReference

import { FHIR_SYSTEM_BASE, meta, reference, type FhirIdentity } from "./ids";

const IDENTIFIER_SYSTEM = {
  patient: `${FHIR_SYSTEM_BASE}/identifier/paciente`,
  encounter: `${FHIR_SYSTEM_BASE}/identifier/episodio`,
  prescription: `${FHIR_SYSTEM_BASE}/identifier/receita`,
  order: `${FHIR_SYSTEM_BASE}/identifier/pedido`,
  admission: `${FHIR_SYSTEM_BASE}/identifier/internamento`,
  practitioner: `${FHIR_SYSTEM_BASE}/identifier/profissional`,
  clinic: `${FHIR_SYSTEM_BASE}/identifier/clinica`,
} as const;

const GENDER: Record<string, string> = { MASCULINO: "male", FEMININO: "female", OUTRO: "other" };

const MARITAL: Record<string, { code: string; display: string }> = {
  SOLTEIRO: { code: "S", display: "Never Married" },
  CASADO: { code: "M", display: "Married" },
  UNIAO_DE_FACTO: { code: "T", display: "Domestic partner" },
  DIVORCIADO: { code: "D", display: "Divorced" },
  VIUVO: { code: "W", display: "Widowed" },
  OUTRO: { code: "UNK", display: "unknown" },
};

const DOCUMENT_TYPE: Record<string, string> = {
  BI: "Bilhete de identidade",
  PASSAPORTE: "Passaporte",
  DIRE: "DIRE",
  NUIT: "NUIT",
  CARTA_CONDUCAO: "Carta de condução",
  CEDULA: "Cédula",
  OUTRO: "Documento",
};

function humanName(fullName: string) {
  const parts = fullName.trim().split(/\s+/);
  const family = parts.length > 1 ? parts[parts.length - 1] : undefined;
  const given = parts.length > 1 ? parts.slice(0, -1) : parts;
  return [{ use: "official", text: fullName, ...(family ? { family } : {}), given }];
}

function telecom(entries: { system: "phone" | "email"; value?: string | null; use?: string }[]) {
  const out = entries
    .filter((e) => e.value)
    .map((e) => ({ system: e.system, value: e.value as string, ...(e.use ? { use: e.use } : {}) }));
  return out.length ? out : undefined;
}

function isoDay(value: Date | null | undefined): string | undefined {
  return value ? value.toISOString().slice(0, 10) : undefined;
}

function iso(value: Date | null | undefined): string | undefined {
  return value ? value.toISOString() : undefined;
}

function codeable(text: string, coding?: { system?: string | null; code?: string | null }) {
  if (coding?.code) {
    return {
      coding: [{ ...(coding.system ? { system: coding.system } : {}), code: coding.code, display: text }],
      text,
    };
  }
  return { text };
}

// ── Patient ──────────────────────────────────────────────────────────────

export interface PatientRow {
  id: string;
  code: string;
  name: string;
  birthDate: Date | null;
  gender: string | null;
  maritalStatus: string | null;
  phone: string | null;
  phoneAlt: string | null;
  email: string | null;
  address: string | null;
  street: string | null;
  streetNumber: string | null;
  neighbourhood: string | null;
  city: string | null;
  district: string | null;
  province: string | null;
  country: string | null;
  preferredLanguage: string | null;
  isActive: boolean;
  deactivatedAt: Date | null;
  emergencyContactName: string | null;
  emergencyContactRelation: string | null;
  emergencyContactPhone: string | null;
  identityDocuments: { type: string; number: string; issuer: string | null; expiresAt: Date | null }[];
}

export function toPatient(row: PatientRow, identity: FhirIdentity, organization?: { fhirId: string; name: string }) {
  const line = [row.street && `${row.street}${row.streetNumber ? `, ${row.streetNumber}` : ""}`, row.neighbourhood]
    .filter(Boolean) as string[];
  const hasAddress = line.length || row.city || row.district || row.province || row.country || row.address;

  return {
    resourceType: "Patient",
    id: identity.fhirId,
    meta: meta(identity),
    identifier: [
      { use: "usual", system: IDENTIFIER_SYSTEM.patient, value: row.code },
      ...row.identityDocuments.map((doc) => ({
        use: "official",
        type: { text: DOCUMENT_TYPE[doc.type] ?? doc.type },
        system: `${FHIR_SYSTEM_BASE}/identifier/${doc.type.toLowerCase()}`,
        value: doc.number,
        ...(doc.issuer ? { assigner: { display: doc.issuer } } : {}),
        ...(doc.expiresAt ? { period: { end: isoDay(doc.expiresAt) } } : {}),
      })),
    ],
    active: row.isActive,
    name: humanName(row.name),
    telecom: telecom([
      { system: "phone", value: row.phone, use: "mobile" },
      { system: "phone", value: row.phoneAlt, use: "home" },
      { system: "email", value: row.email },
    ]),
    ...(row.gender ? { gender: GENDER[row.gender] ?? "unknown" } : {}),
    ...(row.birthDate ? { birthDate: isoDay(row.birthDate) } : {}),
    ...(row.maritalStatus && MARITAL[row.maritalStatus]
      ? {
          maritalStatus: {
            coding: [{ system: "http://terminology.hl7.org/CodeSystem/v3-MaritalStatus", ...MARITAL[row.maritalStatus] }],
          },
        }
      : {}),
    ...(hasAddress
      ? {
          address: [
            {
              use: "home",
              ...(line.length ? { line } : {}),
              ...(row.city || row.district ? { city: row.city ?? row.district ?? undefined } : {}),
              ...(row.district ? { district: row.district } : {}),
              ...(row.province ? { state: row.province } : {}),
              ...(row.country ? { country: row.country } : {}),
              text: row.address ?? undefined,
            },
          ],
        }
      : {}),
    ...(row.emergencyContactName
      ? {
          contact: [
            {
              relationship: [codeable(row.emergencyContactRelation ?? "Contacto de emergência")],
              name: humanName(row.emergencyContactName)[0],
              telecom: telecom([{ system: "phone", value: row.emergencyContactPhone }]),
            },
          ],
        }
      : {}),
    ...(row.preferredLanguage
      ? { communication: [{ language: codeable(row.preferredLanguage), preferred: true }] }
      : {}),
    ...(organization ? { managingOrganization: reference("Organization", organization.fhirId, organization.name) } : {}),
  };
}

// ── Practitioner / Organization ──────────────────────────────────────────

export interface DoctorRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  licenseNumber: string | null;
  status: string;
  specialty: { name: string } | null;
}

export function toPractitioner(row: DoctorRow, identity: FhirIdentity) {
  return {
    resourceType: "Practitioner",
    id: identity.fhirId,
    meta: meta(identity),
    identifier: [
      { system: IDENTIFIER_SYSTEM.practitioner, value: row.id },
      ...(row.licenseNumber ? [{ system: `${FHIR_SYSTEM_BASE}/identifier/ordem-medicos`, value: row.licenseNumber }] : []),
    ],
    active: row.status === "ACTIVO",
    name: humanName(row.name),
    telecom: telecom([
      { system: "phone", value: row.phone },
      { system: "email", value: row.email },
    ]),
    ...(row.specialty ? { qualification: [{ code: codeable(row.specialty.name) }] } : {}),
  };
}

export interface ClinicRow {
  id: string;
  name: string;
  nuit: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string;
  country: string;
}

export function toOrganization(row: ClinicRow, identity: FhirIdentity) {
  return {
    resourceType: "Organization",
    id: identity.fhirId,
    meta: meta(identity),
    identifier: [
      { system: IDENTIFIER_SYSTEM.clinic, value: row.id },
      ...(row.nuit ? [{ system: `${FHIR_SYSTEM_BASE}/identifier/nuit`, value: row.nuit }] : []),
    ],
    active: true,
    type: [{ coding: [{ system: "http://terminology.hl7.org/CodeSystem/organization-type", code: "prov", display: "Healthcare Provider" }] }],
    name: row.name,
    telecom: telecom([
      { system: "phone", value: row.phone },
      { system: "email", value: row.email },
    ]),
    address: [{ text: row.address ?? undefined, city: row.city, country: row.country }],
  };
}

// ── Encounter / Appointment ──────────────────────────────────────────────

const ENCOUNTER_CLASS: Record<string, { code: string; display: string }> = {
  CONSULTA: { code: "AMB", display: "ambulatory" },
  ACOMPANHAMENTO: { code: "AMB", display: "ambulatory" },
  URGENCIA: { code: "EMER", display: "emergency" },
  INTERNAMENTO: { code: "IMP", display: "inpatient encounter" },
  PROCEDIMENTO: { code: "AMB", display: "ambulatory" },
  EXAME: { code: "AMB", display: "ambulatory" },
  ENCAMINHAMENTO: { code: "AMB", display: "ambulatory" },
};

const ENCOUNTER_STATUS: Record<string, string> = {
  PLANEADO: "planned",
  EM_CURSO: "in-progress",
  CONCLUIDO: "finished",
  CANCELADO: "cancelled",
};

export interface EncounterRow {
  id: string;
  number: string;
  type: string;
  status: string;
  startedAt: Date;
  endedAt: Date | null;
  reason: string | null;
  patientId: string;
  doctorId: string | null;
  specialty: { name: string } | null;
}

export interface RefCtx {
  patient?: (internalId: string) => { fhirId: string; display?: string } | null;
  practitioner?: (internalId: string) => { fhirId: string; display?: string } | null;
  encounter?: (internalId: string) => { fhirId: string; display?: string } | null;
  organization?: { fhirId: string; name: string } | null;
}

function patientRef(ctx: RefCtx, patientId: string) {
  const hit = ctx.patient?.(patientId);
  return hit ? reference("Patient", hit.fhirId, hit.display) : undefined;
}

function practitionerRef(ctx: RefCtx, doctorId: string | null) {
  if (!doctorId) return undefined;
  const hit = ctx.practitioner?.(doctorId);
  return hit ? reference("Practitioner", hit.fhirId, hit.display) : undefined;
}

function encounterRef(ctx: RefCtx, encounterId: string | null) {
  if (!encounterId) return undefined;
  const hit = ctx.encounter?.(encounterId);
  return hit ? reference("Encounter", hit.fhirId, hit.display) : undefined;
}

export function toEncounter(row: EncounterRow, identity: FhirIdentity, ctx: RefCtx) {
  const cls = ENCOUNTER_CLASS[row.type] ?? ENCOUNTER_CLASS.CONSULTA;
  const performer = practitionerRef(ctx, row.doctorId);
  return {
    resourceType: "Encounter",
    id: identity.fhirId,
    meta: meta(identity),
    identifier: [{ system: IDENTIFIER_SYSTEM.encounter, value: row.number }],
    status: ENCOUNTER_STATUS[row.status] ?? "unknown",
    class: { system: "http://terminology.hl7.org/CodeSystem/v3-ActCode", ...cls },
    type: [codeable(row.type.replace(/_/g, " ").toLowerCase())],
    ...(row.specialty ? { serviceType: codeable(row.specialty.name) } : {}),
    subject: patientRef(ctx, row.patientId),
    ...(performer ? { participant: [{ individual: performer }] } : {}),
    period: { start: iso(row.startedAt), ...(row.endedAt ? { end: iso(row.endedAt) } : {}) },
    ...(row.reason ? { reasonCode: [codeable(row.reason)] } : {}),
    ...(ctx.organization ? { serviceProvider: reference("Organization", ctx.organization.fhirId, ctx.organization.name) } : {}),
  };
}

const APPOINTMENT_STATUS: Record<string, string> = {
  MARCADA: "booked",
  CONFIRMADA: "booked",
  CHEGOU: "arrived",
  EM_ESPERA: "arrived",
  EM_CONSULTA: "checked-in",
  CONCLUIDA: "fulfilled",
  CANCELADA: "cancelled",
  NAO_COMPARECEU: "noshow",
};

export interface AppointmentRow {
  id: string;
  status: string;
  type: string;
  startAt: Date;
  endAt: Date;
  reason: string | null;
  patientId: string;
  doctorId: string;
  encounterId: string | null;
  specialty: { name: string } | null;
}

export function toAppointment(row: AppointmentRow, identity: FhirIdentity, ctx: RefCtx) {
  const participants = [
    patientRef(ctx, row.patientId) && { actor: patientRef(ctx, row.patientId), status: "accepted", required: "required" },
    practitionerRef(ctx, row.doctorId) && { actor: practitionerRef(ctx, row.doctorId), status: "accepted", required: "required" },
  ].filter(Boolean);

  return {
    resourceType: "Appointment",
    id: identity.fhirId,
    meta: meta(identity),
    status: APPOINTMENT_STATUS[row.status] ?? "booked",
    ...(row.specialty ? { serviceType: [codeable(row.specialty.name)] } : {}),
    appointmentType: codeable(row.type.replace(/_/g, " ").toLowerCase()),
    ...(row.reason ? { reasonCode: [codeable(row.reason)] } : {}),
    start: iso(row.startAt),
    end: iso(row.endAt),
    minutesDuration: Math.max(1, Math.round((row.endAt.getTime() - row.startAt.getTime()) / 60000)),
    participant: participants,
  };
}

// ── Observation (sinais vitais) ──────────────────────────────────────────

interface VitalComponentSpec {
  key: string;
  loinc: string;
  display: string;
  unit: string;
}

const VITAL_COMPONENTS: VitalComponentSpec[] = [
  { key: "heartRate", loinc: "8867-4", display: "Frequência cardíaca", unit: "/min" },
  { key: "respiratoryRate", loinc: "9279-1", display: "Frequência respiratória", unit: "/min" },
  { key: "temperature", loinc: "8310-5", display: "Temperatura corporal", unit: "Cel" },
  { key: "oxygenSaturation", loinc: "59408-5", display: "Saturação de oxigénio", unit: "%" },
  { key: "weightKg", loinc: "29463-7", display: "Peso corporal", unit: "kg" },
  { key: "heightCm", loinc: "8302-2", display: "Altura", unit: "cm" },
  { key: "bmi", loinc: "39156-5", display: "Índice de massa corporal", unit: "kg/m2" },
  { key: "glucose", loinc: "2339-0", display: "Glicemia", unit: "mg/dL" },
  { key: "painScore", loinc: "72514-3", display: "Intensidade da dor", unit: "{score}" },
];

export interface VitalSignRow {
  id: string;
  recordedAt: Date;
  patientId: string;
  encounterId: string | null;
  systolic: number | null;
  diastolic: number | null;
  heartRate: number | null;
  respiratoryRate: number | null;
  temperature: number | null;
  oxygenSaturation: number | null;
  weightKg: number | null;
  heightCm: number | null;
  bmi: number | null;
  glucose: number | null;
  painScore: number | null;
  notes: string | null;
}

export function toObservation(row: VitalSignRow, identity: FhirIdentity, ctx: RefCtx) {
  const bp =
    row.systolic !== null || row.diastolic !== null
      ? [
          ...(row.systolic !== null
            ? [{ code: { coding: [{ system: "http://loinc.org", code: "8480-6", display: "Pressão sistólica" }] }, valueQuantity: { value: row.systolic, unit: "mmHg", system: "http://unitsofmeasure.org", code: "mm[Hg]" } }]
            : []),
          ...(row.diastolic !== null
            ? [{ code: { coding: [{ system: "http://loinc.org", code: "8462-4", display: "Pressão diastólica" }] }, valueQuantity: { value: row.diastolic, unit: "mmHg", system: "http://unitsofmeasure.org", code: "mm[Hg]" } }]
            : []),
        ]
      : [];

  const scalar = VITAL_COMPONENTS.flatMap((spec) => {
    const value = (row as unknown as Record<string, number | null>)[spec.key];
    if (value === null || value === undefined) return [];
    return [
      {
        code: { coding: [{ system: "http://loinc.org", code: spec.loinc, display: spec.display }], text: spec.display },
        valueQuantity: { value, unit: spec.unit, system: "http://unitsofmeasure.org", code: spec.unit },
      },
    ];
  });

  return {
    resourceType: "Observation",
    id: identity.fhirId,
    meta: meta(identity),
    status: "final",
    category: [
      {
        coding: [{ system: "http://terminology.hl7.org/CodeSystem/observation-category", code: "vital-signs", display: "Vital Signs" }],
      },
    ],
    code: { coding: [{ system: "http://loinc.org", code: "85353-1", display: "Conjunto de sinais vitais" }], text: "Sinais vitais" },
    subject: patientRef(ctx, row.patientId),
    encounter: encounterRef(ctx, row.encounterId),
    effectiveDateTime: iso(row.recordedAt),
    component: [...bp, ...scalar],
    ...(row.notes ? { note: [{ text: row.notes }] } : {}),
  };
}

// ── Condition / AllergyIntolerance ───────────────────────────────────────

export interface DiagnosisRow {
  id: string;
  description: string;
  code: string | null;
  codeSystem: string | null;
  kind: string;
  certainty: string;
  onsetDate: Date | null;
  recordedAt: Date;
  isActive: boolean;
  patientId: string;
  encounterId: string | null;
  notes: string | null;
}

const CODE_SYSTEM_URL: Record<string, string> = {
  "ICD-10": "http://hl7.org/fhir/sid/icd-10",
  "CID-10": "http://hl7.org/fhir/sid/icd-10",
  "ICD-11": "http://id.who.int/icd/release/11/mms",
  "SNOMED-CT": "http://snomed.info/sct",
};

export function codeSystemUrl(name: string | null): string | null {
  if (!name) return null;
  return CODE_SYSTEM_URL[name.toUpperCase()] ?? CODE_SYSTEM_URL[name] ?? `${FHIR_SYSTEM_BASE}/CodeSystem/${encodeURIComponent(name)}`;
}

export function toCondition(row: DiagnosisRow, identity: FhirIdentity, ctx: RefCtx) {
  return {
    resourceType: "Condition",
    id: identity.fhirId,
    meta: meta(identity),
    clinicalStatus: {
      coding: [
        {
          system: "http://terminology.hl7.org/CodeSystem/condition-clinical",
          code: row.isActive ? "active" : "inactive",
        },
      ],
    },
    verificationStatus: {
      coding: [
        {
          system: "http://terminology.hl7.org/CodeSystem/condition-ver-status",
          code: row.certainty === "CONFIRMADO" ? "confirmed" : row.certainty === "REFUTADO" ? "refuted" : "provisional",
        },
      ],
    },
    category: [
      {
        coding: [
          {
            system: "http://terminology.hl7.org/CodeSystem/condition-category",
            code: "encounter-diagnosis",
            display: "Encounter Diagnosis",
          },
        ],
        text: row.kind.toLowerCase(),
      },
    ],
    code: codeable(row.description, { system: codeSystemUrl(row.codeSystem), code: row.code }),
    subject: patientRef(ctx, row.patientId),
    encounter: encounterRef(ctx, row.encounterId),
    ...(row.onsetDate ? { onsetDateTime: isoDay(row.onsetDate) } : {}),
    recordedDate: iso(row.recordedAt),
    ...(row.notes ? { note: [{ text: row.notes }] } : {}),
  };
}

export interface AllergyRow {
  id: string;
  substance: string;
  code: string | null;
  codeSystem: string | null;
  category: string;
  kind: string;
  reaction: string | null;
  severity: string;
  status: string;
  identifiedAt: Date | null;
  createdAt: Date;
  patientId: string;
  notes: string | null;
}

const ALLERGY_CATEGORY: Record<string, string> = {
  MEDICAMENTO: "medication",
  ALIMENTO: "food",
  AMBIENTAL: "environment",
  BIOLOGICO: "biologic",
  OUTRO: "environment",
};

const ALLERGY_SEVERITY: Record<string, string> = {
  LEVE: "mild",
  MODERADA: "moderate",
  GRAVE: "severe",
  FATAL: "severe",
};

export function toAllergyIntolerance(row: AllergyRow, identity: FhirIdentity, ctx: RefCtx) {
  return {
    resourceType: "AllergyIntolerance",
    id: identity.fhirId,
    meta: meta(identity),
    clinicalStatus: {
      coding: [
        {
          system: "http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical",
          code: row.status === "ACTIVA" ? "active" : row.status === "RESOLVIDA" ? "resolved" : "inactive",
        },
      ],
    },
    verificationStatus: {
      coding: [
        {
          system: "http://terminology.hl7.org/CodeSystem/allergyintolerance-verification",
          code: row.status === "REFUTADA" ? "refuted" : "confirmed",
        },
      ],
    },
    type: row.kind === "INTOLERANCIA" ? "intolerance" : "allergy",
    category: [ALLERGY_CATEGORY[row.category] ?? "environment"],
    criticality: row.severity === "FATAL" || row.severity === "GRAVE" ? "high" : row.severity === "MODERADA" ? "low" : "low",
    code: codeable(row.substance, { system: codeSystemUrl(row.codeSystem), code: row.code }),
    patient: patientRef(ctx, row.patientId),
    ...(row.identifiedAt ? { onsetDateTime: isoDay(row.identifiedAt) } : {}),
    recordedDate: iso(row.createdAt),
    ...(row.reaction
      ? {
          reaction: [
            {
              manifestation: [codeable(row.reaction)],
              severity: ALLERGY_SEVERITY[row.severity] ?? "moderate",
            },
          ],
        }
      : {}),
    ...(row.notes ? { note: [{ text: row.notes }] } : {}),
  };
}

// ── Medication / MedicationRequest ───────────────────────────────────────

export interface MedicationRow {
  id: string;
  name: string;
  activeIngredient: string | null;
  form: string | null;
  strength: string | null;
  code: string | null;
  codeSystem: string | null;
  isActive: boolean;
}

export function toMedication(row: MedicationRow, identity: FhirIdentity) {
  return {
    resourceType: "Medication",
    id: identity.fhirId,
    meta: meta(identity),
    status: row.isActive ? "active" : "inactive",
    code: codeable(row.name, { system: codeSystemUrl(row.codeSystem), code: row.code }),
    ...(row.form ? { form: codeable(row.form) } : {}),
    ...(row.activeIngredient
      ? { ingredient: [{ itemCodeableConcept: codeable(row.activeIngredient), isActive: true, ...(row.strength ? { strength: { numerator: { unit: row.strength } } } : {}) }] }
      : {}),
  };
}

export interface PrescriptionRow {
  id: string;
  number: string;
  status: string;
  issuedAt: Date;
  validUntil: Date | null;
  notes: string | null;
  patientId: string;
  doctorId: string | null;
  encounterId: string | null;
  items: {
    id: string;
    medicationName: string;
    activeIngredient: string | null;
    dose: string | null;
    doseUnit: string | null;
    route: string | null;
    frequency: string | null;
    durationDays: number | null;
    quantity: string | null;
    instructions: string | null;
  }[];
}

const PRESCRIPTION_STATUS: Record<string, string> = {
  ACTIVA: "active",
  CONCLUIDA: "completed",
  SUSPENSA: "on-hold",
  CANCELADA: "cancelled",
};

const ROUTE: Record<string, string> = {
  ORAL: "Via oral",
  INTRAVENOSA: "Via intravenosa",
  INTRAMUSCULAR: "Via intramuscular",
  SUBCUTANEA: "Via subcutânea",
  TOPICA: "Via tópica",
  INALATORIA: "Via inalatória",
  RECTAL: "Via rectal",
  OFTALMICA: "Via oftálmica",
  OTOLOGICA: "Via otológica",
  NASAL: "Via nasal",
  OUTRA: "Outra via",
};

/**
 * Uma prescrição interna pode conter vários medicamentos; em FHIR cada
 * medicamento é um `MedicationRequest`. O recurso principal representa o
 * primeiro item e os restantes são devolvidos como recursos irmãos com o mesmo
 * `groupIdentifier` (o número da receita).
 */
export function toMedicationRequests(row: PrescriptionRow, identity: FhirIdentity, ctx: RefCtx) {
  const group = { system: IDENTIFIER_SYSTEM.prescription, value: row.number };
  return row.items.map((item, index) => ({
    resourceType: "MedicationRequest",
    id: index === 0 ? identity.fhirId : `${identity.fhirId}-${index + 1}`,
    meta: meta(identity),
    identifier: [group],
    groupIdentifier: group,
    status: PRESCRIPTION_STATUS[row.status] ?? "unknown",
    intent: "order",
    medicationCodeableConcept: codeable(item.medicationName),
    subject: patientRef(ctx, row.patientId),
    encounter: encounterRef(ctx, row.encounterId),
    authoredOn: iso(row.issuedAt),
    ...(practitionerRef(ctx, row.doctorId) ? { requester: practitionerRef(ctx, row.doctorId) } : {}),
    dosageInstruction: [
      {
        text: [item.dose && `${item.dose}${item.doseUnit ? ` ${item.doseUnit}` : ""}`, item.frequency, item.instructions]
          .filter(Boolean)
          .join(" · ") || undefined,
        ...(item.route ? { route: codeable(ROUTE[item.route] ?? item.route) } : {}),
        ...(item.durationDays ? { timing: { repeat: { boundsDuration: { value: item.durationDays, unit: "d", system: "http://unitsofmeasure.org", code: "d" } } } } : {}),
      },
    ],
    ...(item.quantity || row.validUntil
      ? {
          dispenseRequest: {
            ...(item.quantity ? { quantity: { unit: item.quantity } } : {}),
            ...(row.validUntil ? { validityPeriod: { end: isoDay(row.validUntil) } } : {}),
          },
        }
      : {}),
    ...(row.notes ? { note: [{ text: row.notes }] } : {}),
  }));
}

// ── DiagnosticReport ─────────────────────────────────────────────────────

export interface DiagnosticResultRow {
  id: string;
  conclusion: string | null;
  performedAt: Date | null;
  validatedAt: Date | null;
  createdAt: Date;
  order: {
    id: string;
    number: string;
    name: string;
    code: string | null;
    codeSystem: string | null;
    category: string;
    status: string;
    patientId: string;
    encounterId: string | null;
    doctorId: string | null;
  };
  items: { name: string; value: string | null; valueNumeric: number | null; unit: string | null; referenceRange: string | null; isAbnormal: boolean; flag: string | null }[];
}

export function toDiagnosticReport(row: DiagnosticResultRow, identity: FhirIdentity, ctx: RefCtx) {
  return {
    resourceType: "DiagnosticReport",
    id: identity.fhirId,
    meta: meta(identity),
    identifier: [{ system: IDENTIFIER_SYSTEM.order, value: row.order.number }],
    status: row.validatedAt ? "final" : "preliminary",
    category: [
      {
        coding: [
          {
            system: "http://terminology.hl7.org/CodeSystem/v2-0074",
            code: row.order.category === "IMAGIOLOGIA" ? "RAD" : row.order.category === "LABORATORIO" ? "LAB" : "OTH",
            display: row.order.category.toLowerCase(),
          },
        ],
      },
    ],
    code: codeable(row.order.name, { system: codeSystemUrl(row.order.codeSystem), code: row.order.code }),
    subject: patientRef(ctx, row.order.patientId),
    encounter: encounterRef(ctx, row.order.encounterId),
    effectiveDateTime: iso(row.performedAt ?? row.createdAt),
    issued: iso(row.validatedAt ?? row.performedAt ?? row.createdAt),
    ...(practitionerRef(ctx, row.order.doctorId) ? { performer: [practitionerRef(ctx, row.order.doctorId)] } : {}),
    ...(row.conclusion ? { conclusion: row.conclusion } : {}),
    // Os parâmetros são apresentados como observações contidas (`contained`),
    // evitando expor ids internos de linhas de resultado.
    contained: row.items.map((item, index) => ({
      resourceType: "Observation",
      id: `r${index + 1}`,
      status: row.validatedAt ? "final" : "preliminary",
      code: codeable(item.name),
      ...(item.valueNumeric !== null
        ? { valueQuantity: { value: item.valueNumeric, ...(item.unit ? { unit: item.unit } : {}) } }
        : item.value
          ? { valueString: item.value }
          : {}),
      ...(item.referenceRange ? { referenceRange: [{ text: item.referenceRange }] } : {}),
      ...(item.isAbnormal
        ? {
            interpretation: [
              {
                coding: [{ system: "http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation", code: "A", display: "Abnormal" }],
                text: item.flag ?? "Anormal",
              },
            ],
          }
        : {}),
    })),
    result: row.items.map((_, index) => ({ reference: `#r${index + 1}` })),
  };
}

// ── Procedure / DocumentReference ────────────────────────────────────────

export interface ProcedureRow {
  id: string;
  name: string;
  code: string | null;
  codeSystem: string | null;
  status: string;
  performedAt: Date;
  outcome: string | null;
  complications: string | null;
  notes: string | null;
  patientId: string;
  encounterId: string | null;
  doctorId: string | null;
}

export function toProcedure(row: ProcedureRow, identity: FhirIdentity, ctx: RefCtx) {
  return {
    resourceType: "Procedure",
    id: identity.fhirId,
    meta: meta(identity),
    status: row.status === "REALIZADO" ? "completed" : row.status === "CANCELADO" ? "not-done" : "preparation",
    code: codeable(row.name, { system: codeSystemUrl(row.codeSystem), code: row.code }),
    subject: patientRef(ctx, row.patientId),
    encounter: encounterRef(ctx, row.encounterId),
    performedDateTime: iso(row.performedAt),
    ...(practitionerRef(ctx, row.doctorId) ? { performer: [{ actor: practitionerRef(ctx, row.doctorId) }] } : {}),
    ...(row.outcome ? { outcome: codeable(row.outcome) } : {}),
    ...(row.complications ? { complicationDetail: [{ display: row.complications }] } : {}),
    ...(row.notes ? { note: [{ text: row.notes }] } : {}),
  };
}

export interface AttachmentRow {
  id: string;
  name: string;
  description: string | null;
  category: string;
  mimeType: string;
  sizeBytes: number;
  checksum: string | null;
  documentDate: Date | null;
  createdAt: Date;
  patientId: string | null;
  encounterId: string | null;
}

/**
 * O `DocumentReference` aponta para o endpoint autenticado da aplicação — o
 * conteúdo binário nunca é embutido nem exposto por URL pública (§10).
 */
export function toDocumentReference(row: AttachmentRow, identity: FhirIdentity, ctx: RefCtx, appBaseUrl: string) {
  return {
    resourceType: "DocumentReference",
    id: identity.fhirId,
    meta: meta(identity),
    status: "current",
    type: codeable(row.category.toLowerCase()),
    ...(row.patientId && patientRef(ctx, row.patientId) ? { subject: patientRef(ctx, row.patientId) } : {}),
    date: iso(row.documentDate ?? row.createdAt),
    ...(row.description ? { description: row.description } : {}),
    content: [
      {
        attachment: {
          contentType: row.mimeType,
          url: `${appBaseUrl}/api/documentos/${row.id}`,
          size: row.sizeBytes,
          title: row.name,
          ...(row.checksum ? { hash: row.checksum } : {}),
          creation: iso(row.createdAt),
        },
      },
    ],
    ...(encounterRef(ctx, row.encounterId) ? { context: { encounter: [encounterRef(ctx, row.encounterId)] } } : {}),
  };
}
