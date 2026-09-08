"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { auditAs } from "@/lib/audit";
import { requireUser, type SessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can, type Permission } from "@/lib/rbac";
import { checkAllergyConflicts, normaliseSubstance, type AllergyWarning } from "@/lib/domain/allergy-check";
import { computeBmi, parseVital, type VitalKey } from "@/lib/domain/vitals";
import { formatSequence, withNumberRetry } from "@/lib/sequences";

/**
 * Escrita no prontuário clínico electrónico.
 *
 * Regras aplicadas em todas as acções deste ficheiro:
 *  - a permissão é verificada no servidor, nunca no cliente;
 *  - o `clinicId` vem sempre da sessão — nunca do payload;
 *  - operações com vários registos correm em transacção;
 *  - cada escrita gera um evento de auditoria com before/after;
 *  - nada de clínico é apagado fisicamente: usa-se estado/inactivação.
 */

export type ActionResult<T = unknown> = ({ ok: true } & T) | { error: string };

type Access = { ok: true; user: SessionUser; clinicId: string } | { ok: false; error: string };

async function guard(permission: Permission): Promise<Access> {
  const user = await requireUser();
  if (!can(user.role, permission)) return { ok: false, error: "Sem permissão para esta operação." };
  return { ok: true, user, clinicId: user.clinicId };
}

async function requirePatient(clinicId: string, patientId: string) {
  return prisma.patient.findFirst({
    where: { id: patientId, clinicId, isActive: true },
    select: { id: true, name: true, code: true },
  });
}

function trimmed(value: unknown, max = 10_000): string {
  return String(value ?? "").trim().slice(0, max);
}

function orNull(value: unknown, max = 10_000): string | null {
  const text = trimmed(value, max);
  return text.length ? text : null;
}

function parseDate(value: unknown): Date | null {
  const text = trimmed(value, 40);
  if (!text) return null;
  const date = new Date(text.length === 10 ? `${text}T00:00:00.000Z` : text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function revalidatePatient(patientId: string) {
  revalidatePath(`/pacientes/${patientId}`);
  revalidatePath("/pacientes");
  revalidatePath("/consultas");
}

// ─────────────────────────────────────────────────────────────────────────────
// Episódios clínicos
// ─────────────────────────────────────────────────────────────────────────────

const encounterSchema = z.object({
  patientId: z.string().min(1, "Paciente obrigatório."),
  type: z.enum(["CONSULTA", "URGENCIA", "ACOMPANHAMENTO", "INTERNAMENTO", "PROCEDIMENTO", "EXAME", "ENCAMINHAMENTO"]),
  doctorId: z.string().optional().default(""),
  specialtyId: z.string().optional().default(""),
  reason: z.string().max(2000).optional().default(""),
  startedAt: z.string().optional().default(""),
});

export type EncounterValues = z.input<typeof encounterSchema>;

export async function createEncounter(values: EncounterValues): Promise<ActionResult<{ id: string; number: string }>> {
  const access = await guard("encounter.manage");
  if (!access.ok) return { error: access.error };
  const parsed = encounterSchema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  const patient = await requirePatient(access.clinicId, parsed.data.patientId);
  if (!patient) return { error: "Paciente não encontrado." };

  if (parsed.data.doctorId) {
    const doctor = await prisma.doctor.findFirst({ where: { id: parsed.data.doctorId, clinicId: access.clinicId }, select: { id: true } });
    if (!doctor) return { error: "Médico inválido." };
  }
  if (parsed.data.specialtyId) {
    const specialty = await prisma.specialty.findFirst({ where: { id: parsed.data.specialtyId, clinicId: access.clinicId }, select: { id: true } });
    if (!specialty) return { error: "Especialidade inválida." };
  }

  const startedAt = parseDate(parsed.data.startedAt) ?? new Date();
  const year = startedAt.getUTCFullYear();

  const created = await withNumberRetry(async () => {
    const count = await prisma.encounter.count({ where: { clinicId: access.clinicId } });
    return prisma.encounter.create({
      data: {
        clinicId: access.clinicId,
        patientId: patient.id,
        number: formatSequence("encounter", year, count + 1),
        type: parsed.data.type,
        doctorId: parsed.data.doctorId || null,
        specialtyId: parsed.data.specialtyId || null,
        reason: orNull(parsed.data.reason, 2000),
        startedAt,
        createdById: access.user.userId,
      },
      select: { id: true, number: true, type: true, status: true, startedAt: true, reason: true },
    });
  });

  await auditAs(actor(access.user), {
    action: "encounter.create",
    entity: "Encounter",
    entityId: created.id,
    after: created as unknown as Record<string, unknown>,
    metadata: { patientId: patient.id },
  });
  revalidatePatient(patient.id);
  return { ok: true, id: created.id, number: created.number };
}

export async function closeEncounter(encounterId: string, summary: string, outcome: string): Promise<ActionResult> {
  const access = await guard("encounter.manage");
  if (!access.ok) return { error: access.error };
  const existing = await prisma.encounter.findFirst({
    where: { id: encounterId, clinicId: access.clinicId },
    select: { id: true, patientId: true, status: true, summary: true, outcome: true, endedAt: true, version: true },
  });
  if (!existing) return { error: "Episódio não encontrado." };
  if (existing.status === "CANCELADO") return { error: "Episódio cancelado não pode ser concluído." };

  const updated = await prisma.encounter.update({
    where: { id: existing.id },
    data: {
      status: "CONCLUIDO",
      endedAt: new Date(),
      summary: orNull(summary, 5000),
      outcome: orNull(outcome, 2000),
      version: { increment: 1 },
    },
    select: { id: true, status: true, endedAt: true, summary: true, outcome: true },
  });

  await auditAs(actor(access.user), {
    action: "encounter.close",
    entity: "Encounter",
    entityId: existing.id,
    before: existing as unknown as Record<string, unknown>,
    after: updated as unknown as Record<string, unknown>,
  });
  revalidatePatient(existing.patientId);
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Sinais vitais
// ─────────────────────────────────────────────────────────────────────────────

const VITAL_FIELDS: VitalKey[] = [
  "systolic", "diastolic", "heartRate", "respiratoryRate", "temperature",
  "oxygenSaturation", "weightKg", "heightCm", "glucose", "painScore",
];

export type VitalsValues = Partial<Record<VitalKey, string>> & {
  patientId: string;
  encounterId?: string;
  consultationId?: string;
  admissionId?: string;
  source?: string;
  notes?: string;
  recordedAt?: string;
};

export async function recordVitals(values: VitalsValues): Promise<ActionResult<{ id: string }>> {
  const access = await guard("vitals.record");
  if (!access.ok) return { error: access.error };
  const patient = await requirePatient(access.clinicId, values.patientId);
  if (!patient) return { error: "Paciente não encontrado." };

  const numbers: Partial<Record<VitalKey, number | null>> = {};
  try {
    for (const key of VITAL_FIELDS) numbers[key] = parseVital(key, values[key] ?? null);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Sinais vitais inválidos." };
  }
  if (VITAL_FIELDS.every((key) => numbers[key] === null)) {
    return { error: "Registe pelo menos um sinal vital." };
  }

  const links = await resolveClinicalLinks(access.clinicId, patient.id, values);
  if ("error" in links) return links;

  const created = await prisma.vitalSign.create({
    data: {
      clinicId: access.clinicId,
      patientId: patient.id,
      encounterId: links.encounterId,
      consultationId: links.consultationId,
      admissionId: links.admissionId,
      source: (["CONSULTA", "TRIAGEM", "INTERNAMENTO", "DOMICILIO"] as const).includes(values.source as never)
        ? (values.source as "CONSULTA")
        : "CONSULTA",
      recordedAt: parseDate(values.recordedAt) ?? new Date(),
      recordedById: access.user.userId,
      ...numbers,
      bmi: computeBmi(numbers.weightKg ?? null, numbers.heightCm ?? null),
      notes: orNull(values.notes, 2000),
    },
    select: { id: true, recordedAt: true, bmi: true },
  });

  await auditAs(actor(access.user), {
    action: "vitals.create",
    entity: "VitalSign",
    entityId: created.id,
    after: { ...numbers, bmi: created.bmi } as Record<string, unknown>,
    metadata: { patientId: patient.id },
  });
  revalidatePatient(patient.id);
  return { ok: true, id: created.id };
}

// ─────────────────────────────────────────────────────────────────────────────
// Diagnósticos
// ─────────────────────────────────────────────────────────────────────────────

const diagnosisSchema = z.object({
  patientId: z.string().min(1),
  description: z.string().trim().min(3, "Descreva o diagnóstico."),
  kind: z.enum(["PRINCIPAL", "SECUNDARIO", "DIFERENCIAL"]).default("PRINCIPAL"),
  certainty: z.enum(["PROVISORIO", "CONFIRMADO", "REFUTADO"]).default("PROVISORIO"),
  code: z.string().trim().max(32).optional().default(""),
  codeSystem: z.string().trim().max(32).optional().default(""),
  onsetDate: z.string().optional().default(""),
  notes: z.string().max(4000).optional().default(""),
  encounterId: z.string().optional().default(""),
  consultationId: z.string().optional().default(""),
});

export type DiagnosisValues = z.input<typeof diagnosisSchema>;

export async function addDiagnosis(values: DiagnosisValues): Promise<ActionResult<{ id: string }>> {
  const access = await guard("consultation.conduct");
  if (!access.ok) return { error: access.error };
  const parsed = diagnosisSchema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  const patient = await requirePatient(access.clinicId, parsed.data.patientId);
  if (!patient) return { error: "Paciente não encontrado." };
  const links = await resolveClinicalLinks(access.clinicId, patient.id, parsed.data);
  if ("error" in links) return links;

  const created = await prisma.diagnosis.create({
    data: {
      clinicId: access.clinicId,
      patientId: patient.id,
      encounterId: links.encounterId,
      consultationId: links.consultationId,
      kind: parsed.data.kind,
      certainty: parsed.data.certainty,
      code: orNull(parsed.data.code, 32),
      codeSystem: orNull(parsed.data.codeSystem, 32),
      description: parsed.data.description,
      onsetDate: parseDate(parsed.data.onsetDate),
      notes: orNull(parsed.data.notes, 4000),
      doctorId: access.user.doctorId ?? null,
      recordedById: access.user.userId,
    },
    select: { id: true, description: true, kind: true, certainty: true, code: true, codeSystem: true },
  });

  await auditAs(actor(access.user), {
    action: "diagnosis.create",
    entity: "Diagnosis",
    entityId: created.id,
    after: created as unknown as Record<string, unknown>,
    metadata: { patientId: patient.id },
  });
  revalidatePatient(patient.id);
  return { ok: true, id: created.id };
}

/** Inactivação em vez de eliminação — o diagnóstico permanece no histórico. */
export async function deactivateDiagnosis(id: string, reason: string): Promise<ActionResult> {
  const access = await guard("consultation.conduct");
  if (!access.ok) return { error: access.error };
  const existing = await prisma.diagnosis.findFirst({
    where: { id, clinicId: access.clinicId },
    select: { id: true, patientId: true, isActive: true, notes: true, certainty: true },
  });
  if (!existing) return { error: "Diagnóstico não encontrado." };

  const updated = await prisma.diagnosis.update({
    where: { id: existing.id },
    data: { isActive: false, certainty: "REFUTADO", notes: orNull(reason, 4000) ?? existing.notes },
    select: { id: true, isActive: true, certainty: true },
  });
  await auditAs(actor(access.user), {
    action: "diagnosis.deactivate",
    entity: "Diagnosis",
    entityId: existing.id,
    before: existing as unknown as Record<string, unknown>,
    after: updated as unknown as Record<string, unknown>,
  });
  revalidatePatient(existing.patientId);
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Alergias
// ─────────────────────────────────────────────────────────────────────────────

const allergySchema = z.object({
  patientId: z.string().min(1),
  substance: z.string().trim().min(2, "Indique a substância."),
  category: z.enum(["MEDICAMENTO", "ALIMENTO", "AMBIENTAL", "BIOLOGICO", "OUTRO"]).default("MEDICAMENTO"),
  kind: z.enum(["ALERGIA", "INTOLERANCIA"]).default("ALERGIA"),
  reaction: z.string().max(1000).optional().default(""),
  severity: z.enum(["LEVE", "MODERADA", "GRAVE", "FATAL"]).default("MODERADA"),
  status: z.enum(["ACTIVA", "INACTIVA", "RESOLVIDA", "REFUTADA"]).default("ACTIVA"),
  identifiedAt: z.string().optional().default(""),
  notes: z.string().max(2000).optional().default(""),
});

export type AllergyValues = z.input<typeof allergySchema>;

export async function addAllergy(values: AllergyValues): Promise<ActionResult<{ id: string }>> {
  const access = await guard("allergy.manage");
  if (!access.ok) return { error: access.error };
  const parsed = allergySchema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  const patient = await requirePatient(access.clinicId, parsed.data.patientId);
  if (!patient) return { error: "Paciente não encontrado." };

  const substanceKey = normaliseSubstance(parsed.data.substance);
  const duplicate = await prisma.allergy.findFirst({
    where: { clinicId: access.clinicId, patientId: patient.id, substanceKey, status: "ACTIVA" },
    select: { id: true },
  });
  if (duplicate) return { error: "Já existe uma alergia activa registada para esta substância." };

  const created = await prisma.allergy.create({
    data: {
      clinicId: access.clinicId,
      patientId: patient.id,
      substance: parsed.data.substance,
      substanceKey,
      category: parsed.data.category,
      kind: parsed.data.kind,
      reaction: orNull(parsed.data.reaction, 1000),
      severity: parsed.data.severity,
      status: parsed.data.status,
      identifiedAt: parseDate(parsed.data.identifiedAt),
      notes: orNull(parsed.data.notes, 2000),
      doctorId: access.user.doctorId ?? null,
      recordedById: access.user.userId,
    },
    select: { id: true, substance: true, severity: true, status: true, category: true, kind: true },
  });

  await auditAs(actor(access.user), {
    action: "allergy.create",
    entity: "Allergy",
    entityId: created.id,
    after: created as unknown as Record<string, unknown>,
    metadata: { patientId: patient.id },
  });

  if (created.severity === "GRAVE" || created.severity === "FATAL") {
    await prisma.notification.create({
      data: {
        clinicId: access.clinicId,
        type: "ALERTA_CLINICO",
        severity: "CRITICO",
        title: `Alergia grave registada — ${patient.name}`,
        body: `${created.substance} (${created.severity.toLowerCase()})`,
        entity: "Patient",
        entityId: patient.id,
        requiredPermission: "consultation.viewClinical",
      },
    });
  }

  revalidatePatient(patient.id);
  return { ok: true, id: created.id };
}

export async function setAllergyStatus(
  id: string,
  status: "ACTIVA" | "INACTIVA" | "RESOLVIDA" | "REFUTADA",
): Promise<ActionResult> {
  const access = await guard("allergy.manage");
  if (!access.ok) return { error: access.error };
  const existing = await prisma.allergy.findFirst({
    where: { id, clinicId: access.clinicId },
    select: { id: true, patientId: true, status: true, substance: true },
  });
  if (!existing) return { error: "Alergia não encontrada." };

  const updated = await prisma.allergy.update({ where: { id: existing.id }, data: { status }, select: { id: true, status: true } });
  await auditAs(actor(access.user), {
    action: "allergy.status",
    entity: "Allergy",
    entityId: existing.id,
    before: { status: existing.status },
    after: { status: updated.status },
  });
  revalidatePatient(existing.patientId);
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Prescrições
// ─────────────────────────────────────────────────────────────────────────────

const prescriptionItemSchema = z.object({
  medicationId: z.string().optional().default(""),
  medicationName: z.string().trim().min(2, "Indique o medicamento."),
  activeIngredient: z.string().trim().max(200).optional().default(""),
  dose: z.string().trim().max(60).optional().default(""),
  doseUnit: z.string().trim().max(30).optional().default(""),
  route: z
    .enum(["ORAL", "INTRAVENOSA", "INTRAMUSCULAR", "SUBCUTANEA", "TOPICA", "INALATORIA", "RECTAL", "OFTALMICA", "OTOLOGICA", "NASAL", "OUTRA"])
    .optional(),
  frequency: z.string().trim().max(120).optional().default(""),
  durationDays: z.coerce.number().int().min(0).max(3650).optional(),
  quantity: z.string().trim().max(60).optional().default(""),
  instructions: z.string().trim().max(2000).optional().default(""),
});

const prescriptionSchema = z.object({
  patientId: z.string().min(1),
  encounterId: z.string().optional().default(""),
  consultationId: z.string().optional().default(""),
  validUntil: z.string().optional().default(""),
  notes: z.string().max(2000).optional().default(""),
  /** Prescrição substituída — a antiga é suspensa, nunca apagada. */
  replacesId: z.string().optional().default(""),
  /** Confirmação explícita perante alertas de alergia graves. */
  acknowledgeAllergyWarnings: z.boolean().optional().default(false),
  items: z.array(prescriptionItemSchema).min(1, "Adicione pelo menos um medicamento."),
});

export type PrescriptionValues = z.input<typeof prescriptionSchema>;

/** Pré-verificação para a UI: devolve os alertas sem gravar nada. */
export async function checkPrescriptionAllergies(
  patientId: string,
  items: { medicationName: string; activeIngredient?: string }[],
): Promise<ActionResult<{ warnings: Record<string, AllergyWarning[]> }>> {
  const access = await guard("prescription.create");
  if (!access.ok) return { error: access.error };
  const patient = await requirePatient(access.clinicId, patientId);
  if (!patient) return { error: "Paciente não encontrado." };

  const allergies = await prisma.allergy.findMany({
    where: { clinicId: access.clinicId, patientId: patient.id, status: "ACTIVA" },
    select: { id: true, substance: true, substanceKey: true, severity: true, kind: true, reaction: true },
  });

  const warnings: Record<string, AllergyWarning[]> = {};
  for (const item of items) {
    const found = checkAllergyConflicts(
      { medicationName: item.medicationName, activeIngredient: item.activeIngredient ?? null },
      allergies,
    );
    if (found.length) warnings[item.medicationName] = found;
  }
  return { ok: true, warnings };
}

export async function createPrescription(values: PrescriptionValues): Promise<ActionResult<{ id: string; number: string; warnings: AllergyWarning[] }>> {
  const access = await guard("prescription.create");
  if (!access.ok) return { error: access.error };
  const parsed = prescriptionSchema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  const patient = await requirePatient(access.clinicId, parsed.data.patientId);
  if (!patient) return { error: "Paciente não encontrado." };
  const links = await resolveClinicalLinks(access.clinicId, patient.id, parsed.data);
  if ("error" in links) return links;

  // Medicamentos do catálogo têm de pertencer à clínica.
  const catalogIds = parsed.data.items.map((i) => i.medicationId).filter(Boolean) as string[];
  const catalog = catalogIds.length
    ? await prisma.medication.findMany({
        where: { id: { in: catalogIds }, clinicId: access.clinicId },
        select: { id: true, name: true, activeIngredient: true },
      })
    : [];
  const catalogById = new Map(catalog.map((m) => [m.id, m]));
  for (const id of catalogIds) if (!catalogById.has(id)) return { error: "Medicamento do catálogo inválido." };

  const allergies = await prisma.allergy.findMany({
    where: { clinicId: access.clinicId, patientId: patient.id, status: "ACTIVA" },
    select: { id: true, substance: true, substanceKey: true, severity: true, kind: true, reaction: true },
  });

  const itemsWithWarnings = parsed.data.items.map((item) => {
    const fromCatalog = item.medicationId ? catalogById.get(item.medicationId) : undefined;
    const medicationName = fromCatalog?.name ?? item.medicationName;
    const activeIngredient = item.activeIngredient || fromCatalog?.activeIngredient || null;
    const warnings = checkAllergyConflicts({ medicationName, activeIngredient }, allergies);
    return { item, medicationName, activeIngredient, warnings };
  });

  const allWarnings = itemsWithWarnings.flatMap((i) => i.warnings);
  const blocking = allWarnings.filter((w) => w.severity === "GRAVE" || w.severity === "FATAL");
  if (blocking.length && !parsed.data.acknowledgeAllergyWarnings) {
    return {
      error:
        `Conflito com alergia registada: ${blocking.map((w) => w.substance).join(", ")}. ` +
        "Reveja a prescrição ou confirme explicitamente para prosseguir.",
    };
  }

  const now = new Date();
  const year = now.getUTCFullYear();

  let superseded: { id: string; number: string; status: string } | null = null;
  if (parsed.data.replacesId) {
    const previous = await prisma.prescription.findFirst({
      where: { id: parsed.data.replacesId, clinicId: access.clinicId, patientId: patient.id },
      select: { id: true, number: true, status: true, replacedBy: { select: { id: true } } },
    });
    if (!previous) return { error: "Prescrição a substituir não encontrada." };
    if (previous.replacedBy) return { error: "Essa prescrição já foi substituída." };
    superseded = { id: previous.id, number: previous.number, status: previous.status };
  }

  const created = await withNumberRetry(async () =>
    prisma.$transaction(async (tx) => {
      const count = await tx.prescription.count({ where: { clinicId: access.clinicId } });
      const prescription = await tx.prescription.create({
        data: {
          clinicId: access.clinicId,
          patientId: patient.id,
          encounterId: links.encounterId,
          consultationId: links.consultationId,
          doctorId: access.user.doctorId ?? null,
          number: formatSequence("prescription", year, count + 1),
          issuedAt: now,
          validUntil: parseDate(parsed.data.validUntil),
          notes: orNull(parsed.data.notes, 2000),
          replacesId: superseded?.id ?? null,
          createdById: access.user.userId,
          items: {
            create: itemsWithWarnings.map(({ item, medicationName, activeIngredient, warnings }) => ({
              medicationId: item.medicationId || null,
              medicationName,
              activeIngredient,
              dose: orNull(item.dose, 60),
              doseUnit: orNull(item.doseUnit, 30),
              route: item.route ?? null,
              frequency: orNull(item.frequency, 120),
              durationDays: item.durationDays ?? null,
              quantity: orNull(item.quantity, 60),
              instructions: orNull(item.instructions, 2000),
              allergyWarnings: warnings.length ? (warnings as unknown as Prisma.InputJsonValue) : undefined,
            })),
          },
        },
        select: { id: true, number: true, issuedAt: true, status: true },
      });

      // A prescrição anterior é SUSPENSA e mantida — nunca alterada em silêncio.
      if (superseded) {
        await tx.prescription.update({
          where: { id: superseded.id },
          data: { status: "SUSPENSA", version: { increment: 1 } },
        });
      }
      return prescription;
    }),
  );

  await auditAs(actor(access.user), {
    action: "prescription.create",
    entity: "Prescription",
    entityId: created.id,
    after: { number: created.number, items: itemsWithWarnings.length, replacesId: superseded?.id ?? null },
    metadata: {
      patientId: patient.id,
      allergyWarnings: allWarnings.length,
      acknowledged: blocking.length ? parsed.data.acknowledgeAllergyWarnings : false,
    },
  });
  if (superseded) {
    await auditAs(actor(access.user), {
      action: "prescription.supersede",
      entity: "Prescription",
      entityId: superseded.id,
      before: { status: superseded.status },
      after: { status: "SUSPENSA", replacedBy: created.number },
    });
  }

  revalidatePatient(patient.id);
  return { ok: true, id: created.id, number: created.number, warnings: allWarnings };
}

export async function setPrescriptionStatus(
  id: string,
  status: "ACTIVA" | "CONCLUIDA" | "SUSPENSA" | "CANCELADA",
  reason = "",
): Promise<ActionResult> {
  const access = await guard("prescription.create");
  if (!access.ok) return { error: access.error };
  const existing = await prisma.prescription.findFirst({
    where: { id, clinicId: access.clinicId },
    select: { id: true, patientId: true, status: true, number: true },
  });
  if (!existing) return { error: "Prescrição não encontrada." };

  const updated = await prisma.prescription.update({
    where: { id: existing.id },
    data: { status, cancelReason: status === "CANCELADA" ? orNull(reason, 500) : null, version: { increment: 1 } },
    select: { id: true, status: true },
  });
  await auditAs(actor(access.user), {
    action: "prescription.status",
    entity: "Prescription",
    entityId: existing.id,
    before: { status: existing.status },
    after: { status: updated.status, reason: orNull(reason, 500) },
  });
  revalidatePatient(existing.patientId);
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Exames: pedidos e resultados
// ─────────────────────────────────────────────────────────────────────────────

const orderSchema = z.object({
  patientId: z.string().min(1),
  name: z.string().trim().min(2, "Indique o exame."),
  category: z.enum(["LABORATORIO", "IMAGIOLOGIA", "OUTRO"]).default("LABORATORIO"),
  priority: z.enum(["ROTINA", "URGENTE", "EMERGENTE"]).default("ROTINA"),
  serviceId: z.string().optional().default(""),
  code: z.string().trim().max(32).optional().default(""),
  codeSystem: z.string().trim().max(32).optional().default(""),
  notes: z.string().max(2000).optional().default(""),
  encounterId: z.string().optional().default(""),
  consultationId: z.string().optional().default(""),
});

export type DiagnosticOrderValues = z.input<typeof orderSchema>;

export async function createDiagnosticOrder(values: DiagnosticOrderValues): Promise<ActionResult<{ id: string; number: string }>> {
  const access = await guard("laboratory.manage");
  if (!access.ok) return { error: access.error };
  const parsed = orderSchema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  const patient = await requirePatient(access.clinicId, parsed.data.patientId);
  if (!patient) return { error: "Paciente não encontrado." };
  const links = await resolveClinicalLinks(access.clinicId, patient.id, parsed.data);
  if ("error" in links) return links;

  if (parsed.data.serviceId) {
    const service = await prisma.service.findFirst({ where: { id: parsed.data.serviceId, clinicId: access.clinicId }, select: { id: true } });
    if (!service) return { error: "Serviço inválido." };
  }

  const now = new Date();
  const created = await withNumberRetry(async () => {
    const count = await prisma.diagnosticOrder.count({ where: { clinicId: access.clinicId } });
    return prisma.diagnosticOrder.create({
      data: {
        clinicId: access.clinicId,
        patientId: patient.id,
        encounterId: links.encounterId,
        consultationId: links.consultationId,
        serviceId: parsed.data.serviceId || null,
        number: formatSequence("diagnosticOrder", now.getUTCFullYear(), count + 1),
        category: parsed.data.category,
        name: parsed.data.name,
        code: orNull(parsed.data.code, 32),
        codeSystem: orNull(parsed.data.codeSystem, 32),
        priority: parsed.data.priority,
        requestedAt: now,
        doctorId: access.user.doctorId ?? null,
        requestedById: access.user.userId,
        notes: orNull(parsed.data.notes, 2000),
      },
      select: { id: true, number: true, name: true, category: true, priority: true, status: true },
    });
  });

  await auditAs(actor(access.user), {
    action: "lab.order.create",
    entity: "DiagnosticOrder",
    entityId: created.id,
    after: created as unknown as Record<string, unknown>,
    metadata: { patientId: patient.id },
  });
  revalidatePatient(patient.id);
  return { ok: true, id: created.id, number: created.number };
}

export async function setDiagnosticOrderStatus(
  id: string,
  status: "SOLICITADO" | "AGENDADO" | "RECOLHIDO" | "EM_PROCESSAMENTO" | "CONCLUIDO" | "CANCELADO",
  reason = "",
): Promise<ActionResult> {
  const access = await guard("laboratory.manage");
  if (!access.ok) return { error: access.error };
  const existing = await prisma.diagnosticOrder.findFirst({
    where: { id, clinicId: access.clinicId },
    select: { id: true, patientId: true, status: true, scheduledAt: true, collectedAt: true },
  });
  if (!existing) return { error: "Pedido não encontrado." };

  const now = new Date();
  const updated = await prisma.diagnosticOrder.update({
    where: { id: existing.id },
    data: {
      status,
      scheduledAt: status === "AGENDADO" ? (existing.scheduledAt ?? now) : existing.scheduledAt,
      collectedAt: status === "RECOLHIDO" ? (existing.collectedAt ?? now) : existing.collectedAt,
      cancelReason: status === "CANCELADO" ? orNull(reason, 500) : null,
      version: { increment: 1 },
    },
    select: { id: true, status: true },
  });

  await auditAs(actor(access.user), {
    action: "lab.order.status",
    entity: "DiagnosticOrder",
    entityId: existing.id,
    before: { status: existing.status },
    after: { status: updated.status },
  });
  revalidatePatient(existing.patientId);
  return { ok: true };
}

const resultItemSchema = z.object({
  name: z.string().trim().min(1, "Indique o parâmetro."),
  value: z.string().trim().max(200).optional().default(""),
  unit: z.string().trim().max(30).optional().default(""),
  referenceRange: z.string().trim().max(80).optional().default(""),
  isAbnormal: z.boolean().optional().default(false),
  flag: z.string().trim().max(20).optional().default(""),
  code: z.string().trim().max(32).optional().default(""),
  codeSystem: z.string().trim().max(32).optional().default(""),
});

const resultSchema = z.object({
  orderId: z.string().min(1),
  conclusion: z.string().max(4000).optional().default(""),
  notes: z.string().max(4000).optional().default(""),
  performedAt: z.string().optional().default(""),
  performedBy: z.string().trim().max(160).optional().default(""),
  validate: z.boolean().optional().default(false),
  items: z.array(resultItemSchema).default([]),
});

export type DiagnosticResultValues = z.input<typeof resultSchema>;

export async function recordDiagnosticResult(values: DiagnosticResultValues): Promise<ActionResult<{ id: string }>> {
  const access = await guard("laboratory.manage");
  if (!access.ok) return { error: access.error };
  const parsed = resultSchema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  const order = await prisma.diagnosticOrder.findFirst({
    where: { id: parsed.data.orderId, clinicId: access.clinicId },
    select: { id: true, patientId: true, name: true, status: true, patient: { select: { name: true } }, result: { select: { id: true } } },
  });
  if (!order) return { error: "Pedido não encontrado." };
  if (order.status === "CANCELADO") return { error: "Pedido cancelado — não é possível lançar resultados." };

  const now = new Date();
  const performedAt = parseDate(parsed.data.performedAt) ?? now;

  const saved = await prisma.$transaction(async (tx) => {
    const result = await tx.diagnosticResult.upsert({
      where: { orderId: order.id },
      create: {
        clinicId: access.clinicId,
        orderId: order.id,
        conclusion: orNull(parsed.data.conclusion, 4000),
        notes: orNull(parsed.data.notes, 4000),
        performedAt,
        performedBy: orNull(parsed.data.performedBy, 160),
        validatedAt: parsed.data.validate ? now : null,
        validatedById: parsed.data.validate ? access.user.userId : null,
      },
      update: {
        conclusion: orNull(parsed.data.conclusion, 4000),
        notes: orNull(parsed.data.notes, 4000),
        performedAt,
        performedBy: orNull(parsed.data.performedBy, 160),
        ...(parsed.data.validate ? { validatedAt: now, validatedById: access.user.userId } : {}),
      },
      select: { id: true },
    });

    // Os parâmetros são substituídos em bloco dentro da transacção; o histórico
    // da alteração fica no log de auditoria.
    await tx.diagnosticResultItem.deleteMany({ where: { resultId: result.id } });
    if (parsed.data.items.length) {
      await tx.diagnosticResultItem.createMany({
        data: parsed.data.items.map((item) => ({
          resultId: result.id,
          name: item.name,
          value: orNull(item.value, 200),
          valueNumeric: Number.isFinite(Number(String(item.value).replace(",", "."))) ? Number(String(item.value).replace(",", ".")) : null,
          unit: orNull(item.unit, 30),
          referenceRange: orNull(item.referenceRange, 80),
          isAbnormal: Boolean(item.isAbnormal),
          flag: orNull(item.flag, 20),
          code: orNull(item.code, 32),
          codeSystem: orNull(item.codeSystem, 32),
        })),
      });
    }

    await tx.diagnosticOrder.update({
      where: { id: order.id },
      data: { status: "CONCLUIDO", version: { increment: 1 } },
    });

    await tx.notification.create({
      data: {
        clinicId: access.clinicId,
        type: "RESULTADO_EXAME",
        severity: parsed.data.items.some((i) => i.isAbnormal) ? "AVISO" : "INFO",
        title: `Resultado disponível — ${order.name}`,
        body: `Paciente ${order.patient.name}`,
        entity: "DiagnosticOrder",
        entityId: order.id,
        requiredPermission: "laboratory.view",
      },
    });

    return result;
  });

  await auditAs(actor(access.user), {
    action: "lab.result.record",
    entity: "DiagnosticResult",
    entityId: saved.id,
    after: { orderId: order.id, items: parsed.data.items.length, validated: parsed.data.validate },
    metadata: { patientId: order.patientId },
  });
  revalidatePatient(order.patientId);
  return { ok: true, id: saved.id };
}

// ─────────────────────────────────────────────────────────────────────────────
// Procedimentos, tratamentos e internamentos
// ─────────────────────────────────────────────────────────────────────────────

const procedureSchema = z.object({
  patientId: z.string().min(1),
  name: z.string().trim().min(2, "Indique o procedimento."),
  status: z.enum(["PLANEADO", "REALIZADO", "CANCELADO"]).default("REALIZADO"),
  performedAt: z.string().optional().default(""),
  description: z.string().max(4000).optional().default(""),
  outcome: z.string().max(2000).optional().default(""),
  complications: z.string().max(2000).optional().default(""),
  notes: z.string().max(2000).optional().default(""),
  encounterId: z.string().optional().default(""),
  admissionId: z.string().optional().default(""),
  serviceId: z.string().optional().default(""),
});

export type ProcedureValues = z.input<typeof procedureSchema>;

export async function addProcedure(values: ProcedureValues): Promise<ActionResult<{ id: string }>> {
  const access = await guard("consultation.conduct");
  if (!access.ok) return { error: access.error };
  const parsed = procedureSchema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  const patient = await requirePatient(access.clinicId, parsed.data.patientId);
  if (!patient) return { error: "Paciente não encontrado." };
  const links = await resolveClinicalLinks(access.clinicId, patient.id, parsed.data);
  if ("error" in links) return links;

  const created = await prisma.clinicalProcedure.create({
    data: {
      clinicId: access.clinicId,
      patientId: patient.id,
      encounterId: links.encounterId,
      admissionId: links.admissionId,
      serviceId: parsed.data.serviceId || null,
      name: parsed.data.name,
      status: parsed.data.status,
      performedAt: parseDate(parsed.data.performedAt) ?? new Date(),
      doctorId: access.user.doctorId ?? null,
      description: orNull(parsed.data.description, 4000),
      outcome: orNull(parsed.data.outcome, 2000),
      complications: orNull(parsed.data.complications, 2000),
      notes: orNull(parsed.data.notes, 2000),
      recordedById: access.user.userId,
    },
    select: { id: true, name: true, status: true, performedAt: true },
  });

  await auditAs(actor(access.user), {
    action: "procedure.create",
    entity: "ClinicalProcedure",
    entityId: created.id,
    after: created as unknown as Record<string, unknown>,
    metadata: { patientId: patient.id },
  });
  revalidatePatient(patient.id);
  return { ok: true, id: created.id };
}

const treatmentSchema = z.object({
  patientId: z.string().min(1),
  name: z.string().trim().min(2, "Indique o tratamento."),
  plan: z.string().max(4000).optional().default(""),
  startedAt: z.string().optional().default(""),
  endedAt: z.string().optional().default(""),
  status: z.enum(["PLANEADO", "EM_CURSO", "CONCLUIDO", "SUSPENSO", "CANCELADO"]).default("EM_CURSO"),
  evolution: z.string().max(4000).optional().default(""),
  encounterId: z.string().optional().default(""),
});

export type TreatmentValues = z.input<typeof treatmentSchema>;

export async function addTreatment(values: TreatmentValues): Promise<ActionResult<{ id: string }>> {
  const access = await guard("consultation.conduct");
  if (!access.ok) return { error: access.error };
  const parsed = treatmentSchema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  const patient = await requirePatient(access.clinicId, parsed.data.patientId);
  if (!patient) return { error: "Paciente não encontrado." };
  const links = await resolveClinicalLinks(access.clinicId, patient.id, parsed.data);
  if ("error" in links) return links;

  const created = await prisma.treatment.create({
    data: {
      clinicId: access.clinicId,
      patientId: patient.id,
      encounterId: links.encounterId,
      name: parsed.data.name,
      plan: orNull(parsed.data.plan, 4000),
      startedAt: parseDate(parsed.data.startedAt) ?? new Date(),
      endedAt: parseDate(parsed.data.endedAt),
      status: parsed.data.status,
      evolution: orNull(parsed.data.evolution, 4000),
      doctorId: access.user.doctorId ?? null,
    },
    select: { id: true, name: true, status: true },
  });

  await auditAs(actor(access.user), {
    action: "treatment.create",
    entity: "Treatment",
    entityId: created.id,
    after: created as unknown as Record<string, unknown>,
    metadata: { patientId: patient.id },
  });
  revalidatePatient(patient.id);
  return { ok: true, id: created.id };
}

const admissionSchema = z.object({
  patientId: z.string().min(1),
  reason: z.string().max(2000).optional().default(""),
  ward: z.string().trim().max(120).optional().default(""),
  room: z.string().trim().max(60).optional().default(""),
  bed: z.string().trim().max(60).optional().default(""),
  diagnosis: z.string().max(2000).optional().default(""),
  admittedAt: z.string().optional().default(""),
  encounterId: z.string().optional().default(""),
});

export type AdmissionValues = z.input<typeof admissionSchema>;

export async function createAdmission(values: AdmissionValues): Promise<ActionResult<{ id: string; number: string }>> {
  const access = await guard("admission.manage");
  if (!access.ok) return { error: access.error };
  const parsed = admissionSchema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  const patient = await requirePatient(access.clinicId, parsed.data.patientId);
  if (!patient) return { error: "Paciente não encontrado." };
  const links = await resolveClinicalLinks(access.clinicId, patient.id, parsed.data);
  if ("error" in links) return links;

  const open = await prisma.admission.findFirst({
    where: { clinicId: access.clinicId, patientId: patient.id, status: "ADMITIDO" },
    select: { id: true, number: true },
  });
  if (open) return { error: `O paciente já tem um internamento activo (${open.number}).` };

  const now = new Date();
  const created = await withNumberRetry(async () => {
    const count = await prisma.admission.count({ where: { clinicId: access.clinicId } });
    return prisma.admission.create({
      data: {
        clinicId: access.clinicId,
        patientId: patient.id,
        encounterId: links.encounterId,
        number: formatSequence("admission", now.getUTCFullYear(), count + 1),
        admittedAt: parseDate(parsed.data.admittedAt) ?? now,
        reason: orNull(parsed.data.reason, 2000),
        ward: orNull(parsed.data.ward, 120),
        room: orNull(parsed.data.room, 60),
        bed: orNull(parsed.data.bed, 60),
        diagnosis: orNull(parsed.data.diagnosis, 2000),
        doctorId: access.user.doctorId ?? null,
        createdById: access.user.userId,
      },
      select: { id: true, number: true, admittedAt: true, ward: true, room: true, bed: true, status: true },
    });
  });

  await auditAs(actor(access.user), {
    action: "admission.create",
    entity: "Admission",
    entityId: created.id,
    after: created as unknown as Record<string, unknown>,
    metadata: { patientId: patient.id },
  });
  revalidatePatient(patient.id);
  return { ok: true, id: created.id, number: created.number };
}

export async function dischargeAdmission(
  id: string,
  values: { summary?: string; recommendations?: string; dischargedAt?: string; evolution?: string },
): Promise<ActionResult> {
  const access = await guard("admission.manage");
  if (!access.ok) return { error: access.error };
  const existing = await prisma.admission.findFirst({
    where: { id, clinicId: access.clinicId },
    select: { id: true, patientId: true, status: true, dischargedAt: true, encounterId: true },
  });
  if (!existing) return { error: "Internamento não encontrado." };
  if (existing.status !== "ADMITIDO") return { error: "Este internamento já foi encerrado." };

  const dischargedAt = parseDate(values.dischargedAt) ?? new Date();

  const updated = await prisma.$transaction(async (tx) => {
    const admission = await tx.admission.update({
      where: { id: existing.id },
      data: {
        status: "ALTA",
        dischargedAt,
        dischargeSummary: orNull(values.summary, 8000),
        dischargeRecommendations: orNull(values.recommendations, 4000),
        evolution: orNull(values.evolution, 8000),
        version: { increment: 1 },
      },
      select: { id: true, status: true, dischargedAt: true },
    });
    if (existing.encounterId) {
      await tx.encounter.update({
        where: { id: existing.encounterId },
        data: { status: "CONCLUIDO", endedAt: dischargedAt, version: { increment: 1 } },
      });
    }
    return admission;
  });

  await auditAs(actor(access.user), {
    action: "admission.discharge",
    entity: "Admission",
    entityId: existing.id,
    before: { status: existing.status, dischargedAt: existing.dischargedAt },
    after: { status: updated.status, dischargedAt: updated.dischargedAt },
  });
  revalidatePatient(existing.patientId);
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Auxiliares
// ─────────────────────────────────────────────────────────────────────────────

function actor(user: SessionUser) {
  return {
    userId: user.userId,
    clinicId: user.clinicId,
    name: user.name,
    role: user.role,
    sessionId: user.sessionId ?? null,
  };
}

/**
 * Valida que episódio / consulta / internamento indicados pertencem à mesma
 * clínica **e** ao mesmo paciente. Impede IDOR por payload manipulado.
 */
async function resolveClinicalLinks(
  clinicId: string,
  patientId: string,
  values: { encounterId?: string; consultationId?: string; admissionId?: string },
): Promise<{ encounterId: string | null; consultationId: string | null; admissionId: string | null } | { error: string }> {
  const out = { encounterId: null as string | null, consultationId: null as string | null, admissionId: null as string | null };

  if (values.encounterId) {
    const found = await prisma.encounter.findFirst({ where: { id: values.encounterId, clinicId, patientId }, select: { id: true } });
    if (!found) return { error: "Episódio inválido para este paciente." };
    out.encounterId = found.id;
  }
  if (values.consultationId) {
    const found = await prisma.consultation.findFirst({ where: { id: values.consultationId, clinicId, patientId }, select: { id: true, encounterId: true } });
    if (!found) return { error: "Consulta inválida para este paciente." };
    out.consultationId = found.id;
    out.encounterId = out.encounterId ?? found.encounterId;
  }
  if (values.admissionId) {
    const found = await prisma.admission.findFirst({ where: { id: values.admissionId, clinicId, patientId }, select: { id: true, encounterId: true } });
    if (!found) return { error: "Internamento inválido para este paciente." };
    out.admissionId = found.id;
    out.encounterId = out.encounterId ?? found.encounterId;
  }
  return out;
}
