"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { getTranslator } from "@/i18n/server";
import type { AppointmentStatus } from "@prisma/client";

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
    },
  });
  if (!appt) return { error: t("agenda.statusErrors.notFound") };
  if (user.role === "DOCTOR" && (!user.doctorId || appt.doctorId !== user.doctorId)) {
    return { error: t("agenda.statusErrors.ownAgendaOnly") };
  }
  // Permission: operational transitions and clinical transitions are separate.
  if (status === "CHEGOU") {
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

  revalidatePath("/agenda");
  revalidatePath("/");
  revalidatePath("/consultas");
  return { ok: true };
}
