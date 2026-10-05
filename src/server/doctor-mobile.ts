import "server-only";

import { randomUUID } from "node:crypto";
import { fromZonedTime } from "date-fns-tz";
import type { AppointmentStatus } from "@prisma/client";
import { audit } from "@/lib/audit";
import { CLINIC_TZ, clinicTodayIso, dayRange } from "@/lib/datetime";
import type { DoctorMobileContext } from "@/lib/doctor-mobile-auth";
import { calculateInvoiceTotal, splitInvoice } from "@/lib/domain/billing";
import { isImmutabilityError } from "@/lib/domain/clinical-immutability";
import { formatDiagnosisSummary, isValidIcdCode, normaliseIcdCode } from "@/lib/domain/icd";
import { prisma } from "@/lib/prisma";
import { lookupIcdCode, rememberIcdCode } from "@/server/icd11";

const ACTIVE = ["MARCADA", "CONFIRMADA", "CHEGOU", "EM_ESPERA", "EM_CONSULTA"] as const;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const APPOINTMENT_TYPE_LABEL = {
  CONSULTA: "Consulta médica",
  RETORNO: "Consulta de retorno",
  EXAME: "Exame",
  PROCEDIMENTO: "Procedimento",
} as const;

function notificationScope(context: DoctorMobileContext) {
  return { clinicId: context.clinicId, userId: context.userId };
}

export async function getDoctorMobileProfile(context: DoctorMobileContext) {
  return prisma.doctor.findFirst({
    where: { id: context.doctorId, clinicId: context.clinicId },
    select: {
      id: true, name: true, photoUrl: true, phone: true, email: true, licenseNumber: true,
      specialty: { select: { id: true, name: true } },
      clinic: { select: { id: true, name: true, timezone: true, phone: true, address: true, city: true } },
    },
  });
}

export async function getDoctorMobileDashboard(context: DoctorMobileContext) {
  const { start, end } = dayRange();
  const now = new Date();
  const [appointments, unread, recentNotifications, profile] = await Promise.all([
    prisma.appointment.findMany({
      where: { clinicId: context.clinicId, doctorId: context.doctorId, startAt: { gte: start, lte: end }, status: { not: "CANCELADA" } },
      orderBy: { startAt: "asc" },
      select: {
        id: true, startAt: true, endAt: true, type: true, status: true, reason: true,
        patient: { select: { id: true, code: true, name: true } },
        specialty: { select: { name: true } },
      },
    }),
    prisma.notification.count({ where: { ...notificationScope(context), isRead: false } }),
    prisma.notification.findMany({
      where: notificationScope(context), orderBy: { createdAt: "desc" }, take: 3,
      select: { id: true, type: true, severity: true, title: true, body: true, entity: true, entityId: true, isRead: true, createdAt: true },
    }),
    getDoctorMobileProfile(context),
  ]);
  const next = appointments.find((item) => item.startAt >= now && ACTIVE.includes(item.status as (typeof ACTIVE)[number])) ?? null;
  return {
    date: clinicTodayIso(),
    doctor: profile,
    summary: {
      total: appointments.length,
      waiting: appointments.filter((item) => item.status === "CHEGOU" || item.status === "EM_ESPERA").length,
      inConsultation: appointments.filter((item) => item.status === "EM_CONSULTA").length,
      completed: appointments.filter((item) => item.status === "CONCLUIDA").length,
      unreadNotifications: unread,
    },
    nextAppointment: next,
    appointments,
    notifications: recentNotifications,
  };
}

export async function getDoctorMobileAppointments(context: DoctorMobileContext, url: URL) {
  const today = clinicTodayIso();
  const from = url.searchParams.get("from") || today;
  const to = url.searchParams.get("to") || from;
  if (!DATE.test(from) || !DATE.test(to) || from > to) return { error: "Período inválido." } as const;
  const start = fromZonedTime(`${from}T00:00:00.000`, CLINIC_TZ);
  const end = fromZonedTime(`${to}T23:59:59.999`, CLINIC_TZ);
  if (end.getTime() - start.getTime() > 62 * 86400000) return { error: "O período máximo é de 62 dias." } as const;
  const status = url.searchParams.get("status");
  const allowedStatus: AppointmentStatus[] = ["MARCADA", "CONFIRMADA", "CHEGOU", "EM_ESPERA", "EM_CONSULTA", "CONCLUIDA", "NAO_COMPARECEU", "CANCELADA"];
  if (status && !allowedStatus.includes(status as AppointmentStatus)) return { error: "Estado inválido." } as const;
  const appointments = await prisma.appointment.findMany({
    where: {
      clinicId: context.clinicId, doctorId: context.doctorId, startAt: { gte: start, lte: end },
      ...(status ? { status: status as AppointmentStatus } : {}),
    },
    orderBy: { startAt: "asc" },
    select: {
      id: true, startAt: true, endAt: true, type: true, status: true, reason: true, notes: true, isPrivate: true,
      patient: { select: { id: true, code: true, name: true, phone: true } },
      specialty: { select: { id: true, name: true } },
      healthPlan: { select: { name: true, insuranceCompany: { select: { name: true } } } },
    },
  });
  return { from, to, appointments };
}

export async function getDoctorMobileAppointment(context: DoctorMobileContext, id: string) {
  return prisma.appointment.findFirst({
    where: { id, clinicId: context.clinicId, doctorId: context.doctorId },
    select: {
      id: true, startAt: true, endAt: true, type: true, status: true, reason: true, notes: true, checkedInAt: true,
      patient: {
        select: {
          id: true, code: true, name: true, birthDate: true, gender: true, phone: true, bloodType: true,
          chronicConditions: true, clinicalSummary: true,
          allergies: {
            where: { status: "ACTIVA" }, orderBy: { createdAt: "desc" },
            select: { id: true, substance: true, reaction: true, severity: true },
          },
          diagnoses: {
            where: { isActive: true }, orderBy: { recordedAt: "desc" }, take: 10,
            select: { id: true, code: true, codeSystem: true, description: true, kind: true, certainty: true, recordedAt: true },
          },
          vitalSigns: {
            orderBy: { recordedAt: "desc" }, take: 1,
            select: { recordedAt: true, systolic: true, diastolic: true, heartRate: true, temperature: true, oxygenSaturation: true, weightKg: true, heightCm: true, bmi: true, glucose: true },
          },
        },
      },
      specialty: { select: { id: true, name: true } },
      healthPlan: { select: { name: true, insuranceCompany: { select: { name: true } } } },
      consultation: {
        select: {
          id: true, startedAt: true, endedAt: true, subjective: true, notes: true,
          diagnosis: true, prescription: true, recommendations: true, followUpDate: true,
          diagnoses: {
            orderBy: { recordedAt: "asc" },
            select: { code: true, description: true, codeUri: true, codeRelease: true, kind: true, certainty: true },
          },
        },
      },
    },
  });
}

export async function startDoctorMobileAppointment(context: DoctorMobileContext, id: string) {
  const appointment = await prisma.appointment.findFirst({
    where: { id, clinicId: context.clinicId, doctorId: context.doctorId },
    select: { id: true, patientId: true, doctorId: true, status: true },
  });
  if (!appointment) return { error: "Marcação não encontrada." } as const;
  if (appointment.status === "EM_CONSULTA") return { ok: true } as const;
  if (!(["CHEGOU", "EM_ESPERA"] as string[]).includes(appointment.status)) {
    return { error: "O paciente deve fazer check-in antes de iniciar a consulta." } as const;
  }
  await prisma.$transaction(async (tx) => {
    await tx.appointment.update({ where: { id: appointment.id }, data: { status: "EM_CONSULTA" } });
    await tx.consultation.createMany({
      data: [{ clinicId: context.clinicId, appointmentId: appointment.id, patientId: appointment.patientId, doctorId: appointment.doctorId, startedAt: new Date() }],
      skipDuplicates: true,
    });
  });
  await audit({
    clinicId: context.clinicId, userId: context.userId, userName: context.name, userRole: context.role,
    sessionId: context.sessionId, action: "appointment.em_consulta", entity: "Appointment", entityId: appointment.id,
    metadata: { from: appointment.status, to: "EM_CONSULTA", channel: "doctor_mobile" },
  });
  return { ok: true } as const;
}

export interface DoctorMobileConsultationDraft {
  subjective?: string | null;
  notes?: string | null;
  prescription?: string | null;
  recommendations?: string | null;
  followUpDate?: string | null;
  diagnoses?: DoctorMobileDiagnosisDraft[];
}

export interface DoctorMobileDiagnosisDraft {
  code: string;
  title?: string;
  uri?: string;
  release?: string;
  kind?: "PRINCIPAL" | "SECUNDARIO" | "DIFERENCIAL";
  certainty?: "PROVISORIO" | "CONFIRMADO";
}

export async function saveDoctorMobileConsultation(
  context: DoctorMobileContext,
  appointmentId: string,
  draft: DoctorMobileConsultationDraft,
  complete = false,
) {
  const appointment = await prisma.appointment.findFirst({
    where: { id: appointmentId, clinicId: context.clinicId, doctorId: context.doctorId },
    select: {
      id: true, patientId: true, doctorId: true, specialtyId: true, encounterId: true,
      healthPlanId: true, priceQuoted: true, type: true, status: true,
      service: { select: { id: true, name: true, source: true } },
      healthPlan: {
        select: {
          patientCopay: true, patientCopayMode: true, patientCopayPercentBps: true,
          insuranceCompany: { select: { paymentTermDays: true } },
        },
      },
      invoice: { select: { id: true } },
      revenue: { select: { id: true } },
      charges: {
        orderBy: { createdAt: "asc" },
        select: { serviceId: true, description: true, quantity: true, unitPrice: true, total: true },
      },
      consultation: {
        select: {
          id: true, encounterId: true, endedAt: true,
          diagnoses: { select: { code: true, description: true } },
        },
      },
    },
  });
  if (!appointment) return { error: "Marcação não encontrada." } as const;
  if (complete && appointment.status === "CONCLUIDA") return { ok: true } as const;
  if (appointment.status !== "EM_CONSULTA" || !appointment.consultation) {
    return { error: "Inicie a consulta antes de guardar o registo clínico." } as const;
  }
  if (appointment.consultation.endedAt) {
    return { error: "A consulta já foi concluída e o registo clínico está bloqueado." } as const;
  }

  const clean = (value: string | null | undefined) => {
    const normalized = value?.trim();
    return normalized ? normalized : null;
  };
  const followUpDate = draft.followUpDate
    ? fromZonedTime(`${draft.followUpDate}T00:00:00.000`, CLINIC_TZ)
    : null;
  const recorded = new Set(
    appointment.consultation.diagnoses
      .map((row) => normaliseIcdCode(row.code ?? ""))
      .filter(Boolean),
  );
  const fresh: Array<{
    code: string;
    title: string;
    uri: string | null;
    release: string;
    kind: "PRINCIPAL" | "SECUNDARIO" | "DIFERENCIAL";
    certainty: "PROVISORIO" | "CONFIRMADO";
  }> = [];
  for (const entry of draft.diagnoses ?? []) {
    const code = normaliseIcdCode(entry.code);
    if (!isValidIcdCode(code)) return { error: "Selecione um diagnóstico CID-11 válido." } as const;
    if (recorded.has(code)) continue;
    const hit = await lookupIcdCode(code, "pt");
    if (!hit) return { error: `O código CID-11 ${code} não foi confirmado no catálogo.` } as const;
    await rememberIcdCode(hit, "pt");
    recorded.add(hit.code);
    fresh.push({
      code: hit.code,
      title: hit.title,
      uri: hit.uri ?? entry.uri ?? null,
      release: hit.release || entry.release || "",
      kind: entry.kind ?? "PRINCIPAL",
      certainty: entry.certainty ?? "PROVISORIO",
    });
  }
  const diagnosis = formatDiagnosisSummary([
    ...appointment.consultation.diagnoses.map((row) => ({ code: row.code ?? "", title: row.description })),
    ...fresh.map((row) => ({ code: row.code, title: row.title })),
  ]);
  const now = new Date();
  const data = {
    subjective: clean(draft.subjective),
    notes: clean(draft.notes),
    diagnosis: diagnosis || null,
    prescription: clean(draft.prescription),
    recommendations: clean(draft.recommendations),
    followUpDate,
    ...(complete ? { endedAt: now } : {}),
    version: { increment: 1 },
  };
  try {
    await prisma.$transaction(async (tx) => {
      await tx.consultation.update({ where: { id: appointment.consultation!.id }, data });
      if (fresh.length) {
        await tx.diagnosis.createMany({
          data: fresh.map((row) => ({
            clinicId: context.clinicId,
            patientId: appointment.patientId,
            consultationId: appointment.consultation!.id,
            encounterId: appointment.consultation!.encounterId,
            kind: row.kind,
            certainty: row.certainty,
            code: row.code,
            codeSystem: "ICD-11",
            codeUri: row.uri,
            codeRelease: row.release || null,
            description: row.title,
            doctorId: appointment.doctorId,
            recordedById: context.userId,
          })),
        });
      }
      if (!complete) return;

      await tx.appointment.update({ where: { id: appointment.id }, data: { status: "CONCLUIDA" } });
      const invoiceTotal = calculateInvoiceTotal(appointment.priceQuoted, appointment.charges);
      if (!appointment.invoice) {
        const { patientDue, insurerDue } = splitInvoice(
          invoiceTotal,
          Boolean(appointment.healthPlanId),
          appointment.healthPlan?.patientCopay ?? 0,
          appointment.healthPlan?.patientCopayMode ?? "FIXED",
          appointment.healthPlan?.patientCopayPercentBps ?? 0,
        );
        const dueAt = new Date(now.getTime() + (appointment.healthPlan?.insuranceCompany.paymentTermDays ?? 0) * 86400000);
        await tx.invoice.create({
          data: {
            clinicId: context.clinicId,
            number: `FAC-${now.getUTCFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`,
            patientId: appointment.patientId,
            appointmentId: appointment.id,
            healthPlanId: appointment.healthPlanId,
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
                  serviceId: appointment.service?.id ?? null,
                  description: appointment.service?.name ?? APPOINTMENT_TYPE_LABEL[appointment.type],
                  quantity: 1,
                  unitPrice: appointment.priceQuoted,
                  total: appointment.priceQuoted,
                },
                ...appointment.charges.map((charge) => ({
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
        if (appointment.charges.length) {
          await tx.clinicalProcedure.createMany({
            data: appointment.charges.map((charge) => ({
              clinicId: context.clinicId,
              patientId: appointment.patientId,
              encounterId: appointment.consultation!.encounterId ?? appointment.encounterId,
              serviceId: charge.serviceId,
              name: charge.description,
              status: "REALIZADO" as const,
              performedAt: now,
              doctorId: appointment.doctorId,
              recordedById: context.userId,
            })),
          });
        }
      }
      if (!appointment.revenue) {
        await tx.revenue.create({
          data: {
            clinicId: context.clinicId,
            source: appointment.service?.source ?? (appointment.healthPlanId ? "SEGURADORA" : "CONSULTA"),
            description: appointment.service?.name ?? APPOINTMENT_TYPE_LABEL[appointment.type],
            amount: invoiceTotal,
            patientId: appointment.patientId,
            doctorId: appointment.doctorId,
            specialtyId: appointment.specialtyId,
            healthPlanId: appointment.healthPlanId,
            appointmentId: appointment.id,
            status: "PENDENTE",
          },
        });
      }
    });
  } catch (error) {
    if (isImmutabilityError(error)) {
      return { error: "O registo clínico foi bloqueado porque a consulta já está concluída." } as const;
    }
    throw error;
  }
  await audit({
    clinicId: context.clinicId,
    userId: context.userId,
    userName: context.name,
    userRole: context.role,
    sessionId: context.sessionId,
    action: complete ? "consultation.mobile.complete" : "consultation.mobile.draft_saved",
    entity: "Consultation",
    entityId: appointment.consultation.id,
    metadata: { appointmentId, changedFields: Object.keys(data), diagnoses: fresh.length, channel: "doctor_mobile" },
  });
  return { ok: true } as const;
}

export async function getDoctorMobileNotifications(context: DoctorMobileContext, unreadOnly: boolean) {
  const where = notificationScope(context);
  const [notifications, unread] = await Promise.all([
    prisma.notification.findMany({
      where: { ...where, ...(unreadOnly ? { isRead: false } : {}) }, orderBy: { createdAt: "desc" }, take: 50,
      select: { id: true, type: true, severity: true, title: true, body: true, entity: true, entityId: true, isRead: true, createdAt: true },
    }),
    prisma.notification.count({ where: { ...where, isRead: false } }),
  ]);
  return { unread, notifications };
}

export async function markDoctorMobileNotificationsRead(context: DoctorMobileContext, ids?: string[]) {
  await prisma.notification.updateMany({
    where: { ...notificationScope(context), isRead: false, ...(ids?.length ? { id: { in: ids } } : {}) },
    data: { isRead: true },
  });
  return { ok: true };
}
