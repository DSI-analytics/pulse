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
      specialtyId: true,
      healthPlanId: true,
      priceQuoted: true,
      startAt: true,
      endAt: true,
      revenue: { select: { id: true } },
    },
  });
  if (!appt) return { error: "Marcação não encontrada." };

  // Permission: check-in vs full management.
  if (status === "CHEGOU") {
    if (!can(user.role, "appointment.checkin") && !can(user.role, "appointment.manage"))
      return { error: "Sem permissão." };
  } else if (!can(user.role, "appointment.manage") && !can(user.role, "consultation.conduct")) {
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

    // Recognise revenue once, when a consultation is concluded.
    if (status === "CONCLUIDA" && !appt.revenue) {
      await tx.consultation.upsert({
        where: { appointmentId: appt.id },
        create: {
          clinicId: user.clinicId,
          appointmentId: appt.id,
          patientId: appt.patientId,
          doctorId: appt.doctorId,
          startedAt: appt.startAt,
          endedAt: appt.endAt,
        },
        update: { endedAt: new Date() },
      });
      await tx.revenue.create({
        data: {
          clinicId: user.clinicId,
          source: appt.healthPlanId ? "SEGURADORA" : "CONSULTA",
          description: "Consulta",
          amount: appt.priceQuoted,
          patientId: appt.patientId,
          doctorId: appt.doctorId,
          specialtyId: appt.specialtyId,
          healthPlanId: appt.healthPlanId,
          appointmentId: appt.id,
          status: appt.healthPlanId ? "PENDENTE" : "PAGO",
        },
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
