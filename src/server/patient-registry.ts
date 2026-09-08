"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auditAs } from "@/lib/audit";
import { requireUser, type SessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ADMINISTRATIVE_ROLES, can } from "@/lib/rbac";
import { formatSequence, withNumberRetry } from "@/lib/sequences";
import {
  DUPLICATE_THRESHOLD,
  documentKey,
  nameKey,
  phoneKey,
  rankDuplicates,
  type PatientIdentity,
} from "@/lib/domain/patient-matching";
import { normalizePatientProfile, type PatientProfileValues } from "@/server/patient-data";

/**
 * Cadastro único do paciente: criação com verificação de duplicados, edição do
 * perfil alargado, documentos de identificação e fusão controlada de registos.
 */

export type RegistryResult<T = unknown> = ({ ok: true } & T) | { error: string };

function actor(user: SessionUser) {
  return { userId: user.userId, clinicId: user.clinicId, name: user.name, role: user.role, sessionId: user.sessionId ?? null };
}

export interface DuplicateSuggestion {
  id: string;
  code: string;
  name: string;
  birthDate: string | null;
  phone: string | null;
  score: number;
  reasons: string[];
}

/**
 * Candidatos a duplicado. A pesquisa restringe-se a registos que partilhem pelo
 * menos um sinal forte (documento, telefone, e-mail, apelido, data de
 * nascimento) — não percorre a tabela inteira.
 */
export async function findDuplicateCandidates(
  values: PatientProfileValues & { documentNumbers?: string[]; excludeId?: string },
): Promise<RegistryResult<{ candidates: DuplicateSuggestion[] }>> {
  const user = await requireUser();
  if (!can(user.role, "patient.view")) return { error: "Sem permissão." };

  const key = nameKey(values.name);
  const tokens = key.split(" ").filter((t) => t.length >= 4).slice(0, 4);
  const phones = [phoneKey(values.phone), phoneKey(values.phoneAlt)].filter(Boolean);
  const documents = (values.documentNumbers ?? []).map(documentKey).filter(Boolean);
  const email = (values.email ?? "").trim().toLowerCase();
  const birthDate = values.birthDate ? new Date(String(values.birthDate)) : null;

  const or: object[] = [];
  for (const token of tokens) or.push({ name: { contains: token, mode: "insensitive" as const } });
  for (const phone of phones) {
    or.push({ phone: { contains: phone } });
    or.push({ phoneAlt: { contains: phone } });
  }
  if (email) or.push({ email: { equals: email, mode: "insensitive" as const } });
  if (birthDate && !Number.isNaN(birthDate.getTime())) or.push({ birthDate });
  if (documents.length) or.push({ identityDocuments: { some: { number: { in: documents } } } });
  if (!or.length) return { ok: true, candidates: [] };

  const rows = await prisma.patient.findMany({
    where: {
      clinicId: user.clinicId,
      isActive: true,
      mergedIntoId: null,
      ...(values.excludeId ? { NOT: { id: values.excludeId } } : {}),
      OR: or,
    },
    take: 40,
    select: {
      id: true, code: true, name: true, birthDate: true, gender: true, phone: true, phoneAlt: true, email: true,
      identityDocuments: { select: { number: true } },
    },
  });

  const subject: PatientIdentity = {
    id: values.excludeId,
    name: values.name ?? null,
    birthDate: values.birthDate ?? null,
    gender: values.gender ?? null,
    phone: values.phone ?? null,
    phoneAlt: values.phoneAlt ?? null,
    email: values.email ?? null,
    documentNumbers: documents,
  };

  const ranked = rankDuplicates(
    subject,
    rows.map((r) => ({ ...r, documentNumbers: r.identityDocuments.map((d) => d.number) })),
  );
  const byId = new Map(rows.map((r) => [r.id, r]));

  return {
    ok: true,
    candidates: ranked.slice(0, 8).map((c) => {
      const row = byId.get(c.id)!;
      return {
        id: row.id,
        code: row.code,
        name: row.name,
        birthDate: row.birthDate?.toISOString().slice(0, 10) ?? null,
        phone: row.phone,
        score: c.score,
        reasons: c.reasons,
      };
    }),
  };
}

const createSchema = z.object({
  name: z.string().trim().min(3, "Nome demasiado curto."),
  /** Confirmação explícita quando existe um duplicado muito provável. */
  confirmPossibleDuplicate: z.boolean().optional().default(false),
});

export async function createPatientProfile(
  values: PatientProfileValues & { confirmPossibleDuplicate?: boolean },
): Promise<RegistryResult<{ id: string; code: string; duplicates?: DuplicateSuggestion[] }>> {
  const user = await requireUser();
  if (!can(user.role, "patient.manage")) return { error: "Sem permissão para criar pacientes." };
  const parsed = createSchema.safeParse({ name: values.name, confirmPossibleDuplicate: values.confirmPossibleDuplicate });
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  let normalized: ReturnType<typeof normalizePatientProfile>;
  try {
    normalized = normalizePatientProfile(values);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Dados inválidos." };
  }

  if (!parsed.data.confirmPossibleDuplicate) {
    const check = await findDuplicateCandidates(values);
    if ("ok" in check) {
      const strong = check.candidates.filter((c) => c.score >= DUPLICATE_THRESHOLD);
      if (strong.length) {
        return {
          error:
            `Possível duplicado: ${strong.map((c) => `${c.name} (${c.code})`).join(", ")}. ` +
            "Abra o registo existente ou confirme que se trata de outra pessoa.",
        };
      }
    }
  }

  const created = await withNumberRetry(async () => {
    const count = await prisma.patient.count({ where: { clinicId: user.clinicId } });
    return prisma.patient.create({
      data: {
        clinicId: user.clinicId,
        code: formatSequence("patient", new Date().getUTCFullYear(), count + 1).replace(/^PAC-\d{4}-/, "PAC-"),
        createdById: user.userId,
        ...normalized,
      },
      select: { id: true, code: true, name: true },
    });
  });

  await auditAs(actor(user), {
    action: "patient.create",
    entity: "Patient",
    entityId: created.id,
    after: { code: created.code, name: created.name },
  });
  revalidatePath("/pacientes");
  return { ok: true, id: created.id, code: created.code };
}

export async function updatePatientProfile(
  patientId: string,
  values: PatientProfileValues & { expectedVersion?: number },
): Promise<RegistryResult<{ id: string; conflict?: true }>> {
  const user = await requireUser();
  if (!can(user.role, "patient.manage")) return { error: "Sem permissão para editar pacientes." };

  const existing = await prisma.patient.findFirst({
    where: { id: patientId, clinicId: user.clinicId },
    select: {
      id: true, version: true, name: true, phone: true, phoneAlt: true, email: true, address: true, gender: true,
      birthDate: true, maritalStatus: true, nationality: true, occupation: true, bloodType: true,
      emergencyContactName: true, emergencyContactPhone: true, chronicConditions: true,
    },
  });
  if (!existing) return { error: "Paciente não encontrado." };

  // Bloqueio optimista: dois profissionais no mesmo prontuário não se
  // sobrepõem em silêncio.
  if (values.expectedVersion !== undefined && values.expectedVersion !== existing.version) {
    return {
      error: "Este registo foi alterado por outro utilizador entretanto. Recarregue a página para ver a versão actual.",
    };
  }

  let normalized: ReturnType<typeof normalizePatientProfile>;
  try {
    normalized = normalizePatientProfile(values);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Dados inválidos." };
  }

  const updated = await prisma.patient.update({
    where: { id: existing.id },
    data: { ...normalized, version: { increment: 1 } },
    select: {
      id: true, name: true, phone: true, phoneAlt: true, email: true, address: true, gender: true, birthDate: true,
      maritalStatus: true, nationality: true, occupation: true, bloodType: true, emergencyContactName: true,
      emergencyContactPhone: true, chronicConditions: true,
    },
  });

  await auditAs(actor(user), {
    action: "patient.update",
    entity: "Patient",
    entityId: existing.id,
    before: existing as unknown as Record<string, unknown>,
    after: updated as unknown as Record<string, unknown>,
  });
  revalidatePath("/pacientes");
  revalidatePath(`/pacientes/${existing.id}`);
  return { ok: true, id: existing.id };
}

// ── Documentos de identificação ──────────────────────────────────────────

const documentSchema = z.object({
  patientId: z.string().min(1),
  type: z.enum(["BI", "PASSAPORTE", "DIRE", "NUIT", "CARTA_CONDUCAO", "CEDULA", "OUTRO"]),
  number: z.string().trim().min(3, "Indique o número do documento."),
  issuer: z.string().trim().max(120).optional().default(""),
  issuedAt: z.string().optional().default(""),
  expiresAt: z.string().optional().default(""),
  isPrimary: z.boolean().optional().default(false),
});

export type IdentityDocumentValues = z.input<typeof documentSchema>;

export async function addIdentityDocument(values: IdentityDocumentValues): Promise<RegistryResult<{ id: string }>> {
  const user = await requireUser();
  if (!can(user.role, "patient.manage")) return { error: "Sem permissão." };
  const parsed = documentSchema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  const patient = await prisma.patient.findFirst({
    where: { id: parsed.data.patientId, clinicId: user.clinicId },
    select: { id: true },
  });
  if (!patient) return { error: "Paciente não encontrado." };

  const number = parsed.data.number.toUpperCase();
  const clash = await prisma.patientIdentityDocument.findFirst({
    where: { clinicId: user.clinicId, type: parsed.data.type, number },
    select: { id: true, patientId: true },
  });
  if (clash && clash.patientId !== patient.id) {
    return { error: "Este documento já está associado a outro paciente." };
  }
  if (clash) return { error: "Documento já registado para este paciente." };

  const toDate = (raw: string) => (raw ? new Date(`${raw}T00:00:00.000Z`) : null);
  const created = await prisma.$transaction(async (tx) => {
    if (parsed.data.isPrimary) {
      await tx.patientIdentityDocument.updateMany({ where: { patientId: patient.id }, data: { isPrimary: false } });
    }
    return tx.patientIdentityDocument.create({
      data: {
        clinicId: user.clinicId,
        patientId: patient.id,
        type: parsed.data.type,
        number,
        issuer: parsed.data.issuer || null,
        issuedAt: toDate(parsed.data.issuedAt),
        expiresAt: toDate(parsed.data.expiresAt),
        isPrimary: parsed.data.isPrimary,
      },
      select: { id: true, type: true, number: true },
    });
  });

  await auditAs(actor(user), {
    action: "patient.document.create",
    entity: "PatientIdentityDocument",
    entityId: created.id,
    after: { type: created.type, number: created.number },
    metadata: { patientId: patient.id },
  });
  revalidatePath(`/pacientes/${patient.id}`);
  return { ok: true, id: created.id };
}

export async function removeIdentityDocument(id: string): Promise<RegistryResult> {
  const user = await requireUser();
  if (!can(user.role, "patient.manage")) return { error: "Sem permissão." };
  const existing = await prisma.patientIdentityDocument.findFirst({
    where: { id, clinicId: user.clinicId },
    select: { id: true, patientId: true, type: true, number: true },
  });
  if (!existing) return { error: "Documento não encontrado." };

  await prisma.patientIdentityDocument.delete({ where: { id: existing.id } });
  await auditAs(actor(user), {
    action: "patient.document.delete",
    entity: "PatientIdentityDocument",
    entityId: existing.id,
    before: { type: existing.type, number: existing.number },
    metadata: { patientId: existing.patientId },
  });
  revalidatePath(`/pacientes/${existing.patientId}`);
  return { ok: true };
}

// ── Fusão de registos duplicados ─────────────────────────────────────────

/**
 * Funde `sourceId` em `targetId`: a actividade clínica e financeira passa para
 * o registo de destino e a origem é inactivada com uma referência — nunca
 * apagada. Operação administrativa, auditada, dentro de uma transacção.
 */
export async function mergePatients(sourceId: string, targetId: string, reason: string): Promise<RegistryResult> {
  const user = await requireUser();
  if (!ADMINISTRATIVE_ROLES.includes(user.role)) {
    return { error: "Apenas um administrador pode fundir registos de pacientes." };
  }
  if (sourceId === targetId) return { error: "Escolha dois pacientes diferentes." };
  if (!reason.trim()) return { error: "Indique o motivo da fusão." };

  const [source, target] = await Promise.all([
    prisma.patient.findFirst({ where: { id: sourceId, clinicId: user.clinicId }, select: { id: true, code: true, name: true, isActive: true, mergedIntoId: true } }),
    prisma.patient.findFirst({ where: { id: targetId, clinicId: user.clinicId }, select: { id: true, code: true, name: true, mergedIntoId: true } }),
  ]);
  if (!source || !target) return { error: "Paciente não encontrado." };
  if (source.mergedIntoId) return { error: "O registo de origem já foi fundido." };
  if (target.mergedIntoId) return { error: "O registo de destino já foi fundido noutro." };

  const scope = { clinicId: user.clinicId, patientId: source.id };
  const to = { patientId: target.id };

  await prisma.$transaction(async (tx) => {
    await tx.appointment.updateMany({ where: scope, data: to });
    await tx.consultation.updateMany({ where: scope, data: to });
    await tx.encounter.updateMany({ where: scope, data: to });
    await tx.vitalSign.updateMany({ where: scope, data: to });
    await tx.diagnosis.updateMany({ where: scope, data: to });
    await tx.allergy.updateMany({ where: scope, data: to });
    await tx.prescription.updateMany({ where: scope, data: to });
    await tx.diagnosticOrder.updateMany({ where: scope, data: to });
    await tx.clinicalProcedure.updateMany({ where: scope, data: to });
    await tx.treatment.updateMany({ where: scope, data: to });
    await tx.admission.updateMany({ where: scope, data: to });
    await tx.clinicalAttachment.updateMany({ where: scope, data: to });
    await tx.patientIdentityDocument.updateMany({ where: scope, data: to });
    await tx.invoice.updateMany({ where: scope, data: to });
    await tx.payment.updateMany({ where: scope, data: to });
    await tx.revenue.updateMany({ where: scope, data: to });
    await tx.patientHealthPlan.updateMany({ where: scope, data: to });
    await tx.patient.update({
      where: { id: source.id },
      data: { isActive: false, deactivatedAt: new Date(), mergedIntoId: target.id, version: { increment: 1 } },
    });
  });

  await auditAs(actor(user), {
    action: "patient.merge",
    entity: "Patient",
    entityId: source.id,
    before: { isActive: source.isActive, mergedIntoId: null },
    after: { isActive: false, mergedIntoId: target.id },
    metadata: { targetCode: target.code, sourceCode: source.code, reason: reason.trim().slice(0, 500) },
  });

  revalidatePath("/pacientes");
  revalidatePath(`/pacientes/${target.id}`);
  revalidatePath(`/pacientes/${source.id}`);
  return { ok: true };
}
