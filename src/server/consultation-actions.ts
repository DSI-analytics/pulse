"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { splitInvoice } from "@/lib/domain/billing";

const APPOINTMENT_TYPE_LABEL = {
  CONSULTA: "Consulta médica",
  RETORNO: "Consulta de retorno",
  EXAME: "Exame",
  PROCEDIMENTO: "Procedimento",
} as const;

const text = z.string().trim().max(10000, "O texto não pode exceder 10.000 caracteres.");
const consultationSchema = z.object({
  subjective: text,
  notes: text,
  diagnosis: text,
  prescription: text,
  recommendations: text,
  followUpDate: z.string().trim().regex(/^(|\d{4}-\d{2}-\d{2})$/, "Data de retorno inválida."),
});

export type ConsultationValues = z.input<typeof consultationSchema>;
export type ConsultationActionResult = { ok: true } | { error: string };
export type ConsultationEditorResult = {
  ok: true;
  patientName: string;
  doctorName: string;
  status: string;
  values: ConsultationValues;
} | { error: string };

function nullable(value: string) {
  return value || null;
}

async function clinicalAccess(appointmentId: string) {
  const user = await requireUser();
  if (!can(user.role, "consultation.conduct")) return { ok: false, error: "Sem permissão para registar consultas clínicas." } as const;
  const appointment = await prisma.appointment.findFirst({
    where: { id: appointmentId, clinicId: user.clinicId },
    select: {
      id: true, clinicId: true, patientId: true, doctorId: true, specialtyId: true,
      healthPlanId: true, priceQuoted: true, startAt: true, endAt: true, status: true, type: true,
      patient: { select: { name: true } },
      doctor: { select: { name: true } },
      service: { select: { id: true, name: true, source: true } },
      healthPlan: { select: { patientCopay: true, insuranceCompany: { select: { paymentTermDays: true } } } },
      invoice: { select: { id: true } },
      revenue: { select: { id: true } },
    },
  });
  if (!appointment) return { ok: false, error: "Consulta não encontrada." } as const;
  if (user.role === "DOCTOR" && (!user.doctorId || appointment.doctorId !== user.doctorId)) {
    return { ok: false, error: "Só pode editar consultas da sua própria agenda." } as const;
  }
  if (["CANCELADA", "NAO_COMPARECEU"].includes(appointment.status)) {
    return { ok: false, error: "Não é possível editar uma consulta cancelada ou marcada como falta." } as const;
  }
  if (!["EM_CONSULTA", "CONCLUIDA"].includes(appointment.status)) {
    return { ok: false, error: "Inicie a consulta antes de abrir o registo clínico." } as const;
  }
  return { ok: true, user, appointment } as const;
}

export async function getConsultationEditor(appointmentId: string): Promise<ConsultationEditorResult> {
  const access = await clinicalAccess(appointmentId);
  if (!access.ok) return { error: access.error };
  const consultation = await prisma.consultation.findUnique({
    where: { appointmentId: access.appointment.id },
    select: { subjective: true, notes: true, diagnosis: true, prescription: true, recommendations: true, followUpDate: true },
  });
  return {
    ok: true,
    patientName: access.appointment.patient.name,
    doctorName: access.appointment.doctor.name,
    status: access.appointment.status,
    values: {
      subjective: consultation?.subjective ?? "",
      notes: consultation?.notes ?? "",
      diagnosis: consultation?.diagnosis ?? "",
      prescription: consultation?.prescription ?? "",
      recommendations: consultation?.recommendations ?? "",
      followUpDate: consultation?.followUpDate?.toISOString().slice(0, 10) ?? "",
    },
  };
}

export async function saveConsultation(
  appointmentId: string,
  values: ConsultationValues,
  complete: boolean,
): Promise<ConsultationActionResult> {
  const access = await clinicalAccess(appointmentId);
  if (!access.ok) return { error: access.error };
  const parsed = consultationSchema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (complete && access.appointment.status === "CONCLUIDA") complete = false;
  if (complete && access.appointment.status !== "EM_CONSULTA") {
    return { error: "Inicie a consulta antes de a concluir." };
  }

  const followUpDate = parsed.data.followUpDate ? new Date(`${parsed.data.followUpDate}T00:00:00.000Z`) : null;
  const now = new Date();

  const saved = await prisma.$transaction(async (tx) => {
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
        diagnosis: nullable(parsed.data.diagnosis),
        prescription: nullable(parsed.data.prescription),
        recommendations: nullable(parsed.data.recommendations),
        followUpDate,
      },
      update: {
        endedAt: complete ? now : undefined,
        subjective: nullable(parsed.data.subjective),
        notes: nullable(parsed.data.notes),
        diagnosis: nullable(parsed.data.diagnosis),
        prescription: nullable(parsed.data.prescription),
        recommendations: nullable(parsed.data.recommendations),
        followUpDate,
      },
      select: { id: true },
    });

    if (complete) {
      await tx.appointment.update({ where: { id: access.appointment.id }, data: { status: "CONCLUIDA" } });
      if (!access.appointment.invoice) {
        const { patientDue, insurerDue } = splitInvoice(
          access.appointment.priceQuoted,
          Boolean(access.appointment.healthPlanId),
          access.appointment.healthPlan?.patientCopay ?? 0,
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
            subtotal: access.appointment.priceQuoted,
            patientDue,
            insurerDue,
            total: access.appointment.priceQuoted,
            amountPaid: 0,
            issuedAt: now,
            dueAt,
            items: {
              create: {
                serviceId: access.appointment.service?.id ?? null,
                description: access.appointment.service?.name ?? APPOINTMENT_TYPE_LABEL[access.appointment.type],
                quantity: 1,
                unitPrice: access.appointment.priceQuoted,
                total: access.appointment.priceQuoted,
              },
            },
          },
        });
      }
      if (!access.appointment.revenue) {
        await tx.revenue.create({
          data: {
            clinicId: access.user.clinicId,
            source: access.appointment.service?.source ?? (access.appointment.healthPlanId ? "SEGURADORA" : "CONSULTA"),
            description: access.appointment.service?.name ?? APPOINTMENT_TYPE_LABEL[access.appointment.type],
            amount: access.appointment.priceQuoted,
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

  await audit({
    clinicId: access.user.clinicId,
    userId: access.user.userId,
    action: complete ? "consultation.complete" : "consultation.update",
    entity: "Consultation",
    entityId: saved.id,
    metadata: { appointmentId: access.appointment.id },
  });
  revalidatePath("/agenda");
  revalidatePath("/consultas");
  revalidatePath("/financeiro");
  revalidatePath(`/pacientes/${access.appointment.patientId}`);
  revalidatePath("/");
  return { ok: true };
}
