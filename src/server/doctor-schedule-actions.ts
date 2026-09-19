"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { validateDoctorSchedule, type DoctorScheduleDraft } from "@/lib/domain/doctor-schedule";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { getTranslator } from "@/i18n/server";

export type DoctorScheduleActionResult = { ok: true } | { error: string };

export async function updateDoctorSchedule(
  doctorId: string,
  drafts: DoctorScheduleDraft[],
): Promise<DoctorScheduleActionResult> {
  const [user, t] = await Promise.all([requireUser(), getTranslator()]);
  if (!can(user.role, "doctor.manage")) return { error: t("doctors.schedule.errors.noPermission") };

  const validation = validateDoctorSchedule(drafts);
  if (!validation.ok) return { error: t(`doctors.schedule.errors.${validation.error}`) };

  const doctor = await prisma.doctor.findFirst({
    where: { id: doctorId, clinicId: user.clinicId },
    select: {
      id: true,
      consultationDuration: true,
      schedules: {
        orderBy: { weekday: "asc" },
        select: { weekday: true, startTime: true, endTime: true, breakStart: true, breakEnd: true, slotMinutes: true },
      },
    },
  });
  if (!doctor) return { error: t("doctors.schedule.errors.notFound") };

  const nextSchedules = validation.schedules.map((schedule) => ({
    ...schedule,
    slotMinutes: doctor.consultationDuration,
  }));

  await prisma.$transaction(async (tx) => {
    await tx.doctorSchedule.deleteMany({ where: { doctorId: doctor.id } });
    await tx.doctorSchedule.createMany({
      data: nextSchedules.map((schedule) => ({ doctorId: doctor.id, ...schedule })),
    });
  });

  await audit({
    clinicId: user.clinicId,
    userId: user.userId,
    action: "doctor.schedule.update",
    entity: "DoctorSchedule",
    entityId: doctor.id,
    before: { schedules: doctor.schedules },
    after: { schedules: nextSchedules },
  });

  revalidatePath(`/medicos/${doctor.id}`);
  revalidatePath("/medicos");
  revalidatePath("/agenda");
  return { ok: true };
}
