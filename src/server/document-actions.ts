"use server";

import { revalidatePath } from "next/cache";
import { auditAs } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { removeStoredFile, storeUpload } from "@/lib/documents";
import { isImmutabilityError } from "@/lib/domain/clinical-immutability";
import { getTranslator } from "@/i18n/server";

export type DocumentActionResult = { ok: true; id: string } | { error: string };

const CATEGORIES = ["EXAME", "RECEITA", "RELATORIO", "CONSENTIMENTO", "IDENTIFICACAO", "IMAGEM", "OUTRO"] as const;
type Category = (typeof CATEGORIES)[number];

function text(value: FormDataEntryValue | null, max = 500): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, max);
  return trimmed.length ? trimmed : null;
}

/**
 * Anexa um documento a um paciente e, opcionalmente, a um episódio, consulta,
 * pedido de exame, internamento ou procedimento.
 *
 * O alvo é sempre revalidado contra a clínica da sessão e contra o paciente,
 * de modo que um id manipulado no formulário não permite anexar a registos de
 * outra instituição.
 */
export async function uploadClinicalDocument(formData: FormData): Promise<DocumentActionResult> {
  const user = await requireUser();
  const t = await getTranslator();
  if (!can(user.role, "document.manage")) return { error: t("clinical.documents.noPermissionUpload") };

  const patientId = text(formData.get("patientId"), 40);
  if (!patientId) return { error: t("clinical.errors.patientRequired") };

  const patient = await prisma.patient.findFirst({
    where: { id: patientId, clinicId: user.clinicId },
    select: { id: true },
  });
  if (!patient) return { error: t("clinical.errors.patientNotFound") };

  const encounterId = text(formData.get("encounterId"), 40);
  const consultationId = text(formData.get("consultationId"), 40);
  const diagnosticOrderId = text(formData.get("diagnosticOrderId"), 40);
  const admissionId = text(formData.get("admissionId"), 40);
  const procedureId = text(formData.get("procedureId"), 40);

  const scope = { clinicId: user.clinicId, patientId: patient.id };
  const checks: [string | null, () => Promise<unknown>, string][] = [
    [encounterId, () => prisma.encounter.findFirst({ where: { id: encounterId!, ...scope }, select: { id: true } }), t("clinical.documents.invalidEncounter")],
    [consultationId, () => prisma.consultation.findFirst({ where: { id: consultationId!, ...scope }, select: { id: true } }), t("clinical.documents.invalidConsultation")],
    [diagnosticOrderId, () => prisma.diagnosticOrder.findFirst({ where: { id: diagnosticOrderId!, ...scope }, select: { id: true } }), t("clinical.documents.invalidOrder")],
    [admissionId, () => prisma.admission.findFirst({ where: { id: admissionId!, ...scope }, select: { id: true } }), t("clinical.documents.invalidAdmission")],
    [procedureId, () => prisma.clinicalProcedure.findFirst({ where: { id: procedureId!, ...scope }, select: { id: true } }), t("clinical.documents.invalidProcedure")],
  ];
  for (const [value, check, message] of checks) {
    if (!value) continue;
    if (!(await check())) return { error: message };
  }

  const file = formData.get("file");
  if (!(file instanceof File)) return { error: t("clinical.documents.selectFile") };

  const stored = await storeUpload(user.clinicId, file);
  if ("error" in stored) return stored;

  const rawCategory = text(formData.get("category"), 30) ?? "OUTRO";
  const category: Category = (CATEGORIES as readonly string[]).includes(rawCategory) ? (rawCategory as Category) : "OUTRO";
  const documentDateRaw = text(formData.get("documentDate"), 40);
  const documentDate = documentDateRaw ? new Date(`${documentDateRaw}T00:00:00.000Z`) : null;

  try {
    const created = await prisma.clinicalAttachment.create({
      data: {
        clinicId: user.clinicId,
        patientId: patient.id,
        encounterId,
        consultationId,
        diagnosticOrderId,
        admissionId,
        procedureId,
        name: text(formData.get("name"), 160) ?? stored.safeName,
        description: text(formData.get("description"), 1000),
        category,
        mimeType: stored.mimeType,
        sizeBytes: stored.sizeBytes,
        storageKey: stored.storageKey,
        checksum: stored.checksum,
        authorName: text(formData.get("authorName"), 160) ?? user.name,
        documentDate: documentDate && !Number.isNaN(documentDate.getTime()) ? documentDate : null,
        uploadedById: user.userId,
      },
      select: { id: true, name: true, category: true, mimeType: true, sizeBytes: true },
    });

    await auditAs(
      { userId: user.userId, clinicId: user.clinicId, name: user.name, role: user.role, sessionId: user.sessionId ?? null },
      {
        action: "attachment.create",
        entity: "ClinicalAttachment",
        entityId: created.id,
        after: created as unknown as Record<string, unknown>,
        metadata: { patientId: patient.id },
      },
    );

    revalidatePath(`/pacientes/${patient.id}`);
    return { ok: true, id: created.id };
  } catch (error) {
    // Não deixar ficheiros órfãos quando a escrita na base falha.
    await removeStoredFile(stored.storageKey);
    throw error;
  }
}

/**
 * Retirada de um documento da vista clínica.
 *
 * Não é uma eliminação: o ficheiro e o registo permanecem (só `deletedAt` pode
 * mudar) e a retirada exige um motivo, que fica como adenda de anulação
 * associada ao anexo — o prontuário conta sempre o que aconteceu.
 */
export async function removeClinicalDocument(id: string, reason: string): Promise<DocumentActionResult> {
  const user = await requireUser();
  const t = await getTranslator();
  if (!can(user.role, "document.manage")) return { error: t("clinical.documents.noPermissionRemove") };

  const motive = (reason ?? "").trim().slice(0, 4000);
  if (motive.length < 3) return { error: t("clinical.documents.removeReason") };

  const existing = await prisma.clinicalAttachment.findFirst({
    where: { id, clinicId: user.clinicId, deletedAt: null },
    select: { id: true, patientId: true, name: true, category: true, encounterId: true },
  });
  if (!existing) return { error: t("clinical.documents.notFound") };

  try {
    await prisma.$transaction(async (tx) => {
      await tx.clinicalAttachment.update({ where: { id: existing.id }, data: { deletedAt: new Date() } });
      // Um anexo sem paciente (raro, legado) não pode gerar adenda: a adenda
      // pertence sempre ao prontuário de alguém.
      if (existing.patientId) {
        await tx.clinicalAddendum.create({
          data: {
            clinicId: user.clinicId,
            patientId: existing.patientId,
            targetType: "ATTACHMENT",
            targetId: existing.id,
            kind: "ANULACAO",
            body: motive,
            encounterId: existing.encounterId,
            authorId: user.userId,
          },
        });
      }
    });
  } catch (error) {
    if (isImmutabilityError(error)) return { error: t("clinical.immutable.blocked") };
    throw error;
  }

  await auditAs(
    { userId: user.userId, clinicId: user.clinicId, name: user.name, role: user.role, sessionId: user.sessionId ?? null },
    {
      action: "attachment.delete",
      entity: "ClinicalAttachment",
      entityId: existing.id,
      before: { deletedAt: null, name: existing.name },
      after: { deletedAt: new Date().toISOString() },
      metadata: { reason: motive.slice(0, 500), patientId: existing.patientId },
    },
  );

  if (existing.patientId) revalidatePath(`/pacientes/${existing.patientId}`);
  return { ok: true, id: existing.id };
}
