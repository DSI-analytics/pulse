"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ClinicalAddendumKind, ClinicalRecordType, Prisma } from "@prisma/client";
import { auditAs } from "@/lib/audit";
import { requireUser, type SessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can, type Permission } from "@/lib/rbac";
import { checkAllergyConflicts, normaliseSubstance, type AllergyWarning } from "@/lib/domain/allergy-check";
import { computeBmi, parseVital, type VitalKey } from "@/lib/domain/vitals";
import { isImmutabilityError } from "@/lib/domain/clinical-immutability";
import { isValidIcdCode, normaliseIcdCode } from "@/lib/domain/icd";
import { lookupIcdCode, rememberIcdCode } from "@/server/icd11";
import { formatSequence, nextSequenceValue, SEQUENCE_PREFIX, withNumberRetry } from "@/lib/sequences";
import { getTranslator, getUiContext } from "@/i18n/server";
import type { Translator } from "@/i18n/translate";
import type { MessageKey } from "@/i18n/types";

/**
 * Escrita no prontuário clínico electrónico.
 *
 * Regras aplicadas em todas as acções deste ficheiro:
 *  - a permissão é verificada no servidor, nunca no cliente;
 *  - o `clinicId` vem sempre da sessão — nunca do payload;
 *  - operações com vários registos correm em transacção;
 *  - cada escrita gera um evento de auditoria com before/after;
 *  - o prontuário é append-only: nada é alterado nem apagado — corrige-se
 *    acrescentando um registo novo ou uma adenda (`ClinicalAddendum`).
 */

export type ActionResult<T = unknown> = ({ ok: true } & T) | { error: string };

type Access = { ok: true; user: SessionUser; clinicId: string; t: Translator } | { ok: false; error: string };

async function guard(permission: Permission): Promise<Access> {
  const user = await requireUser();
  const t = await getTranslator();
  if (!can(user.role, permission)) return { ok: false, error: t("clinical.errors.noPermission") };
  return { ok: true, user, clinicId: user.clinicId, t };
}

/** Basta uma das permissões indicadas. */
async function guardAny(...permissions: Permission[]): Promise<Access> {
  const user = await requireUser();
  const t = await getTranslator();
  if (!permissions.some((permission) => can(user.role, permission))) {
    return { ok: false, error: t("clinical.errors.noPermission") };
  }
  return { ok: true, user, clinicId: user.clinicId, t };
}

/**
 * Rede de segurança: as acções recusam explicitamente o que é imutável, mas se
 * alguma escrita escapar, o gatilho da base de dados trava-a — e o erro cru do
 * PostgreSQL é aqui traduzido.
 */
function immutabilityMessage(error: unknown, t: Translator): string | null {
  return isImmutabilityError(error) ? t("clinical.immutable.blocked") : null;
}

/** Corre uma escrita clínica traduzindo a recusa do gatilho de imutabilidade. */
async function clinicalWrite<T>(t: Translator, run: () => Promise<T>): Promise<{ ok: true; value: T } | { error: string }> {
  try {
    return { ok: true, value: await run() };
  } catch (error) {
    const blocked = immutabilityMessage(error, t);
    if (blocked) return { error: blocked };
    throw error;
  }
}

/**
 * Mensagem da primeira falha de validação. Os esquemas usam chaves do
 * dicionário; mensagens nativas do zod (que não são chaves) passam intactas.
 */
function issueMessage(t: Translator, error: z.ZodError): string {
  return t((error.issues[0]?.message ?? "") as MessageKey);
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
  patientId: z.string().min(1, "clinical.errors.patientRequired"),
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
  if (!parsed.success) return { error: issueMessage(access.t, parsed.error) };

  const patient = await requirePatient(access.clinicId, parsed.data.patientId);
  if (!patient) return { error: access.t("clinical.errors.patientNotFound") };

  if (parsed.data.doctorId) {
    const doctor = await prisma.doctor.findFirst({ where: { id: parsed.data.doctorId, clinicId: access.clinicId }, select: { id: true } });
    if (!doctor) return { error: access.t("clinical.errors.invalidDoctor") };
  }
  if (parsed.data.specialtyId) {
    const specialty = await prisma.specialty.findFirst({ where: { id: parsed.data.specialtyId, clinicId: access.clinicId }, select: { id: true } });
    if (!specialty) return { error: access.t("clinical.errors.invalidSpecialty") };
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
  if (!existing) return { error: access.t("clinical.errors.encounterNotFound") };
  if (existing.status === "CANCELADO") return { error: access.t("clinical.errors.encounterCancelled") };
  // Episódio já concluído: nada a alterar — o que houver a acrescentar é adenda.
  if (existing.status !== "EM_CURSO") return { error: access.t("clinical.immutable.recordLocked") };

  const write = await clinicalWrite(access.t, () =>
    prisma.encounter.update({
      where: { id: existing.id },
      data: {
        status: "CONCLUIDO",
        endedAt: new Date(),
        summary: orNull(summary, 5000),
        outcome: orNull(outcome, 2000),
        version: { increment: 1 },
      },
      select: { id: true, status: true, endedAt: true, summary: true, outcome: true },
    }),
  );
  if ("error" in write) return write;
  const updated = write.value;

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
  if (!patient) return { error: access.t("clinical.errors.patientNotFound") };

  const numbers: Partial<Record<VitalKey, number | null>> = {};
  try {
    for (const key of VITAL_FIELDS) numbers[key] = parseVital(key, values[key] ?? null, access.t);
  } catch (error) {
    return { error: error instanceof Error ? error.message : access.t("clinical.errors.invalidVitals") };
  }
  if (VITAL_FIELDS.every((key) => numbers[key] === null)) {
    return { error: access.t("clinical.errors.vitalsRequired") };
  }

  const links = await resolveClinicalLinks(access.t, access.clinicId, patient.id, values);
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

/**
 * O diagnóstico NÃO é texto livre: é escolhido na CID-11 (ICD-11) da OMS. O
 * `description` guardado é o título oficial do catálogo; o texto livre do
 * médico vai para `notes`.
 */
const diagnosisSchema = z.object({
  patientId: z.string().min(1),
  code: z.string().trim().min(1, "clinical.icd.required"),
  codeSystem: z.string().trim().max(32).optional().default("ICD-11"),
  codeUri: z.string().trim().max(400).optional().default(""),
  codeRelease: z.string().trim().max(32).optional().default(""),
  /** Título devolvido pelo selector — só é aceite se o código existir. */
  title: z.string().trim().max(500).optional().default(""),
  kind: z.enum(["PRINCIPAL", "SECUNDARIO", "DIFERENCIAL"]).default("PRINCIPAL"),
  certainty: z.enum(["PROVISORIO", "CONFIRMADO"]).default("PROVISORIO"),
  onsetDate: z.string().optional().default(""),
  notes: z.string().max(4000).optional().default(""),
  encounterId: z.string().optional().default(""),
  consultationId: z.string().optional().default(""),
});

export type DiagnosisValues = z.input<typeof diagnosisSchema>;

/** Idioma dos títulos da CID-11 neste pedido. */
async function uiLanguage(): Promise<string> {
  try {
    return (await getUiContext()).locale;
  } catch {
    return "pt";
  }
}

/**
 * Confirma o código na CID-11 e devolve o título oficial. O catálogo vem
 * sempre da OMS (ou da cache local do que já foi usado) — nunca do formulário.
 */
async function resolveIcdDiagnosis(
  t: Translator,
  values: { code: string; codeSystem?: string; codeUri?: string; codeRelease?: string },
): Promise<{ code: string; description: string; codeUri: string | null; codeRelease: string | null } | { error: string }> {
  if ((values.codeSystem || "ICD-11") !== "ICD-11") return { error: t("clinical.errors.diagnosisCodeSystem") };
  const code = normaliseIcdCode(values.code);
  if (!isValidIcdCode(code)) return { error: t("clinical.icd.required") };

  const language = await uiLanguage();
  const hit = await lookupIcdCode(code, language);
  if (!hit) return { error: t("clinical.errors.diagnosisCodeUnknown") };

  await rememberIcdCode(hit, language);
  return {
    code: hit.code,
    description: hit.title,
    codeUri: hit.uri ?? orNull(values.codeUri, 400),
    codeRelease: hit.release || orNull(values.codeRelease, 32),
  };
}

export async function addDiagnosis(values: DiagnosisValues): Promise<ActionResult<{ id: string }>> {
  const access = await guard("consultation.conduct");
  if (!access.ok) return { error: access.error };
  const parsed = diagnosisSchema.safeParse(values);
  if (!parsed.success) return { error: issueMessage(access.t, parsed.error) };

  const patient = await requirePatient(access.clinicId, parsed.data.patientId);
  if (!patient) return { error: access.t("clinical.errors.patientNotFound") };
  const links = await resolveClinicalLinks(access.t, access.clinicId, patient.id, parsed.data);
  if ("error" in links) return links;

  const coded = await resolveIcdDiagnosis(access.t, parsed.data);
  if ("error" in coded) return coded;

  const created = await prisma.diagnosis.create({
    data: {
      clinicId: access.clinicId,
      patientId: patient.id,
      encounterId: links.encounterId,
      consultationId: links.consultationId,
      kind: parsed.data.kind,
      certainty: parsed.data.certainty,
      code: coded.code,
      codeSystem: "ICD-11",
      codeUri: coded.codeUri,
      codeRelease: coded.codeRelease,
      description: coded.description,
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

/**
 * Anulação de um diagnóstico.
 *
 * A linha `Diagnosis` NÃO é tocada: fica no histórico tal como foi escrita. A
 * anulação é uma adenda (`ANULACAO`) que passa a acompanhá-la — é assim que a
 * leitura do prontuário a exclui dos problemas activos.
 */
export async function refuteDiagnosis(id: string, reason: string): Promise<ActionResult<{ addendumId: string }>> {
  const access = await guard("consultation.conduct");
  if (!access.ok) return { error: access.error };

  const body = trimmed(reason, 4000);
  if (body.length < 3) return { error: access.t("clinical.errors.refuteReason") };

  const existing = await prisma.diagnosis.findFirst({
    where: { id, clinicId: access.clinicId },
    select: { id: true, patientId: true, encounterId: true, description: true, code: true },
  });
  if (!existing) return { error: access.t("clinical.errors.diagnosisNotFound") };

  const already = await prisma.clinicalAddendum.findFirst({
    where: { clinicId: access.clinicId, targetType: "DIAGNOSIS", targetId: existing.id, kind: "ANULACAO" },
    select: { id: true },
  });
  if (already) return { error: access.t("clinical.errors.diagnosisAlreadyRefuted") };

  const created = await prisma.clinicalAddendum.create({
    data: {
      clinicId: access.clinicId,
      patientId: existing.patientId,
      targetType: "DIAGNOSIS",
      targetId: existing.id,
      kind: "ANULACAO",
      body,
      encounterId: existing.encounterId,
      doctorId: access.user.doctorId ?? null,
      authorId: access.user.userId,
    },
    select: { id: true },
  });

  await auditAs(actor(access.user), {
    action: "diagnosis.refute",
    entity: "Diagnosis",
    entityId: existing.id,
    after: { addendumId: created.id, code: existing.code, description: existing.description },
    metadata: { patientId: existing.patientId, kind: "ANULACAO" },
  });
  revalidatePatient(existing.patientId);
  return { ok: true, addendumId: created.id };
}

// ─────────────────────────────────────────────────────────────────────────────
// Adendas ao prontuário
// ─────────────────────────────────────────────────────────────────────────────

const addendumSchema = z.object({
  patientId: z.string().min(1, "clinical.errors.patientRequired"),
  targetType: z.enum([
    "ENCOUNTER", "CONSULTATION", "DIAGNOSIS", "VITAL_SIGN", "ALLERGY", "PRESCRIPTION",
    "DIAGNOSTIC_ORDER", "DIAGNOSTIC_RESULT", "PROCEDURE", "TREATMENT", "ADMISSION", "ATTACHMENT",
  ]),
  targetId: z.string().min(1, "clinical.errors.addendumTargetNotFound"),
  kind: z.enum(["ADENDA", "CORRECCAO", "ANULACAO", "COMENTARIO"]).default("ADENDA"),
  body: z.string().trim().min(3, "clinical.errors.addendumBody").max(8000),
  replacementId: z.string().optional().default(""),
});

export interface AddendumValues {
  patientId: string;
  targetType: ClinicalRecordType;
  targetId: string;
  kind: ClinicalAddendumKind;
  body: string;
  replacementId?: string;
}

/**
 * Localiza o registo alvo dentro da clínica e do paciente da sessão. Impede
 * que um id manipulado no formulário ligue uma adenda a outra instituição.
 */
async function findAddendumTarget(
  clinicId: string,
  patientId: string,
  targetType: ClinicalRecordType,
  targetId: string,
): Promise<{ id: string; encounterId: string | null } | null> {
  const scope = { id: targetId, clinicId };
  const withPatient = { ...scope, patientId };
  switch (targetType) {
    case "ENCOUNTER":
      return prisma.encounter.findFirst({ where: withPatient, select: { id: true } }).then((r) => (r ? { id: r.id, encounterId: r.id } : null));
    case "CONSULTATION":
      return prisma.consultation.findFirst({ where: withPatient, select: { id: true, encounterId: true } });
    case "DIAGNOSIS":
      return prisma.diagnosis.findFirst({ where: withPatient, select: { id: true, encounterId: true } });
    case "VITAL_SIGN":
      return prisma.vitalSign.findFirst({ where: withPatient, select: { id: true, encounterId: true } });
    case "ALLERGY":
      return prisma.allergy.findFirst({ where: withPatient, select: { id: true } }).then((r) => (r ? { id: r.id, encounterId: null } : null));
    case "PRESCRIPTION":
      return prisma.prescription.findFirst({ where: withPatient, select: { id: true, encounterId: true } });
    case "DIAGNOSTIC_ORDER":
      return prisma.diagnosticOrder.findFirst({ where: withPatient, select: { id: true, encounterId: true } });
    case "DIAGNOSTIC_RESULT":
      return prisma.diagnosticResult
        .findFirst({ where: { id: targetId, clinicId, order: { patientId } }, select: { id: true, order: { select: { encounterId: true } } } })
        .then((r) => (r ? { id: r.id, encounterId: r.order.encounterId } : null));
    case "PROCEDURE":
      return prisma.clinicalProcedure.findFirst({ where: withPatient, select: { id: true, encounterId: true } });
    case "TREATMENT":
      return prisma.treatment.findFirst({ where: withPatient, select: { id: true, encounterId: true } });
    case "ADMISSION":
      return prisma.admission.findFirst({ where: withPatient, select: { id: true, encounterId: true } });
    case "ATTACHMENT":
      return prisma.clinicalAttachment.findFirst({ where: withPatient, select: { id: true, encounterId: true } });
    default:
      return null;
  }
}

/**
 * Acrescenta uma adenda (adenda, correcção, anulação ou comentário) a um
 * registo clínico. É a única forma de "alterar" o prontuário: o registo
 * original permanece intacto.
 */
export async function addClinicalAddendum(values: AddendumValues): Promise<ActionResult<{ id: string }>> {
  const access = await guardAny("consultation.conduct", "encounter.manage");
  if (!access.ok) return { error: access.error };
  const parsed = addendumSchema.safeParse(values);
  if (!parsed.success) return { error: issueMessage(access.t, parsed.error) };

  const patient = await requirePatient(access.clinicId, parsed.data.patientId);
  if (!patient) return { error: access.t("clinical.errors.patientNotFound") };

  const target = await findAddendumTarget(access.clinicId, patient.id, parsed.data.targetType, parsed.data.targetId);
  if (!target) return { error: access.t("clinical.errors.addendumTargetNotFound") };

  const created = await prisma.clinicalAddendum.create({
    data: {
      clinicId: access.clinicId,
      patientId: patient.id,
      targetType: parsed.data.targetType,
      targetId: target.id,
      kind: parsed.data.kind,
      body: parsed.data.body,
      replacementId: parsed.data.replacementId || null,
      encounterId: target.encounterId,
      doctorId: access.user.doctorId ?? null,
      authorId: access.user.userId,
    },
    select: { id: true, kind: true, targetType: true, targetId: true },
  });

  await auditAs(actor(access.user), {
    action: "clinical.addendum",
    entity: "ClinicalAddendum",
    entityId: created.id,
    after: created as unknown as Record<string, unknown>,
    metadata: { patientId: patient.id, targetType: parsed.data.targetType, targetId: target.id, kind: parsed.data.kind },
  });
  revalidatePatient(patient.id);
  return { ok: true, id: created.id };
}

// ─────────────────────────────────────────────────────────────────────────────
// Alergias
// ─────────────────────────────────────────────────────────────────────────────

const allergySchema = z.object({
  patientId: z.string().min(1),
  substance: z.string().trim().min(2, "clinical.errors.allergySubstance"),
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
  if (!parsed.success) return { error: issueMessage(access.t, parsed.error) };

  const patient = await requirePatient(access.clinicId, parsed.data.patientId);
  if (!patient) return { error: access.t("clinical.errors.patientNotFound") };

  const substanceKey = normaliseSubstance(parsed.data.substance);
  const duplicate = await prisma.allergy.findFirst({
    where: { clinicId: access.clinicId, patientId: patient.id, substanceKey, status: "ACTIVA" },
    select: { id: true },
  });
  if (duplicate) return { error: access.t("clinical.errors.allergyDuplicate") };

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
  if (!existing) return { error: access.t("clinical.errors.allergyNotFound") };

  const write = await clinicalWrite(access.t, () =>
    prisma.allergy.update({ where: { id: existing.id }, data: { status }, select: { id: true, status: true } }),
  );
  if ("error" in write) return write;
  const updated = write.value;
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
  medicationName: z.string().trim().min(2, "clinical.errors.medicationRequired"),
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
  items: z.array(prescriptionItemSchema).min(1, "clinical.errors.medicationsRequired"),
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
  if (!patient) return { error: access.t("clinical.errors.patientNotFound") };

  const allergies = await prisma.allergy.findMany({
    where: { clinicId: access.clinicId, patientId: patient.id, status: "ACTIVA" },
    select: { id: true, substance: true, substanceKey: true, severity: true, kind: true, reaction: true },
  });

  const warnings: Record<string, AllergyWarning[]> = {};
  for (const item of items) {
    const found = checkAllergyConflicts(
      { medicationName: item.medicationName, activeIngredient: item.activeIngredient ?? null },
      allergies,
      access.t,
    );
    if (found.length) warnings[item.medicationName] = found;
  }
  return { ok: true, warnings };
}

export async function createPrescription(values: PrescriptionValues): Promise<ActionResult<{ id: string; number: string; warnings: AllergyWarning[] }>> {
  const access = await guard("prescription.create");
  if (!access.ok) return { error: access.error };
  const parsed = prescriptionSchema.safeParse(values);
  if (!parsed.success) return { error: issueMessage(access.t, parsed.error) };

  const patient = await requirePatient(access.clinicId, parsed.data.patientId);
  if (!patient) return { error: access.t("clinical.errors.patientNotFound") };
  const links = await resolveClinicalLinks(access.t, access.clinicId, patient.id, parsed.data);
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
  for (const id of catalogIds) if (!catalogById.has(id)) return { error: access.t("clinical.errors.invalidCatalogMedication") };

  const allergies = await prisma.allergy.findMany({
    where: { clinicId: access.clinicId, patientId: patient.id, status: "ACTIVA" },
    select: { id: true, substance: true, substanceKey: true, severity: true, kind: true, reaction: true },
  });

  const itemsWithWarnings = parsed.data.items.map((item) => {
    const fromCatalog = item.medicationId ? catalogById.get(item.medicationId) : undefined;
    const medicationName = fromCatalog?.name ?? item.medicationName;
    const activeIngredient = item.activeIngredient || fromCatalog?.activeIngredient || null;
    const warnings = checkAllergyConflicts({ medicationName, activeIngredient }, allergies, access.t);
    return { item, medicationName, activeIngredient, warnings };
  });

  const allWarnings = itemsWithWarnings.flatMap((i) => i.warnings);
  const blocking = allWarnings.filter((w) => w.severity === "GRAVE" || w.severity === "FATAL");
  if (blocking.length && !parsed.data.acknowledgeAllergyWarnings) {
    return {
      error: access.t("clinical.errors.allergyConflict", { substances: blocking.map((w) => w.substance).join(", ") }),
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
    if (!previous) return { error: access.t("clinical.errors.replacedPrescriptionNotFound") };
    if (previous.replacedBy) return { error: access.t("clinical.errors.prescriptionAlreadyReplaced") };
    superseded = { id: previous.id, number: previous.number, status: previous.status };
  }

  const write = await clinicalWrite(access.t, () => withNumberRetry(async () =>
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
  ));
  if ("error" in write) return write;
  const created = write.value;

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
  if (!existing) return { error: access.t("clinical.errors.prescriptionNotFound") };

  const write = await clinicalWrite(access.t, () =>
    prisma.prescription.update({
      where: { id: existing.id },
      data: { status, cancelReason: status === "CANCELADA" ? orNull(reason, 500) : null, version: { increment: 1 } },
      select: { id: true, status: true },
    }),
  );
  if ("error" in write) return write;
  const updated = write.value;
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
  name: z.string().trim().min(2, "clinical.errors.orderName"),
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
  if (!parsed.success) return { error: issueMessage(access.t, parsed.error) };

  const patient = await requirePatient(access.clinicId, parsed.data.patientId);
  if (!patient) return { error: access.t("clinical.errors.patientNotFound") };
  const links = await resolveClinicalLinks(access.t, access.clinicId, patient.id, parsed.data);
  if ("error" in links) return links;

  if (parsed.data.serviceId) {
    const service = await prisma.service.findFirst({ where: { id: parsed.data.serviceId, clinicId: access.clinicId }, select: { id: true } });
    if (!service) return { error: access.t("clinical.errors.invalidService") };
  }

  const now = new Date();
  const created = await withNumberRetry(async () => {
    const year = now.getUTCFullYear();
    const issuedNumbers = await prisma.diagnosticOrder.findMany({
      where: { clinicId: access.clinicId, number: { startsWith: `${SEQUENCE_PREFIX.diagnosticOrder}-${year}-` } },
      select: { number: true },
    });
    const sequence = nextSequenceValue("diagnosticOrder", year, issuedNumbers.map((order) => order.number));
    return prisma.diagnosticOrder.create({
      data: {
        clinicId: access.clinicId,
        patientId: patient.id,
        encounterId: links.encounterId,
        consultationId: links.consultationId,
        serviceId: parsed.data.serviceId || null,
        number: formatSequence("diagnosticOrder", year, sequence),
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
  if (!existing) return { error: access.t("clinical.errors.orderNotFound") };

  const now = new Date();
  const write = await clinicalWrite(access.t, () =>
    prisma.diagnosticOrder.update({
      where: { id: existing.id },
      data: {
        status,
        scheduledAt: status === "AGENDADO" ? (existing.scheduledAt ?? now) : existing.scheduledAt,
        collectedAt: status === "RECOLHIDO" ? (existing.collectedAt ?? now) : existing.collectedAt,
        cancelReason: status === "CANCELADO" ? orNull(reason, 500) : null,
        version: { increment: 1 },
      },
      select: { id: true, status: true },
    }),
  );
  if ("error" in write) return write;
  const updated = write.value;

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
  name: z.string().trim().min(1, "clinical.errors.resultParameter"),
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
  if (!parsed.success) return { error: issueMessage(access.t, parsed.error) };

  const order = await prisma.diagnosticOrder.findFirst({
    where: { id: parsed.data.orderId, clinicId: access.clinicId },
    select: { id: true, patientId: true, name: true, status: true, patient: { select: { name: true } }, result: { select: { id: true } } },
  });
  if (!order) return { error: access.t("clinical.errors.orderNotFound") };
  if (order.status === "CANCELADO") return { error: access.t("clinical.errors.orderCancelled") };
  // O resultado é lançado UMA vez. Corrigir um resultado já lançado faz-se com
  // uma adenda — nunca reescrevendo os parâmetros anteriores.
  if (order.result) return { error: access.t("clinical.errors.resultAlreadyRecorded") };

  const now = new Date();
  const performedAt = parseDate(parsed.data.performedAt) ?? now;

  const write = await clinicalWrite(access.t, () => prisma.$transaction(async (tx) => {
    const result = await tx.diagnosticResult.create({
      data: {
        clinicId: access.clinicId,
        orderId: order.id,
        conclusion: orNull(parsed.data.conclusion, 4000),
        notes: orNull(parsed.data.notes, 4000),
        performedAt,
        performedBy: orNull(parsed.data.performedBy, 160),
        validatedAt: parsed.data.validate ? now : null,
        validatedById: parsed.data.validate ? access.user.userId : null,
      },
      select: { id: true },
    });

    // Os parâmetros são criados uma única vez, com o resultado.
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
  }));
  if ("error" in write) return write;
  const saved = write.value;

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
  name: z.string().trim().min(2, "clinical.errors.procedureName"),
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
  if (!parsed.success) return { error: issueMessage(access.t, parsed.error) };

  const patient = await requirePatient(access.clinicId, parsed.data.patientId);
  if (!patient) return { error: access.t("clinical.errors.patientNotFound") };
  const links = await resolveClinicalLinks(access.t, access.clinicId, patient.id, parsed.data);
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
  name: z.string().trim().min(2, "clinical.errors.treatmentName"),
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
  if (!parsed.success) return { error: issueMessage(access.t, parsed.error) };

  const patient = await requirePatient(access.clinicId, parsed.data.patientId);
  if (!patient) return { error: access.t("clinical.errors.patientNotFound") };
  const links = await resolveClinicalLinks(access.t, access.clinicId, patient.id, parsed.data);
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
  if (!parsed.success) return { error: issueMessage(access.t, parsed.error) };

  const patient = await requirePatient(access.clinicId, parsed.data.patientId);
  if (!patient) return { error: access.t("clinical.errors.patientNotFound") };
  const links = await resolveClinicalLinks(access.t, access.clinicId, patient.id, parsed.data);
  if ("error" in links) return links;

  const open = await prisma.admission.findFirst({
    where: { clinicId: access.clinicId, patientId: patient.id, status: "ADMITIDO" },
    select: { id: true, number: true },
  });
  if (open) return { error: access.t("clinical.errors.activeAdmission", { number: open.number }) };

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
  if (!existing) return { error: access.t("clinical.errors.admissionNotFound") };
  if (existing.status !== "ADMITIDO") return { error: access.t("clinical.errors.admissionClosed") };

  const dischargedAt = parseDate(values.dischargedAt) ?? new Date();

  const write = await clinicalWrite(access.t, () => prisma.$transaction(async (tx) => {
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
  }));
  if ("error" in write) return write;
  const updated = write.value;

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
  t: Translator,
  clinicId: string,
  patientId: string,
  values: { encounterId?: string; consultationId?: string; admissionId?: string },
): Promise<{ encounterId: string | null; consultationId: string | null; admissionId: string | null } | { error: string }> {
  const out = { encounterId: null as string | null, consultationId: null as string | null, admissionId: null as string | null };

  if (values.encounterId) {
    const found = await prisma.encounter.findFirst({ where: { id: values.encounterId, clinicId, patientId }, select: { id: true } });
    if (!found) return { error: t("clinical.errors.invalidEncounterForPatient") };
    out.encounterId = found.id;
  }
  if (values.consultationId) {
    const found = await prisma.consultation.findFirst({ where: { id: values.consultationId, clinicId, patientId }, select: { id: true, encounterId: true } });
    if (!found) return { error: t("clinical.errors.invalidConsultationForPatient") };
    out.consultationId = found.id;
    out.encounterId = out.encounterId ?? found.encounterId;
  }
  if (values.admissionId) {
    const found = await prisma.admission.findFirst({ where: { id: values.admissionId, clinicId, patientId }, select: { id: true, encounterId: true } });
    if (!found) return { error: t("clinical.errors.invalidAdmissionForPatient") };
    out.admissionId = found.id;
    out.encounterId = out.encounterId ?? found.encounterId;
  }
  return out;
}
