import "server-only";
import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Identificadores FHIR (§18).
 *
 * O id interno da base de dados nunca é exposto a sistemas externos. Cada
 * recurso publicado recebe um `fhirId` opaco e estável, guardado em
 * `FhirResource` juntamente com o modelo/registo interno, a versão
 * (`meta.versionId`), a data da última alteração (`meta.lastUpdated`) e os
 * identificadores atribuídos por sistemas terceiros.
 *
 * Assim, integrar um novo sistema não provoca colisões: cada um traz o seu
 * `identifier.system` e o mapeamento continua a ser 1:1 com o registo interno.
 */

export const FHIR_SYSTEM_BASE = process.env.FHIR_BASE_URL?.replace(/\/+$/, "") || "urn:pulso";

export type FhirResourceType =
  | "Patient"
  | "Practitioner"
  | "Organization"
  | "Encounter"
  | "Appointment"
  | "Observation"
  | "Condition"
  | "AllergyIntolerance"
  | "Medication"
  | "MedicationRequest"
  | "DiagnosticReport"
  | "Procedure"
  | "DocumentReference";

/** Modelo interno que sustenta cada recurso FHIR. */
export const INTERNAL_MODEL: Record<FhirResourceType, string> = {
  Patient: "Patient",
  Practitioner: "Doctor",
  Organization: "Clinic",
  Encounter: "Encounter",
  Appointment: "Appointment",
  Observation: "VitalSign",
  Condition: "Diagnosis",
  AllergyIntolerance: "Allergy",
  Medication: "Medication",
  MedicationRequest: "Prescription",
  DiagnosticReport: "DiagnosticResult",
  Procedure: "ClinicalProcedure",
  DocumentReference: "ClinicalAttachment",
};

export const SUPPORTED_RESOURCES = Object.keys(INTERNAL_MODEL) as FhirResourceType[];

export function isSupportedResource(value: string): value is FhirResourceType {
  return (SUPPORTED_RESOURCES as string[]).includes(value);
}

type Db = PrismaClient | Prisma.TransactionClient;

export interface FhirIdentity {
  fhirId: string;
  versionId: number;
  lastUpdated: Date;
}

/**
 * Devolve (criando se necessário) a identidade FHIR de um registo interno.
 * Idempotente: chamadas repetidas devolvem sempre o mesmo `fhirId`.
 */
export async function ensureFhirId(
  clinicId: string,
  resourceType: FhirResourceType,
  internalId: string,
  db: Db = prisma,
): Promise<FhirIdentity> {
  const internalModel = INTERNAL_MODEL[resourceType];
  const existing = await db.fhirResource.findUnique({
    where: { internalModel_internalId: { internalModel, internalId } },
    select: { fhirId: true, versionId: true, lastUpdated: true },
  });
  if (existing) return existing;

  const created = await db.fhirResource.create({
    data: { clinicId, resourceType, fhirId: randomUUID(), internalModel, internalId },
    select: { fhirId: true, versionId: true, lastUpdated: true },
  });
  return created;
}

/** Identidades de vários registos de uma vez (evita N+1 nas pesquisas). */
export async function ensureFhirIds(
  clinicId: string,
  resourceType: FhirResourceType,
  internalIds: string[],
  db: Db = prisma,
): Promise<Map<string, FhirIdentity>> {
  const internalModel = INTERNAL_MODEL[resourceType];
  const unique = Array.from(new Set(internalIds));
  if (!unique.length) return new Map();

  const found = await db.fhirResource.findMany({
    where: { internalModel, internalId: { in: unique } },
    select: { internalId: true, fhirId: true, versionId: true, lastUpdated: true },
  });
  const map = new Map(found.map((r) => [r.internalId, { fhirId: r.fhirId, versionId: r.versionId, lastUpdated: r.lastUpdated }]));

  const missing = unique.filter((id) => !map.has(id));
  if (missing.length) {
    await db.fhirResource.createMany({
      data: missing.map((internalId) => ({ clinicId, resourceType, fhirId: randomUUID(), internalModel, internalId })),
      skipDuplicates: true,
    });
    const created = await db.fhirResource.findMany({
      where: { internalModel, internalId: { in: missing } },
      select: { internalId: true, fhirId: true, versionId: true, lastUpdated: true },
    });
    for (const r of created) {
      map.set(r.internalId, { fhirId: r.fhirId, versionId: r.versionId, lastUpdated: r.lastUpdated });
    }
  }
  return map;
}

/** Resolve um `fhirId` externo no registo interno, dentro da clínica autorizada. */
export async function resolveFhirId(
  clinicId: string,
  resourceType: FhirResourceType,
  fhirId: string,
  db: Db = prisma,
): Promise<{ internalId: string; versionId: number; lastUpdated: Date } | null> {
  const row = await db.fhirResource.findUnique({
    where: { resourceType_fhirId: { resourceType, fhirId } },
    select: { internalId: true, versionId: true, lastUpdated: true, clinicId: true },
  });
  if (!row || row.clinicId !== clinicId) return null;
  return { internalId: row.internalId, versionId: row.versionId, lastUpdated: row.lastUpdated };
}

/** Incrementa `meta.versionId` e actualiza `meta.lastUpdated` após uma escrita. */
export async function bumpVersion(
  resourceType: FhirResourceType,
  internalId: string,
  db: Db = prisma,
): Promise<FhirIdentity | null> {
  const internalModel = INTERNAL_MODEL[resourceType];
  try {
    return await db.fhirResource.update({
      where: { internalModel_internalId: { internalModel, internalId } },
      data: { versionId: { increment: 1 }, lastUpdated: new Date() },
      select: { fhirId: true, versionId: true, lastUpdated: true },
    });
  } catch {
    return null;
  }
}

/** Regista um identificador atribuído por um sistema externo. */
export async function attachExternalIdentifier(
  resourceType: FhirResourceType,
  internalId: string,
  identifier: { system: string; value: string },
  db: Db = prisma,
): Promise<void> {
  const internalModel = INTERNAL_MODEL[resourceType];
  const row = await db.fhirResource.findUnique({
    where: { internalModel_internalId: { internalModel, internalId } },
    select: { id: true, externalIdentifiers: true },
  });
  if (!row) return;

  const current = Array.isArray(row.externalIdentifiers) ? (row.externalIdentifiers as { system: string; value: string }[]) : [];
  if (current.some((i) => i.system === identifier.system && i.value === identifier.value)) return;

  await db.fhirResource.update({
    where: { id: row.id },
    data: { externalIdentifiers: [...current, identifier] as unknown as Prisma.InputJsonValue },
  });
}

export function meta(identity: FhirIdentity) {
  return { versionId: String(identity.versionId), lastUpdated: identity.lastUpdated.toISOString() };
}

export function reference(resourceType: FhirResourceType, fhirId: string, display?: string | null) {
  return { reference: `${resourceType}/${fhirId}`, ...(display ? { display } : {}) };
}
