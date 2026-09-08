"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import type { AppointmentStatus } from "@prisma/client";

export async function setAppointmentStatus(id: string, status: AppointmentStatus, cancelReason?: string) {
  const user = await requireUser();

  const appt = await prisma.appointment.findFirst({
    where: { id, clinicId: user.clinicId },
    select: {
      id: true,
      status: true,
      doctorId: true,
      patientId: true,
    },
  });
  if (!appt) return { error: "Marcação não encontrada." };
  if (user.role === "DOCTOR" && (!user.doctorId || appt.doctorId !== user.doctorId)) {
    return { error: "Só pode gerir marcações da sua própria agenda." };
  }
  // Permission: operational transitions and clinical transitions are separate.
  if (status === "CHEGOU") {
    if (!can(user.role, "appointment.checkin") && !can(user.role, "appointment.manage"))
      return { error: "Sem permissão." };
  } else if (status === "EM_CONSULTA" || status === "CONCLUIDA") {
    if (!can(user.role, "consultation.conduct")) return { error: "Sem permissão clínica." };
    if (status === "CONCLUIDA") return { error: "Conclua a consulta através do editor clínico." };
  } else if (!can(user.role, "appointment.manage")) {
    return { error: "Sem permissão." };
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
      await tx.consultation.upsert({
        where: { appointmentId: appt.id },
        create: {
          clinicId: user.clinicId,
          appointmentId: appt.id,
          patientId: appt.patientId,
          doctorId: appt.doctorId,
          startedAt: new Date(),
        },
        update: { startedAt: new Date() },
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
