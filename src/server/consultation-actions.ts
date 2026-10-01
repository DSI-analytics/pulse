"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { ClinicalAddendumKind, DiagnosticCategory, DiagnosticPriority, RevenueSource } from "@prisma/client";
import { audit } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { calculateInvoiceTotal, splitInvoice } from "@/lib/domain/billing";
import { isImmutabilityError } from "@/lib/domain/clinical-immutability";
import { formatDiagnosisSummary, isValidIcdCode, normaliseIcdCode } from "@/lib/domain/icd";
import { formatSequence, nextSequenceValue, SEQUENCE_PREFIX, withNumberRetry } from "@/lib/sequences";
import { lookupIcdCode, rememberIcdCode } from "@/server/icd11";
import { getTranslator, getUiContext } from "@/i18n/server";
import type { Translator } from "@/i18n/translate";

// Stored as invoice/revenue descriptions (database data), so kept in Portuguese.
const APPOINTMENT_TYPE_LABEL = {
  CONSULTA: "Consulta médica",
  RETORNO: "Consulta de retorno",
  EXAME: "Exame",
  PROCEDIMENTO: "Procedimento",
} as const;

/**
 * Registo da consulta.
 *
 * Duas regras estruturam este ficheiro:
 *  - uma consulta concluída (`endedAt`) não volta a ser alterada — o que houver
 *    a acrescentar entra como adenda (`ClinicalAddendum`);
 *  - o diagnóstico não é texto livre: chega codificado em CID-11 e origina
 *    linhas `Diagnosis` (append-only). O campo `Consultation.diagnosis` passa a
 *    ser apenas um resumo desnormalizado, escrito enquanto a consulta está
 *    aberta.
 */
function consultationSchema(t: Translator) {
  const text = z.string().trim().max(10000, t("consultations.errors.textTooLong"));
  return z.object({
    subjective: text,
    notes: text,
    prescription: text,
    recommendations: text,
    followUpDate: z.string().trim().regex(/^(|\d{4}-\d{2}-\d{2})$/, t("consultations.errors.invalidFollowUp")),
    diagnoses: z
      .array(
        z.object({
          code: z.string().trim().min(1, t("clinical.icd.required")),
          title: z.string().trim().max(500).optional().default(""),
          uri: z.string().trim().max(400).optional().default(""),
          release: z.string().trim().max(32).optional().default(""),
          kind: z.enum(["PRINCIPAL", "SECUNDARIO", "DIFERENCIAL"]).optional().default("PRINCIPAL"),
          certainty: z.enum(["PROVISORIO", "CONFIRMADO"]).optional().default("PROVISORIO"),
        }),
      )
      .max(20)
      .optional()
      .default([]),
  });
}

/** Diagnóstico codificado na CID-11, tal como viaja do formulário. */
export interface ConsultationDiagnosisValue {
  code: string;
  title: string;
  uri?: string;
  release?: string;
  kind?: "PRINCIPAL" | "SECUNDARIO" | "DIFERENCIAL";
  certainty?: "PROVISORIO" | "CONFIRMADO";
}

export interface ConsultationValues {
  subjective: string;
  notes: string;
  prescription: string;
  recommendations: string;
  followUpDate: string;
  diagnoses: ConsultationDiagnosisValue[];
}

/** Adenda a mostrar junto do registo da consulta. */
export interface ConsultationAddendum {
  id: string;
  kind: ClinicalAddendumKind;
  body: string;
  authorName: string | null;
  createdAt: string;
}

export interface ConsultationChargeView {
  id: string;
  serviceId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface ConsultationBillableService {
  id: string;
  name: string;
  category: string;
  basePrice: number;
  source: RevenueSource;
}

export interface ConsultationDiagnosticService {
  id: string;
  name: string;
  category: string;
}

export interface ConsultationDiagnosticOrder {
  id: string;
  serviceId: string | null;
  number: string;
  name: string;
  priority: DiagnosticPriority;
  status: string;
}

export type ConsultationActionResult = { ok: true } | { error: string };
export type ConsultationEditorResult = {
  ok: true;
  patientName: string;
  doctorName: string;
  status: string;
  patientId: string;
  consultationId: string | null;
  /** Consulta concluída: só leitura, com adendas. */
  locked: boolean;
  values: ConsultationValues;
  addenda: ConsultationAddendum[];
  charges: ConsultationChargeView[];
  billableServices: ConsultationBillableService[];
  diagnosticServices: ConsultationDiagnosticService[];
  diagnosticOrders: ConsultationDiagnosticOrder[];
} | { error: string };

function nullable(value: string) {
  return value || null;
}

/** Idioma dos títulos da CID-11 neste pedido. */
async function consultationLanguage(): Promise<string> {
  try {
    return (await getUiContext()).locale;
  } catch {
    return "pt";
  }
}

async function clinicalAccess(appointmentId: string, t: Translator) {
  const user = await requireUser();
  if (!can(user.role, "consultation.conduct")) return { ok: false, error: t("consultations.errors.noPermission") } as const;
  const appointment = await prisma.appointment.findFirst({
    where: { id: appointmentId, clinicId: user.clinicId },
    select: {
      id: true, clinicId: true, patientId: true, doctorId: true, specialtyId: true, encounterId: true,
      healthPlanId: true, priceQuoted: true, startAt: true, endAt: true, status: true, type: true,
      patient: { select: { name: true } },
      doctor: { select: { name: true } },
      service: { select: { id: true, name: true, source: true } },
      healthPlan: { select: { patientCopay: true, patientCopayMode: true, patientCopayPercentBps: true, insuranceCompany: { select: { paymentTermDays: true } } } },
      invoice: { select: { id: true } },
      revenue: { select: { id: true } },
      charges: {
        orderBy: { createdAt: "asc" },
        select: { id: true, serviceId: true, description: true, quantity: true, unitPrice: true, total: true },
      },
    },
  });
  if (!appointment) return { ok: false, error: t("consultations.errors.notFound") } as const;
  if (user.role === "DOCTOR" && (!user.doctorId || appointment.doctorId !== user.doctorId)) {
    return { ok: false, error: t("consultations.errors.ownAgendaOnly") } as const;
  }
  if (["CANCELADA", "NAO_COMPARECEU"].includes(appointment.status)) {
    return { ok: false, error: t("consultations.errors.cancelled") } as const;
  }
  if (!["EM_CONSULTA", "CONCLUIDA"].includes(appointment.status)) {
    return { ok: false, error: t("consultations.errors.startFirst") } as const;
  }
  return { ok: true, user, appointment } as const;
}

export async function getConsultationEditor(appointmentId: string): Promise<ConsultationEditorResult> {
  const t = await getTranslator();
  const access = await clinicalAccess(appointmentId, t);
  if (!access.ok) return { error: access.error };
  const consultation = await prisma.consultation.findUnique({
    where: { appointmentId: access.appointment.id },
    select: {
      id: true,
      endedAt: true,
      subjective: true,
      notes: true,
      prescription: true,
      recommendations: true,
      followUpDate: true,
      diagnoses: {
        orderBy: { recordedAt: "asc" },
        select: { code: true, description: true, codeUri: true, codeRelease: true, kind: true, certainty: true },
      },
    },
  });

  const [addenda, billableServices, diagnosticOrders] = await Promise.all([
    consultation ? prisma.clinicalAddendum.findMany({
        where: { clinicId: access.user.clinicId, targetType: "CONSULTATION", targetId: consultation.id },
        orderBy: { createdAt: "asc" },
        select: { id: true, kind: true, body: true, createdAt: true, author: { select: { name: true } } },
      }) : Promise.resolve([]),
    prisma.service.findMany({
      where: { clinicId: access.user.clinicId, isActive: true, source: { in: ["EXAME", "PROCEDIMENTO", "OUTRO"] } },
      orderBy: [{ category: "asc" }, { name: "asc" }],
      select: { id: true, name: true, category: true, basePrice: true, source: true },
    }),
    consultation ? prisma.diagnosticOrder.findMany({
      where: { clinicId: access.user.clinicId, consultationId: consultation.id, status: { not: "CANCELADO" } },
      orderBy: { requestedAt: "asc" },
      select: { id: true, serviceId: true, number: true, name: true, priority: true, status: true },
    }) : Promise.resolve([]),
  ]);

  return {
    ok: true,
    patientName: access.appointment.patient.name,
    doctorName: access.appointment.doctor.name,
    status: access.appointment.status,
    patientId: access.appointment.patientId,
    consultationId: consultation?.id ?? null,
    locked: Boolean(consultation?.endedAt),
    values: {
      subjective: consultation?.subjective ?? "",
      notes: consultation?.notes ?? "",
      prescription: consultation?.prescription ?? "",
      recommendations: consultation?.recommendations ?? "",
      followUpDate: consultation?.followUpDate?.toISOString().slice(0, 10) ?? "",
      diagnoses: (consultation?.diagnoses ?? [])
        .filter((row) => Boolean(row.code))
        .map((row) => ({
          code: row.code!,
          title: row.description,
          uri: row.codeUri ?? undefined,
          release: row.codeRelease ?? undefined,
          kind: row.kind,
          certainty: row.certainty === "CONFIRMADO" ? ("CONFIRMADO" as const) : ("PROVISORIO" as const),
        })),
    },
    addenda: addenda.map((row) => ({
      id: row.id,
      kind: row.kind,
      body: row.body,
      authorName: row.author?.name ?? null,
      createdAt: row.createdAt.toISOString(),
    })),
    charges: access.appointment.charges,
    billableServices,
    diagnosticServices: billableServices
      .filter((service) => service.source === "EXAME")
      .map(({ id, name, category }) => ({ id, name, category })),
    diagnosticOrders,
  };
}

const chargeSchema = z.object({
  serviceId: z.string().min(1),
  quantity: z.number().int().min(1).max(99),
});

export async function addConsultationCharge(
  appointmentId: string,
  input: { serviceId: string; quantity: number },
): Promise<{ charge: ConsultationChargeView } | { error: string }> {
  const t = await getTranslator();
  const access = await clinicalAccess(appointmentId, t);
  if (!access.ok) return { error: access.error };
  if (access.appointment.status !== "EM_CONSULTA" || access.appointment.invoice) {
    return { error: t("consultations.charges.errors.locked") };
  }
  const parsed = chargeSchema.safeParse(input);
  if (!parsed.success) return { error: t("consultations.charges.errors.invalid") };
  const service = await prisma.service.findFirst({
    where: {
      id: parsed.data.serviceId,
      clinicId: access.user.clinicId,
      isActive: true,
      source: { in: ["EXAME", "PROCEDIMENTO", "OUTRO"] },
    },
    select: { id: true, name: true, basePrice: true },
  });
  if (!service) return { error: t("consultations.charges.errors.serviceNotFound") };

  try {
    const charge = await prisma.appointmentCharge.create({
      data: {
        clinicId: access.user.clinicId,
        appointmentId: access.appointment.id,
        serviceId: service.id,
        description: service.name,
        quantity: parsed.data.quantity,
        unitPrice: service.basePrice,
        total: service.basePrice * parsed.data.quantity,
        createdById: access.user.userId,
      },
      select: { id: true, serviceId: true, description: true, quantity: true, unitPrice: true, total: true },
    });
    await audit({
      clinicId: access.user.clinicId,
      userId: access.user.userId,
      action: "appointment.charge.add",
      entity: "AppointmentCharge",
      entityId: charge.id,
      metadata: { appointmentId: access.appointment.id, serviceId: service.id, quantity: charge.quantity, unitPrice: charge.unitPrice, total: charge.total },
    });
    revalidatePath("/agenda");
    return { charge };
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "P2002") {
      return { error: t("consultations.charges.errors.duplicate") };
    }
    throw error;
  }
}

export async function removeConsultationCharge(
  appointmentId: string,
  chargeId: string,
): Promise<{ ok: true } | { error: string }> {
  const t = await getTranslator();
  const access = await clinicalAccess(appointmentId, t);
  if (!access.ok) return { error: access.error };
  if (access.appointment.status !== "EM_CONSULTA" || access.appointment.invoice) {
    return { error: t("consultations.charges.errors.locked") };
  }
  const charge = await prisma.appointmentCharge.findFirst({
    where: { id: chargeId, appointmentId: access.appointment.id, clinicId: access.user.clinicId },
    select: { id: true, serviceId: true, quantity: true, unitPrice: true, total: true },
  });
  if (!charge) return { error: t("consultations.charges.errors.notFound") };
  await prisma.appointmentCharge.delete({ where: { id: charge.id } });
  await audit({
    clinicId: access.user.clinicId,
    userId: access.user.userId,
    action: "appointment.charge.remove",
    entity: "AppointmentCharge",
    entityId: charge.id,
    metadata: { appointmentId: access.appointment.id, serviceId: charge.serviceId, quantity: charge.quantity, unitPrice: charge.unitPrice, total: charge.total },
  });
  revalidatePath("/agenda");
  return { ok: true };
}

const diagnosticRequisitionSchema = z.object({
  serviceIds: z.array(z.string().min(1)).min(1).max(30),
  priority: z.enum(["ROTINA", "URGENTE", "EMERGENTE"]),
  notes: z.string().trim().max(2000),
});

function diagnosticCategory(category: string): DiagnosticCategory {
  const value = category.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/(imagem|imagiologia|radiologia|ecografia|ultrassom|raio|tomografia|ressonancia)/.test(value)) {
    return "IMAGIOLOGIA";
  }
  if (/(laboratorio|analise|hematologia|bioquimica|microbiologia)/.test(value)) {
    return "LABORATORIO";
  }
  return "OUTRO";
}

/** Cria uma requisição clínica; pedir o exame não o fatura nem o marca como realizado. */
export async function createConsultationDiagnosticRequisition(
  appointmentId: string,
  input: { serviceIds: string[]; priority: DiagnosticPriority; notes: string },
): Promise<{ orders: ConsultationDiagnosticOrder[] } | { error: string }> {
  const t = await getTranslator();
  const access = await clinicalAccess(appointmentId, t);
  if (!access.ok) return { error: access.error };
  const parsed = diagnosticRequisitionSchema.safeParse(input);
  if (!parsed.success) return { error: t("consultations.requisition.errors.invalid") };

  const consultation = await prisma.consultation.findUnique({
    where: { appointmentId: access.appointment.id },
    select: { id: true, encounterId: true },
  });
  if (!consultation) return { error: t("consultations.requisition.errors.startFirst") };

  const serviceIds = Array.from(new Set(parsed.data.serviceIds));
  const [services, existing] = await Promise.all([
    prisma.service.findMany({
      where: { id: { in: serviceIds }, clinicId: access.user.clinicId, isActive: true, source: "EXAME" },
      orderBy: [{ category: "asc" }, { name: "asc" }],
      select: { id: true, name: true, category: true },
    }),
    prisma.diagnosticOrder.findMany({
      where: {
        clinicId: access.user.clinicId,
        consultationId: consultation.id,
        serviceId: { in: serviceIds },
        status: { not: "CANCELADO" },
      },
      select: { serviceId: true },
    }),
  ]);
  if (services.length !== serviceIds.length) return { error: t("consultations.requisition.errors.serviceNotFound") };

  const existingIds = new Set(existing.map((order) => order.serviceId).filter(Boolean));
  const pending = services.filter((service) => !existingIds.has(service.id));
  if (!pending.length) return { error: t("consultations.requisition.errors.duplicate") };

  const now = new Date();
  const created = await withNumberRetry(async () => prisma.$transaction(async (tx) => {
    const year = now.getUTCFullYear();
    const issuedNumbers = await tx.diagnosticOrder.findMany({
      where: { clinicId: access.user.clinicId, number: { startsWith: `${SEQUENCE_PREFIX.diagnosticOrder}-${year}-` } },
      select: { number: true },
    });
    const firstSequence = nextSequenceValue("diagnosticOrder", year, issuedNumbers.map((order) => order.number));
    const orders: ConsultationDiagnosticOrder[] = [];
    for (const [index, service] of pending.entries()) {
      orders.push(await tx.diagnosticOrder.create({
        data: {
          clinicId: access.user.clinicId,
          patientId: access.appointment.patientId,
          encounterId: consultation.encounterId ?? access.appointment.encounterId,
          consultationId: consultation.id,
          serviceId: service.id,
          number: formatSequence("diagnosticOrder", year, firstSequence + index),
          category: diagnosticCategory(service.category),
          name: service.name,
          priority: parsed.data.priority,
          requestedAt: now,
          doctorId: access.appointment.doctorId,
          requestedById: access.user.userId,
          notes: nullable(parsed.data.notes),
        },
        select: { id: true, serviceId: true, number: true, name: true, priority: true, status: true },
      }));
    }
    return orders;
  }));

  await audit({
    clinicId: access.user.clinicId,
    userId: access.user.userId,
    action: "lab.requisition.create",
    entity: "Consultation",
    entityId: consultation.id,
    metadata: {
      appointmentId: access.appointment.id,
      orderIds: created.map((order) => order.id),
      serviceIds: created.map((order) => order.serviceId),
      priority: parsed.data.priority,
    },
  });
  revalidatePath("/agenda");
  revalidatePath("/consultas");
  revalidatePath(`/pacientes/${access.appointment.patientId}`);
  revalidatePath(`/consultas/${access.appointment.id}/requisicao-exames`);
  return { orders: created };
}

export async function saveConsultation(
  appointmentId: string,
  values: ConsultationValues,
  complete: boolean,
): Promise<ConsultationActionResult> {
  const t = await getTranslator();
  const access = await clinicalAccess(appointmentId, t);
  if (!access.ok) return { error: access.error };
  const parsed = consultationSchema(t).safeParse(values);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (complete && access.appointment.status === "CONCLUIDA") complete = false;
  if (complete && access.appointment.status !== "EM_CONSULTA") {
    return { error: t("consultations.errors.startBeforeComplete") };
  }

  // Consulta concluída é imutável: corrige-se com uma adenda, nunca reescrevendo.
  const existing = await prisma.consultation.findUnique({
    where: { appointmentId: access.appointment.id },
    select: { id: true, endedAt: true, diagnoses: { select: { code: true, description: true } } },
  });
  if (existing?.endedAt) return { error: t("clinical.immutable.consultationClosed") };

  // Os diagnósticos são validados contra a CID-11 da OMS — nunca aceites como
  // texto livre vindo do formulário.
  const language = await consultationLanguage();
  const recorded = new Set((existing?.diagnoses ?? []).map((row) => normaliseIcdCode(row.code ?? "")).filter(Boolean));
  const fresh: { code: string; title: string; uri: string | null; release: string; kind: "PRINCIPAL" | "SECUNDARIO" | "DIFERENCIAL"; certainty: "PROVISORIO" | "CONFIRMADO" }[] = [];

  for (const entry of parsed.data.diagnoses) {
    const code = normaliseIcdCode(entry.code);
    if (!isValidIcdCode(code)) return { error: t("clinical.icd.required") };
    if (recorded.has(code)) continue;
    const hit = await lookupIcdCode(code, language);
    if (!hit) return { error: t("clinical.errors.diagnosisCodeUnknown") };
    await rememberIcdCode(hit, language);
    recorded.add(hit.code);
    fresh.push({
      code: hit.code,
      title: hit.title,
      uri: hit.uri ?? (entry.uri || null),
      release: hit.release || entry.release || "",
      kind: entry.kind,
      certainty: entry.certainty,
    });
  }

  const summary = formatDiagnosisSummary([
    ...(existing?.diagnoses ?? []).map((row) => ({ code: row.code ?? "", title: row.description })),
    ...fresh.map((row) => ({ code: row.code, title: row.title })),
  ]);

  const followUpDate = parsed.data.followUpDate ? new Date(`${parsed.data.followUpDate}T00:00:00.000Z`) : null;
  const now = new Date();

  let saved: { id: string };
  try {
    saved = await prisma.$transaction(async (tx) => {
      const consultation = await tx.consultation.upsert({
        where: { appointmentId: access.appointment.id },
        create: {
          clinicId: access.user.clinicId,
          appointmentId: access.appointment.id,
          patientId: access.appointment.patientId,
          doctorId: access.appointment.doctorId,
          startedAt: now,
          endedAt: complete ? now : null,
          subjective: nullable(parsed.data.subjective),
          notes: nullable(parsed.data.notes),
          diagnosis: nullable(summary),
          prescription: nullable(parsed.data.prescription),
          recommendations: nullable(parsed.data.recommendations),
          followUpDate,
        },
        update: {
          endedAt: complete ? now : undefined,
          subjective: nullable(parsed.data.subjective),
          notes: nullable(parsed.data.notes),
          diagnosis: nullable(summary),
          prescription: nullable(parsed.data.prescription),
          recommendations: nullable(parsed.data.recommendations),
          followUpDate,
        },
        select: { id: true, encounterId: true },
      });

      // Diagnósticos: linhas novas, nunca reescritas.
      if (fresh.length) {
        await tx.diagnosis.createMany({
          data: fresh.map((row) => ({
            clinicId: access.user.clinicId,
            patientId: access.appointment.patientId,
            consultationId: consultation.id,
            encounterId: consultation.encounterId,
            kind: row.kind,
            certainty: row.certainty,
            code: row.code,
            codeSystem: "ICD-11",
            codeUri: row.uri,
            codeRelease: row.release || null,
            description: row.title,
            doctorId: access.appointment.doctorId,
            recordedById: access.user.userId,
          })),
        });
      }

      if (complete) {
        await tx.appointment.update({ where: { id: access.appointment.id }, data: { status: "CONCLUIDA" } });
        const invoiceTotal = calculateInvoiceTotal(access.appointment.priceQuoted, access.appointment.charges);
        if (!access.appointment.invoice) {
          const { patientDue, insurerDue } = splitInvoice(
            invoiceTotal,
            Boolean(access.appointment.healthPlanId),
            access.appointment.healthPlan?.patientCopay ?? 0,
            access.appointment.healthPlan?.patientCopayMode ?? "FIXED",
            access.appointment.healthPlan?.patientCopayPercentBps ?? 0,
          );
          const paymentTermDays = access.appointment.healthPlan?.insuranceCompany.paymentTermDays ?? 0;
          const dueAt = new Date(now.getTime() + paymentTermDays * 86400000);
          await tx.invoice.create({
            data: {
              clinicId: access.user.clinicId,
              number: `FAC-${now.getUTCFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`,
              patientId: access.appointment.patientId,
              appointmentId: access.appointment.id,
              healthPlanId: access.appointment.healthPlanId,
              status: "EMITIDA",
              subtotal: invoiceTotal,
              patientDue,
              insurerDue,
              total: invoiceTotal,
              amountPaid: 0,
              issuedAt: now,
              dueAt,
              items: {
                create: [
                  {
                    serviceId: access.appointment.service?.id ?? null,
                    description: access.appointment.service?.name ?? APPOINTMENT_TYPE_LABEL[access.appointment.type],
                    quantity: 1,
                    unitPrice: access.appointment.priceQuoted,
                    total: access.appointment.priceQuoted,
                  },
                  ...access.appointment.charges.map((charge) => ({
                    serviceId: charge.serviceId,
                    description: charge.description,
                    quantity: charge.quantity,
                    unitPrice: charge.unitPrice,
                    total: charge.total,
                  })),
                ],
              },
            },
          });
          if (access.appointment.charges.length) {
            await tx.clinicalProcedure.createMany({
              data: access.appointment.charges.map((charge) => ({
                clinicId: access.user.clinicId,
                patientId: access.appointment.patientId,
                encounterId: consultation.encounterId ?? access.appointment.encounterId,
                serviceId: charge.serviceId,
                name: charge.description,
                status: "REALIZADO" as const,
                performedAt: now,
                doctorId: access.appointment.doctorId,
                recordedById: access.user.userId,
              })),
            });
          }
        }
        if (!access.appointment.revenue) {
          await tx.revenue.create({
            data: {
              clinicId: access.user.clinicId,
              source: access.appointment.service?.source ?? (access.appointment.healthPlanId ? "SEGURADORA" : "CONSULTA"),
              description: access.appointment.service?.name ?? APPOINTMENT_TYPE_LABEL[access.appointment.type],
              amount: invoiceTotal,
              patientId: access.appointment.patientId,
              doctorId: access.appointment.doctorId,
              specialtyId: access.appointment.specialtyId,
              healthPlanId: access.appointment.healthPlanId,
              appointmentId: access.appointment.id,
              status: "PENDENTE",
            },
          });
        }
      }
      return consultation;
    });
  } catch (error) {
    // Rede de segurança: o gatilho de imutabilidade nunca chega ao utilizador
    // como erro cru da base de dados.
    if (isImmutabilityError(error)) return { error: t("clinical.immutable.blocked") };
    throw error;
  }

  await audit({
    clinicId: access.user.clinicId,
    userId: access.user.userId,
    action: complete ? "consultation.complete" : "consultation.update",
    entity: "Consultation",
    entityId: saved.id,
    metadata: { appointmentId: access.appointment.id, diagnoses: fresh.length },
  });
  revalidatePath("/agenda");
  revalidatePath("/consultas");
  revalidatePath("/financeiro");
  revalidatePath(`/pacientes/${access.appointment.patientId}`);
  revalidatePath("/");
  return { ok: true };
}
