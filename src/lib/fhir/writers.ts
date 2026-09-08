import "server-only";
import { prisma } from "@/lib/prisma";
import { normaliseSubstance } from "@/lib/domain/allergy-check";
import { computeBmi } from "@/lib/domain/vitals";
import { withNumberRetry } from "@/lib/sequences";
import { attachExternalIdentifier, bumpVersion, ensureFhirId, resolveFhirId, type FhirResourceType } from "./ids";
import type { OperationIssue } from "./outcome";
import type { AllergyInput, ConditionInput, ObservationInput, PatientInput } from "./validation";

/**
 * Escrita FHIR → domínio interno.
 *
 * As escritas suportadas nesta fase são `Patient`, `AllergyIntolerance`,
 * `Condition` e `Observation` (sinais vitais) — os recursos cujo mapeamento é
 * inequívoco em ambos os sentidos. Os restantes são expostos apenas para
 * leitura e respondem 405 com OperationOutcome, em vez de aceitarem dados que
 * não conseguiriam representar fielmente.
 */

export const WRITABLE_RESOURCES: FhirResourceType[] = ["Patient", "AllergyIntolerance", "Condition", "Observation"];

export function isWritable(resourceType: FhirResourceType): boolean {
  return WRITABLE_RESOURCES.includes(resourceType);
}

export type WriteResult =
  | { ok: true; internalId: string; fhirId: string; versionId: number; created: boolean }
  | { ok: false; status: number; issues: OperationIssue[] };

function fail(status: number, code: OperationIssue["code"], diagnostics: string): WriteResult {
  return { ok: false, status, issues: [{ severity: "error", code, diagnostics }] };
}

async function patientIdFromRef(clinicId: string, fhirId: string): Promise<string | null> {
  const resolved = await resolveFhirId(clinicId, "Patient", fhirId);
  if (!resolved) return null;
  const exists = await prisma.patient.findFirst({ where: { id: resolved.internalId, clinicId }, select: { id: true } });
  return exists?.id ?? null;
}

async function encounterIdFromRef(clinicId: string, patientId: string, fhirId: string | null): Promise<string | null | "invalid"> {
  if (!fhirId) return null;
  const resolved = await resolveFhirId(clinicId, "Encounter", fhirId);
  if (!resolved) return "invalid";
  const exists = await prisma.encounter.findFirst({
    where: { id: resolved.internalId, clinicId, patientId },
    select: { id: true },
  });
  return exists?.id ?? "invalid";
}

// ── Patient ──────────────────────────────────────────────────────────────

export async function writePatient(
  clinicId: string,
  input: PatientInput,
  existingInternalId: string | null,
): Promise<WriteResult> {
  const data = {
    name: input.name,
    gender: input.gender,
    birthDate: input.birthDate ? new Date(`${input.birthDate}T00:00:00.000Z`) : null,
    phone: input.phone,
    email: input.email,
    address: input.addressText,
    city: input.city,
    country: input.country,
  };

  if (existingInternalId) {
    const existing = await prisma.patient.findFirst({ where: { id: existingInternalId, clinicId }, select: { id: true } });
    if (!existing) return fail(404, "not-found", "Paciente não encontrado.");
    await prisma.patient.update({ where: { id: existing.id }, data: { ...data, version: { increment: 1 } } });
    const identity = await bumpVersion("Patient", existing.id);
    return { ok: true, internalId: existing.id, fhirId: identity!.fhirId, versionId: identity!.versionId, created: false };
  }

  const created = await withNumberRetry(async () => {
    const count = await prisma.patient.count({ where: { clinicId } });
    return prisma.patient.create({
      data: { clinicId, code: `PAC-${String(count + 1).padStart(5, "0")}`, ...data },
      select: { id: true },
    });
  });

  const identity = await ensureFhirId(clinicId, "Patient", created.id);
  for (const identifier of input.identifiers) {
    if (identifier.system) await attachExternalIdentifier("Patient", created.id, { system: identifier.system, value: identifier.value });
  }
  return { ok: true, internalId: created.id, fhirId: identity.fhirId, versionId: identity.versionId, created: true };
}

// ── AllergyIntolerance ───────────────────────────────────────────────────

export async function writeAllergy(
  clinicId: string,
  input: AllergyInput,
  existingInternalId: string | null,
): Promise<WriteResult> {
  const patientId = await patientIdFromRef(clinicId, input.patientRef);
  if (!patientId) return fail(422, "invalid", "`patient` não corresponde a um paciente desta instituição.");

  const data = {
    substance: input.substance,
    substanceKey: normaliseSubstance(input.substance),
    code: input.code,
    codeSystem: input.codeSystem,
    category: input.category,
    kind: input.kind,
    reaction: input.reaction,
    severity: input.severity,
    status: input.status,
    identifiedAt: input.identifiedAt ? new Date(input.identifiedAt) : null,
  };

  if (existingInternalId) {
    const existing = await prisma.allergy.findFirst({ where: { id: existingInternalId, clinicId }, select: { id: true } });
    if (!existing) return fail(404, "not-found", "Alergia não encontrada.");
    await prisma.allergy.update({ where: { id: existing.id }, data });
    const identity = await bumpVersion("AllergyIntolerance", existing.id);
    return { ok: true, internalId: existing.id, fhirId: identity!.fhirId, versionId: identity!.versionId, created: false };
  }

  const created = await prisma.allergy.create({ data: { clinicId, patientId, ...data }, select: { id: true } });
  const identity = await ensureFhirId(clinicId, "AllergyIntolerance", created.id);
  return { ok: true, internalId: created.id, fhirId: identity.fhirId, versionId: identity.versionId, created: true };
}

// ── Condition ────────────────────────────────────────────────────────────

export async function writeCondition(
  clinicId: string,
  input: ConditionInput,
  existingInternalId: string | null,
): Promise<WriteResult> {
  const patientId = await patientIdFromRef(clinicId, input.patientRef);
  if (!patientId) return fail(422, "invalid", "`subject` não corresponde a um paciente desta instituição.");

  const encounterId = await encounterIdFromRef(clinicId, patientId, input.encounterRef);
  if (encounterId === "invalid") return fail(422, "invalid", "`encounter` não pertence a este paciente.");

  const data = {
    description: input.description,
    code: input.code,
    codeSystem: input.codeSystem,
    certainty: input.certainty,
    isActive: input.isActive,
    onsetDate: input.onsetDate ? new Date(input.onsetDate) : null,
    encounterId,
  };

  if (existingInternalId) {
    const existing = await prisma.diagnosis.findFirst({ where: { id: existingInternalId, clinicId }, select: { id: true } });
    if (!existing) return fail(404, "not-found", "Diagnóstico não encontrado.");
    await prisma.diagnosis.update({ where: { id: existing.id }, data });
    const identity = await bumpVersion("Condition", existing.id);
    return { ok: true, internalId: existing.id, fhirId: identity!.fhirId, versionId: identity!.versionId, created: false };
  }

  const created = await prisma.diagnosis.create({ data: { clinicId, patientId, ...data }, select: { id: true } });
  const identity = await ensureFhirId(clinicId, "Condition", created.id);
  return { ok: true, internalId: created.id, fhirId: identity.fhirId, versionId: identity.versionId, created: true };
}

// ── Observation ──────────────────────────────────────────────────────────

const VITAL_FIELDS = new Set([
  "systolic", "diastolic", "heartRate", "respiratoryRate", "temperature",
  "oxygenSaturation", "weightKg", "heightCm", "bmi", "glucose", "painScore",
]);

const INTEGER_FIELDS = new Set(["systolic", "diastolic", "heartRate", "respiratoryRate", "oxygenSaturation", "painScore"]);

export async function writeObservation(
  clinicId: string,
  input: ObservationInput,
  existingInternalId: string | null,
): Promise<WriteResult> {
  const patientId = await patientIdFromRef(clinicId, input.patientRef);
  if (!patientId) return fail(422, "invalid", "`subject` não corresponde a um paciente desta instituição.");

  const encounterId = await encounterIdFromRef(clinicId, patientId, input.encounterRef);
  if (encounterId === "invalid") return fail(422, "invalid", "`encounter` não pertence a este paciente.");

  const values: Record<string, number> = {};
  for (const [key, value] of Object.entries(input.values)) {
    if (!VITAL_FIELDS.has(key)) continue;
    values[key] = INTEGER_FIELDS.has(key) ? Math.round(value) : value;
  }

  const data = {
    ...values,
    bmi: values.bmi ?? computeBmi(values.weightKg ?? null, values.heightCm ?? null),
    recordedAt: new Date(input.recordedAt),
    encounterId,
  };

  if (existingInternalId) {
    const existing = await prisma.vitalSign.findFirst({ where: { id: existingInternalId, clinicId }, select: { id: true } });
    if (!existing) return fail(404, "not-found", "Observação não encontrada.");
    await prisma.vitalSign.update({ where: { id: existing.id }, data });
    const identity = await bumpVersion("Observation", existing.id);
    return { ok: true, internalId: existing.id, fhirId: identity!.fhirId, versionId: identity!.versionId, created: false };
  }

  const created = await prisma.vitalSign.create({ data: { clinicId, patientId, ...data }, select: { id: true } });
  const identity = await ensureFhirId(clinicId, "Observation", created.id);
  return { ok: true, internalId: created.id, fhirId: identity.fhirId, versionId: identity.versionId, created: true };
}
