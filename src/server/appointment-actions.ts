"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { getTranslator } from "@/i18n/server";
import type { AppointmentStatus } from "@prisma/client";
import { formatInTimeZone } from "date-fns-tz";
import { CLINIC_TZ } from "@/lib/datetime";
import { notifyDoctor } from "@/server/doctor-push-notifications";

export async function setAppointmentStatus(id: string, status: AppointmentStatus, cancelReason?: string) {
  const user = await requireUser();
  const t = await getTranslator();

  const appt = await prisma.appointment.findFirst({
    where: { id, clinicId: user.clinicId },
    select: {
      id: true,
      status: true,
      doctorId: true,
      patientId: true,
      startAt: true,
      patient: { select: { name: true } },
    },
  });
  if (!appt) return { error: t("agenda.statusErrors.notFound") };
  if (user.role === "DOCTOR" && (!user.doctorId || appt.doctorId !== user.doctorId)) {
    return { error: t("agenda.statusErrors.ownAgendaOnly") };
  }
  // Permission: operational transitions and clinical transitions are separate.
  if (status === "CHEGOU" && appt.status !== "CHEGOU") {
    if (!can(user.role, "appointment.checkin") && !can(user.role, "appointment.manage"))
      return { error: t("agenda.statusErrors.noPermission") };
  } else if (status === "EM_CONSULTA" || status === "CONCLUIDA") {
    if (!can(user.role, "consultation.conduct")) return { error: t("agenda.statusErrors.noClinicalPermission") };
    if (status === "CONCLUIDA") return { error: t("agenda.statusErrors.completeViaEditor") };
  } else if (!can(user.role, "appointment.manage")) {
    return { error: t("agenda.statusErrors.noPermission") };
  }

  await prisma.$transaction(async (tx) => {
    await tx.appointment.update({
      where: { id: appt.id },
      data: {
        status,
        checkedInAt: status === "CHEGOU" ? new Date() : undefined,
        cancelReason: status === "CANCELADA" ? cancelReason ?? null : undefined,
      },
    });

    if (status === "EM_CONSULTA") {
      // O registo clínico é imutável. Se já existir (por exemplo, após um
      // segundo clique ou uma retoma), preservamo-lo em vez de executar o ramo
      // UPDATE de um upsert e reescrever `startedAt`.
      await tx.consultation.createMany({
        data: [{
          clinicId: user.clinicId,
          appointmentId: appt.id,
          patientId: appt.patientId,
          doctorId: appt.doctorId,
          startedAt: new Date(),
        }],
        skipDuplicates: true,
      });
    }
  });

  await audit({
    clinicId: user.clinicId,
    userId: user.userId,
    action: `appointment.${status.toLowerCase()}`,
    entity: "Appointment",
    entityId: appt.id,
    metadata: { from: appt.status, to: status },
  });

  if (status === "CHEGOU") {
    await notifyDoctor({
      doctorId: appt.doctorId,
      clinicId: user.clinicId,
      category: "checkIns",
      type: "MARCACAO",
      title: "Paciente fez check-in",
      body: `${appt.patient.name} chegou para a consulta das ${formatInTimeZone(appt.startAt, CLINIC_TZ, "HH:mm")}.`,
      entity: "Appointment",
      entityId: appt.id,
    });
  } else if (status === "CANCELADA" && appt.status !== "CANCELADA") {
    await notifyDoctor({
      doctorId: appt.doctorId,
      clinicId: user.clinicId,
      category: "cancellations",
      type: "CANCELAMENTO",
      severity: "AVISO",
      title: "Consulta cancelada",
      body: `${appt.patient.name} · ${formatInTimeZone(appt.startAt, CLINIC_TZ, "dd/MM/yyyy 'às' HH:mm")}`,
      entity: "Appointment",
      entityId: appt.id,
    });
  }

  revalidatePath("/agenda");
  revalidatePath("/");
  revalidatePath("/consultas");
  return { ok: true };
}
