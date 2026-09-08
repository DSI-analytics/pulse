import "server-only";
import { prisma } from "@/lib/prisma";
import {
  ensureFhirId,
  ensureFhirIds,
  resolveFhirId,
  type FhirIdentity,
  type FhirResourceType,
} from "./ids";
import {
  toAllergyIntolerance,
  toAppointment,
  toCondition,
  toDiagnosticReport,
  toDocumentReference,
  toEncounter,
  toMedication,
  toMedicationRequests,
  toObservation,
  toOrganization,
  toPatient,
  toPractitioner,
  toProcedure,
  type RefCtx,
} from "./mappers";

/**
 * Leitura de recursos FHIR a partir do domínio interno.
 *
 * Todas as consultas são limitadas à clínica do principal autenticado — o
 * isolamento por instituição é aplicado no `where`, nunca depois de ler.
 * As referências (`Patient/…`, `Practitioner/…`) são resolvidas em lote para
 * evitar N+1.
 */

export const MAX_COUNT = 100;
export const DEFAULT_COUNT = 20;

export interface SearchParams {
  count: number;
  offset: number;
  raw: URLSearchParams;
}

export function parseSearchParams(url: URL): SearchParams {
  const raw = url.searchParams;
  const count = Math.min(Math.max(Number.parseInt(raw.get("_count") ?? "", 10) || DEFAULT_COUNT, 1), MAX_COUNT);
  const offset = Math.max(Number.parseInt(raw.get("_offset") ?? "", 10) || 0, 0);
  return { count, offset, raw };
}

/** "Patient/abc" ou "abc" → id interno, dentro da clínica autorizada. */
async function internalIdFromRef(
  clinicId: string,
  resourceType: FhirResourceType,
  value: string | null,
): Promise<string | null> {
  if (!value) return null;
  const fhirId = value.includes("/") ? value.split("/").pop()! : value;
  const resolved = await resolveFhirId(clinicId, resourceType, fhirId);
  return resolved?.internalId ?? null;
}

function dateFilter(raw: URLSearchParams, name: string): { gte?: Date; lte?: Date } | undefined {
  const values = raw.getAll(name);
  if (!values.length) return undefined;
  const range: { gte?: Date; lte?: Date } = {};
  for (const value of values) {
    const match = /^(eq|ge|gt|le|lt)?(.+)$/.exec(value.trim());
    if (!match) continue;
    const prefix = match[1] ?? "eq";
    const text = match[2]!;
    const date = new Date(text.length === 10 ? `${text}T00:00:00.000Z` : text);
    if (Number.isNaN(date.getTime())) continue;
    if (prefix === "eq") {
      range.gte = date;
      range.lte = new Date(date.getTime() + (text.length === 10 ? 86_400_000 - 1 : 0));
    } else if (prefix === "ge" || prefix === "gt") range.gte = date;
    else range.lte = date;
  }
  return Object.keys(range).length ? range : undefined;
}

export interface ResourceBundle {
  resources: unknown[];
  total: number;
}

async function refCtx(
  clinicId: string,
  ids: { patients?: string[]; doctors?: string[]; encounters?: string[] },
): Promise<RefCtx> {
  const [patients, doctors, encounters, clinic] = await Promise.all([
    ids.patients?.length ? ensureFhirIds(clinicId, "Patient", ids.patients) : new Map<string, FhirIdentity>(),
    ids.doctors?.length ? ensureFhirIds(clinicId, "Practitioner", ids.doctors) : new Map<string, FhirIdentity>(),
    ids.encounters?.length ? ensureFhirIds(clinicId, "Encounter", ids.encounters) : new Map<string, FhirIdentity>(),
    prisma.clinic.findUnique({ where: { id: clinicId }, select: { id: true, name: true } }),
  ]);

  const organization = clinic ? { ...(await ensureFhirId(clinicId, "Organization", clinic.id)), name: clinic.name } : null;

  return {
    patient: (id) => (patients.has(id) ? { fhirId: patients.get(id)!.fhirId } : null),
    practitioner: (id) => (doctors.has(id) ? { fhirId: doctors.get(id)!.fhirId } : null),
    encounter: (id) => (encounters.has(id) ? { fhirId: encounters.get(id)!.fhirId } : null),
    organization: organization ? { fhirId: organization.fhirId, name: organization.name } : null,
  };
}

const PATIENT_SELECT = {
  id: true, code: true, name: true, birthDate: true, gender: true, maritalStatus: true, phone: true, phoneAlt: true,
  email: true, address: true, street: true, streetNumber: true, neighbourhood: true, city: true, district: true,
  province: true, country: true, preferredLanguage: true, isActive: true, deactivatedAt: true,
  emergencyContactName: true, emergencyContactRelation: true, emergencyContactPhone: true,
  identityDocuments: { select: { type: true, number: true, issuer: true, expiresAt: true } },
} as const;

/**
 * Lê um recurso por `fhirId`. Devolve `null` quando não existe ou pertence a
 * outra instituição — os dois casos são indistinguíveis para o cliente, de
 * propósito.
 */
export async function readResource(
  clinicId: string,
  resourceType: FhirResourceType,
  fhirId: string,
  appBaseUrl: string,
): Promise<unknown | null> {
  const resolved = await resolveFhirId(clinicId, resourceType, fhirId);
  if (!resolved) return null;
  const identity: FhirIdentity = { fhirId, versionId: resolved.versionId, lastUpdated: resolved.lastUpdated };
  const id = resolved.internalId;

  switch (resourceType) {
    case "Patient": {
      const row = await prisma.patient.findFirst({ where: { id, clinicId }, select: PATIENT_SELECT });
      if (!row) return null;
      const ctx = await refCtx(clinicId, {});
      return toPatient(row, identity, ctx.organization ?? undefined);
    }
    case "Practitioner": {
      const row = await prisma.doctor.findFirst({
        where: { id, clinicId },
        select: { id: true, name: true, email: true, phone: true, licenseNumber: true, status: true, specialty: { select: { name: true } } },
      });
      return row ? toPractitioner(row, identity) : null;
    }
    case "Organization": {
      const row = await prisma.clinic.findFirst({
        where: { id, ...(id === clinicId ? {} : { id: "__negado__" }) },
        select: { id: true, name: true, nuit: true, phone: true, email: true, address: true, city: true, country: true },
      });
      return row ? toOrganization(row, identity) : null;
    }
    case "Encounter": {
      const row = await prisma.encounter.findFirst({
        where: { id, clinicId },
        select: {
          id: true, number: true, type: true, status: true, startedAt: true, endedAt: true, reason: true,
          patientId: true, doctorId: true, specialty: { select: { name: true } },
        },
      });
      if (!row) return null;
      const ctx = await refCtx(clinicId, { patients: [row.patientId], doctors: row.doctorId ? [row.doctorId] : [] });
      return toEncounter(row, identity, ctx);
    }
    case "Appointment": {
      const row = await prisma.appointment.findFirst({
        where: { id, clinicId },
        select: {
          id: true, status: true, type: true, startAt: true, endAt: true, reason: true, patientId: true,
          doctorId: true, encounterId: true, specialty: { select: { name: true } },
        },
      });
      if (!row) return null;
      const ctx = await refCtx(clinicId, { patients: [row.patientId], doctors: [row.doctorId] });
      return toAppointment(row, identity, ctx);
    }
    case "Observation": {
      const row = await prisma.vitalSign.findFirst({ where: { id, clinicId } });
      if (!row) return null;
      const ctx = await refCtx(clinicId, { patients: [row.patientId], encounters: row.encounterId ? [row.encounterId] : [] });
      return toObservation(row, identity, ctx);
    }
    case "Condition": {
      const row = await prisma.diagnosis.findFirst({ where: { id, clinicId } });
      if (!row) return null;
      const ctx = await refCtx(clinicId, { patients: [row.patientId], encounters: row.encounterId ? [row.encounterId] : [] });
      return toCondition(row, identity, ctx);
    }
    case "AllergyIntolerance": {
      const row = await prisma.allergy.findFirst({ where: { id, clinicId } });
      if (!row) return null;
      const ctx = await refCtx(clinicId, { patients: [row.patientId] });
      return toAllergyIntolerance(row, identity, ctx);
    }
    case "Medication": {
      const row = await prisma.medication.findFirst({ where: { id, clinicId } });
      return row ? toMedication(row, identity) : null;
    }
    case "MedicationRequest": {
      const row = await prisma.prescription.findFirst({
        where: { id, clinicId },
        include: { items: true },
      });
      if (!row) return null;
      const ctx = await refCtx(clinicId, {
        patients: [row.patientId],
        doctors: row.doctorId ? [row.doctorId] : [],
        encounters: row.encounterId ? [row.encounterId] : [],
      });
      return toMedicationRequests(row, identity, ctx)[0] ?? null;
    }
    case "DiagnosticReport": {
      const row = await prisma.diagnosticResult.findFirst({
        where: { id, clinicId },
        include: { order: true, items: true },
      });
      if (!row) return null;
      const ctx = await refCtx(clinicId, {
        patients: [row.order.patientId],
        doctors: row.order.doctorId ? [row.order.doctorId] : [],
        encounters: row.order.encounterId ? [row.order.encounterId] : [],
      });
      return toDiagnosticReport(row, identity, ctx);
    }
    case "Procedure": {
      const row = await prisma.clinicalProcedure.findFirst({ where: { id, clinicId } });
      if (!row) return null;
      const ctx = await refCtx(clinicId, {
        patients: [row.patientId],
        doctors: row.doctorId ? [row.doctorId] : [],
        encounters: row.encounterId ? [row.encounterId] : [],
      });
      return toProcedure(row, identity, ctx);
    }
    case "DocumentReference": {
      const row = await prisma.clinicalAttachment.findFirst({ where: { id, clinicId, deletedAt: null } });
      if (!row) return null;
      const ctx = await refCtx(clinicId, {
        patients: row.patientId ? [row.patientId] : [],
        encounters: row.encounterId ? [row.encounterId] : [],
      });
      return toDocumentReference(row, identity, ctx, appBaseUrl);
    }
    default:
      return null;
  }
}

/** Pesquisa paginada. Suporta um subconjunto documentado de parâmetros FHIR. */
export async function searchResources(
  clinicId: string,
  resourceType: FhirResourceType,
  params: SearchParams,
  appBaseUrl: string,
): Promise<ResourceBundle> {
  const { raw, count, offset } = params;
  const patientFilter = await internalIdFromRef(clinicId, "Patient", raw.get("patient") ?? raw.get("subject"));
  const status = raw.get("status");

  const withIdentities = async (
    resource: FhirResourceType,
    rows: { id: string }[],
  ): Promise<Map<string, FhirIdentity>> => ensureFhirIds(clinicId, resource, rows.map((r) => r.id));

  switch (resourceType) {
    case "Patient": {
      const name = raw.get("name") ?? raw.get("family");
      const identifier = raw.get("identifier");
      const birthdate = dateFilter(raw, "birthdate");
      const where = {
        clinicId,
        ...(raw.get("active") ? { isActive: raw.get("active") === "true" } : {}),
        ...(name ? { name: { contains: name, mode: "insensitive" as const } } : {}),
        ...(birthdate ? { birthDate: birthdate } : {}),
        ...(identifier
          ? { OR: [{ code: identifier }, { identityDocuments: { some: { number: identifier } } }] }
          : {}),
      };
      const [rows, total] = await Promise.all([
        prisma.patient.findMany({ where, orderBy: { name: "asc" }, skip: offset, take: count, select: PATIENT_SELECT }),
        prisma.patient.count({ where }),
      ]);
      const ids = await withIdentities("Patient", rows);
      const ctx = await refCtx(clinicId, {});
      return { total, resources: rows.map((r) => toPatient(r, ids.get(r.id)!, ctx.organization ?? undefined)) };
    }

    case "Practitioner": {
      const name = raw.get("name");
      const where = { clinicId, ...(name ? { name: { contains: name, mode: "insensitive" as const } } : {}) };
      const [rows, total] = await Promise.all([
        prisma.doctor.findMany({
          where, orderBy: { name: "asc" }, skip: offset, take: count,
          select: { id: true, name: true, email: true, phone: true, licenseNumber: true, status: true, specialty: { select: { name: true } } },
        }),
        prisma.doctor.count({ where }),
      ]);
      const ids = await withIdentities("Practitioner", rows);
      return { total, resources: rows.map((r) => toPractitioner(r, ids.get(r.id)!)) };
    }

    case "Organization": {
      const row = await prisma.clinic.findUnique({
        where: { id: clinicId },
        select: { id: true, name: true, nuit: true, phone: true, email: true, address: true, city: true, country: true },
      });
      if (!row) return { total: 0, resources: [] };
      const identity = await ensureFhirId(clinicId, "Organization", row.id);
      return { total: 1, resources: [toOrganization(row, identity)] };
    }

    case "Encounter": {
      const where = {
        clinicId,
        ...(patientFilter ? { patientId: patientFilter } : {}),
        ...(status ? { status: status.toUpperCase() as never } : {}),
        ...(dateFilter(raw, "date") ? { startedAt: dateFilter(raw, "date") } : {}),
      };
      const [rows, total] = await Promise.all([
        prisma.encounter.findMany({
          where, orderBy: { startedAt: "desc" }, skip: offset, take: count,
          select: {
            id: true, number: true, type: true, status: true, startedAt: true, endedAt: true, reason: true,
            patientId: true, doctorId: true, specialty: { select: { name: true } },
          },
        }),
        prisma.encounter.count({ where }),
      ]);
      const ids = await withIdentities("Encounter", rows);
      const ctx = await refCtx(clinicId, {
        patients: rows.map((r) => r.patientId),
        doctors: rows.map((r) => r.doctorId).filter((v): v is string => Boolean(v)),
      });
      return { total, resources: rows.map((r) => toEncounter(r, ids.get(r.id)!, ctx)) };
    }

    case "Appointment": {
      const where = {
        clinicId,
        ...(patientFilter ? { patientId: patientFilter } : {}),
        ...(dateFilter(raw, "date") ? { startAt: dateFilter(raw, "date") } : {}),
      };
      const [rows, total] = await Promise.all([
        prisma.appointment.findMany({
          where, orderBy: { startAt: "desc" }, skip: offset, take: count,
          select: {
            id: true, status: true, type: true, startAt: true, endAt: true, reason: true, patientId: true,
            doctorId: true, encounterId: true, specialty: { select: { name: true } },
          },
        }),
        prisma.appointment.count({ where }),
      ]);
      const ids = await withIdentities("Appointment", rows);
      const ctx = await refCtx(clinicId, { patients: rows.map((r) => r.patientId), doctors: rows.map((r) => r.doctorId) });
      return { total, resources: rows.map((r) => toAppointment(r, ids.get(r.id)!, ctx)) };
    }

    case "Observation": {
      const where = {
        clinicId,
        ...(patientFilter ? { patientId: patientFilter } : {}),
        ...(dateFilter(raw, "date") ? { recordedAt: dateFilter(raw, "date") } : {}),
      };
      const [rows, total] = await Promise.all([
        prisma.vitalSign.findMany({ where, orderBy: { recordedAt: "desc" }, skip: offset, take: count }),
        prisma.vitalSign.count({ where }),
      ]);
      const ids = await withIdentities("Observation", rows);
      const ctx = await refCtx(clinicId, {
        patients: rows.map((r) => r.patientId),
        encounters: rows.map((r) => r.encounterId).filter((v): v is string => Boolean(v)),
      });
      return { total, resources: rows.map((r) => toObservation(r, ids.get(r.id)!, ctx)) };
    }

    case "Condition": {
      const where = {
        clinicId,
        ...(patientFilter ? { patientId: patientFilter } : {}),
        ...(raw.get("clinical-status") ? { isActive: raw.get("clinical-status") === "active" } : {}),
        ...(raw.get("code") ? { code: raw.get("code")! } : {}),
      };
      const [rows, total] = await Promise.all([
        prisma.diagnosis.findMany({ where, orderBy: { recordedAt: "desc" }, skip: offset, take: count }),
        prisma.diagnosis.count({ where }),
      ]);
      const ids = await withIdentities("Condition", rows);
      const ctx = await refCtx(clinicId, {
        patients: rows.map((r) => r.patientId),
        encounters: rows.map((r) => r.encounterId).filter((v): v is string => Boolean(v)),
      });
      return { total, resources: rows.map((r) => toCondition(r, ids.get(r.id)!, ctx)) };
    }

    case "AllergyIntolerance": {
      const where = { clinicId, ...(patientFilter ? { patientId: patientFilter } : {}) };
      const [rows, total] = await Promise.all([
        prisma.allergy.findMany({ where, orderBy: { createdAt: "desc" }, skip: offset, take: count }),
        prisma.allergy.count({ where }),
      ]);
      const ids = await withIdentities("AllergyIntolerance", rows);
      const ctx = await refCtx(clinicId, { patients: rows.map((r) => r.patientId) });
      return { total, resources: rows.map((r) => toAllergyIntolerance(r, ids.get(r.id)!, ctx)) };
    }

    case "Medication": {
      const code = raw.get("code");
      const where = { clinicId, ...(code ? { name: { contains: code, mode: "insensitive" as const } } : {}) };
      const [rows, total] = await Promise.all([
        prisma.medication.findMany({ where, orderBy: { name: "asc" }, skip: offset, take: count }),
        prisma.medication.count({ where }),
      ]);
      const ids = await withIdentities("Medication", rows);
      return { total, resources: rows.map((r) => toMedication(r, ids.get(r.id)!)) };
    }

    case "MedicationRequest": {
      const where = {
        clinicId,
        ...(patientFilter ? { patientId: patientFilter } : {}),
        ...(status ? { status: status.toUpperCase() as never } : {}),
      };
      const [rows, total] = await Promise.all([
        prisma.prescription.findMany({ where, orderBy: { issuedAt: "desc" }, skip: offset, take: count, include: { items: true } }),
        prisma.prescription.count({ where }),
      ]);
      const ids = await withIdentities("MedicationRequest", rows);
      const ctx = await refCtx(clinicId, {
        patients: rows.map((r) => r.patientId),
        doctors: rows.map((r) => r.doctorId).filter((v): v is string => Boolean(v)),
        encounters: rows.map((r) => r.encounterId).filter((v): v is string => Boolean(v)),
      });
      return { total, resources: rows.flatMap((r) => toMedicationRequests(r, ids.get(r.id)!, ctx)) };
    }

    case "DiagnosticReport": {
      const where = {
        clinicId,
        ...(patientFilter ? { order: { patientId: patientFilter } } : {}),
        ...(dateFilter(raw, "date") ? { performedAt: dateFilter(raw, "date") } : {}),
      };
      const [rows, total] = await Promise.all([
        prisma.diagnosticResult.findMany({ where, orderBy: { createdAt: "desc" }, skip: offset, take: count, include: { order: true, items: true } }),
        prisma.diagnosticResult.count({ where }),
      ]);
      const ids = await withIdentities("DiagnosticReport", rows);
      const ctx = await refCtx(clinicId, {
        patients: rows.map((r) => r.order.patientId),
        doctors: rows.map((r) => r.order.doctorId).filter((v): v is string => Boolean(v)),
        encounters: rows.map((r) => r.order.encounterId).filter((v): v is string => Boolean(v)),
      });
      return { total, resources: rows.map((r) => toDiagnosticReport(r, ids.get(r.id)!, ctx)) };
    }

    case "Procedure": {
      const where = {
        clinicId,
        ...(patientFilter ? { patientId: patientFilter } : {}),
        ...(dateFilter(raw, "date") ? { performedAt: dateFilter(raw, "date") } : {}),
      };
      const [rows, total] = await Promise.all([
        prisma.clinicalProcedure.findMany({ where, orderBy: { performedAt: "desc" }, skip: offset, take: count }),
        prisma.clinicalProcedure.count({ where }),
      ]);
      const ids = await withIdentities("Procedure", rows);
      const ctx = await refCtx(clinicId, {
        patients: rows.map((r) => r.patientId),
        doctors: rows.map((r) => r.doctorId).filter((v): v is string => Boolean(v)),
        encounters: rows.map((r) => r.encounterId).filter((v): v is string => Boolean(v)),
      });
      return { total, resources: rows.map((r) => toProcedure(r, ids.get(r.id)!, ctx)) };
    }

    case "DocumentReference": {
      const where = {
        clinicId,
        deletedAt: null,
        ...(patientFilter ? { patientId: patientFilter } : {}),
      };
      const [rows, total] = await Promise.all([
        prisma.clinicalAttachment.findMany({ where, orderBy: { createdAt: "desc" }, skip: offset, take: count }),
        prisma.clinicalAttachment.count({ where }),
      ]);
      const ids = await withIdentities("DocumentReference", rows);
      const ctx = await refCtx(clinicId, {
        patients: rows.map((r) => r.patientId).filter((v): v is string => Boolean(v)),
        encounters: rows.map((r) => r.encounterId).filter((v): v is string => Boolean(v)),
      });
      return { total, resources: rows.map((r) => toDocumentReference(r, ids.get(r.id)!, ctx, appBaseUrl)) };
    }

    default:
      return { total: 0, resources: [] };
  }
}

/** `_lastUpdated` aplica-se ao registo de identidade FHIR, não ao domínio. */
export function lastUpdatedFilter(raw: URLSearchParams) {
  return dateFilter(raw, "_lastUpdated");
}
