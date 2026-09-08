"use server";

import { audit } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import {
  getPatientTimeline,
  TIMELINE_TYPES,
  type TimelineEventType,
  type TimelinePage,
} from "@/server/clinical-record";

export interface TimelineQuery {
  patientId: string;
  types?: string[];
  from?: string;
  to?: string;
  specialtyId?: string;
  doctorId?: string;
  before?: string;
  limit?: number;
}

export type TimelineResult = ({ ok: true } & TimelinePage) | { error: string };

/**
 * Carregamento incremental da linha temporal (usado pelo botão "carregar
 * mais"). A permissão e a clínica são revalidadas a cada pedido: o cursor
 * enviado pelo cliente só controla a paginação, nunca o âmbito dos dados.
 */
export async function loadPatientTimeline(query: TimelineQuery): Promise<TimelineResult> {
  const user = await requireUser();
  if (!can(user.role, "consultation.viewClinical")) return { error: "Sem permissão para ver o prontuário." };

  const patient = await prisma.patient.findFirst({
    where: { id: query.patientId, clinicId: user.clinicId },
    select: { id: true },
  });
  if (!patient) return { error: "Paciente não encontrado." };

  const types = (query.types ?? []).filter((t): t is TimelineEventType =>
    (TIMELINE_TYPES as readonly string[]).includes(t),
  );
  const toDate = (value?: string) => {
    if (!value) return null;
    const date = new Date(value.length === 10 ? `${value}T00:00:00.000Z` : value);
    return Number.isNaN(date.getTime()) ? null : date;
  };

  // Especialidade e médico têm de pertencer à clínica da sessão.
  let specialtyId: string | null = null;
  if (query.specialtyId) {
    const found = await prisma.specialty.findFirst({ where: { id: query.specialtyId, clinicId: user.clinicId }, select: { id: true } });
    specialtyId = found?.id ?? null;
  }
  let doctorId: string | null = null;
  if (query.doctorId) {
    const found = await prisma.doctor.findFirst({ where: { id: query.doctorId, clinicId: user.clinicId }, select: { id: true } });
    doctorId = found?.id ?? null;
  }

  const page = await getPatientTimeline(user.clinicId, patient.id, {
    types,
    from: toDate(query.from),
    to: toDate(query.to),
    specialtyId,
    doctorId,
    before: toDate(query.before),
    limit: query.limit,
  });

  await audit({
    clinicId: user.clinicId,
    userId: user.userId,
    userName: user.name,
    userRole: user.role,
    sessionId: user.sessionId ?? null,
    action: "patient.timeline.view",
    entity: "Patient",
    entityId: patient.id,
    metadata: { events: page.events.length, filtered: types.length > 0 },
  });

  return { ok: true, ...page };
}
