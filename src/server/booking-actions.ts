"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { addDays, addMinutes } from "date-fns";
import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { generateDaySlots, hasConflict, type WeeklyRule } from "@/lib/domain/availability";
import { CLINIC_TZ } from "@/lib/datetime";
import { getTranslator } from "@/i18n/server";

export interface BookingContext {
  specialties: { id: string; name: string; color: string }[];
  doctors: {
    id: string;
    name: string;
    specialtyId: string;
    consultationPrice: number;
    consultationDuration: number;
  }[];
  plans: { id: string; name: string; insurer: string; contractPrice: number }[];
  services: { id: string; name: string; category: string; basePrice: number }[];
}

export async function getBookingContext(): Promise<BookingContext> {
  const user = await requireUser();
  const [specialties, doctors, plans, services] = await Promise.all([
    prisma.specialty.findMany({
      where: { clinicId: user.clinicId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, color: true },
    }),
    prisma.doctor.findMany({
      where: { clinicId: user.clinicId, status: "ACTIVO" },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        specialtyId: true,
        consultationPrice: true,
        consultationDuration: true,
      },
    }),
    prisma.healthPlan.findMany({
      where: { clinicId: user.clinicId, isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, contractPrice: true, insuranceCompany: { select: { name: true } } },
    }),
    prisma.service.findMany({
      where: { clinicId: user.clinicId, isActive: true, source: { in: ["EXAME", "PROCEDIMENTO", "OUTRO"] } },
      orderBy: [{ category: "asc" }, { name: "asc" }],
      select: { id: true, name: true, category: true, basePrice: true },
    }),
  ]);

  return {
    specialties,
    doctors,
    services,
    plans: plans.map((p) => ({
      id: p.id,
      name: p.name,
      insurer: p.insuranceCompany.name,
      contractPrice: p.contractPrice,
    })),
  };
}

export async function searchPatients(query: string) {
  const user = await requireUser();
  const q = query.trim();
  if (q.length < 2) return [];
  return prisma.patient.findMany({
    where: {
      clinicId: user.clinicId,
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { phone: { contains: q } },
        { code: { contains: q, mode: "insensitive" } },
      ],
    },
    take: 8,
    orderBy: { name: "asc" },
    select: { id: true, code: true, name: true, phone: true },
  });
}

export async function quickCreatePatient(input: { name: string; phone?: string }) {
  const user = await requireUser();
  const t = await getTranslator();
  if (!can(user.role, "patient.manage")) return { error: t("agenda.booking.errors.noPermission") };
  const quickPatientSchema = z.object({
    name: z.string().min(3, t("agenda.booking.errors.nameTooShort")),
    phone: z.string().min(6, t("agenda.booking.errors.invalidPhone")).optional().or(z.literal("")),
  });
  const parsed = quickPatientSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const count = await prisma.patient.count({ where: { clinicId: user.clinicId } });
  const code = `PAC-${String(count + 1).padStart(5, "0")}`;

  const patient = await prisma.patient.create({
    data: {
      clinicId: user.clinicId,
      code,
      name: parsed.data.name.trim(),
      phone: parsed.data.phone || null,
    },
    select: { id: true, code: true, name: true, phone: true },
  });
  await audit({
    clinicId: user.clinicId,
    userId: user.userId,
    action: "patient.create",
    entity: "Patient",
    entityId: patient.id,
  });
  return { patient };
}

const createSchema = z.object({
  patientId: z.string().min(1),
  doctorId: z.string().min(1),
  startAt: z.string().min(1), // ISO
  type: z.enum(["CONSULTA", "RETORNO", "EXAME", "PROCEDIMENTO"]).default("CONSULTA"),
  healthPlanId: z.string().optional().nullable(),
  serviceId: z.string().optional().nullable(),
  isPrivate: z.boolean().default(false),
  reason: z.string().optional(),
});

export async function getDoctorAvailability(
  doctorId: string,
  date: string,
): Promise<{ error: string } | { slots: { start: string; label: string }[] }> {
  const user = await requireUser();
  const t = await getTranslator();

  const doctor = await prisma.doctor.findFirst({
    where: { id: doctorId, clinicId: user.clinicId },
    select: {
      id: true,
      consultationDuration: true,
      schedules: {
        select: { weekday: true, startTime: true, endTime: true, breakStart: true, breakEnd: true, slotMinutes: true },
      },
      availabilityExceptions: {
        where: {
          date: new Date(date),
        },
        select: { type: true, startTime: true, endTime: true },
      },
    },
  });

  if (!doctor) return { error: t("agenda.booking.errors.doctorNotFound") };

  const target = fromZonedTime(`${date}T00:00:00`, CLINIC_TZ);
  if (Number.isNaN(target.getTime())) return { error: t("agenda.booking.errors.invalidDate") };

  const rule = doctor.schedules.find((s) => s.weekday === toZonedTime(target, CLINIC_TZ).getDay()) as WeeklyRule | undefined;
  const dayStart = target;
  const dayEnd = fromZonedTime(`${formatInTimeZone(addDays(target, 1), CLINIC_TZ, "yyyy-MM-dd")}T00:00:00`, CLINIC_TZ);
  const busy = await prisma.appointment.findMany({
    where: {
      doctorId: doctor.id,
      clinicId: user.clinicId,
      status: { notIn: ["CANCELADA", "NAO_COMPARECEU"] },
      startAt: {
        gte: dayStart,
        lt: dayEnd,
      },
    },
    select: { startAt: true, endAt: true },
  });

  const daySlots = generateDaySlots(
    target,
    rule,
    doctor.availabilityExceptions.map((ex) => ({
      type: ex.type as "FOLGA" | "FERIAS" | "HORARIO_ESPECIAL" | "BLOQUEIO",
      startTime: ex.startTime,
      endTime: ex.endTime,
    })),
    busy.map((b) => ({ start: b.startAt, end: b.endAt })),
    CLINIC_TZ,
  );

  const slots: { start: string; label: string }[] = daySlots
    .filter((slot) => !slot.taken)
    .map((slot) => ({
      start: slot.start.toISOString(),
      label: formatInTimeZone(slot.start, CLINIC_TZ, "HH:mm"),
    }));

  return { slots };
}

export async function createAppointment(input: z.input<typeof createSchema>) {
  const user = await requireUser();
  const t = await getTranslator();
  if (!can(user.role, "appointment.manage")) return { error: t("agenda.booking.errors.noPermissionBook") };

  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const data = parsed.data;

  const doctor = await prisma.doctor.findFirst({
    where: { id: data.doctorId, clinicId: user.clinicId },
    select: { id: true, specialtyId: true, consultationPrice: true, consultationDuration: true },
  });
  if (!doctor) return { error: t("agenda.booking.errors.doctorNotFound") };

  const patient = await prisma.patient.findFirst({
    where: { id: data.patientId, clinicId: user.clinicId },
    select: { id: true },
  });
  if (!patient) return { error: t("agenda.booking.errors.patientNotFound") };

  const startAt = new Date(data.startAt);
  if (Number.isNaN(startAt.getTime())) return { error: t("agenda.booking.errors.invalidDateTime") };
  // No booking in the past (allow a 2-minute grace for clock skew).
  if (startAt.getTime() < Date.now() - 2 * 60_000) {
    return { error: t("agenda.booking.errors.pastDate") };
  }
  const endAt = addMinutes(startAt, doctor.consultationDuration);
  const clinicStart = toZonedTime(startAt, CLINIC_TZ);
  const clinicDate = formatInTimeZone(startAt, CLINIC_TZ, "yyyy-MM-dd");

  const sameDayRule = await prisma.doctorSchedule.findFirst({
    where: {
      doctorId: doctor.id,
      weekday: clinicStart.getDay(),
    },
    select: { weekday: true, startTime: true, endTime: true, breakStart: true, breakEnd: true, slotMinutes: true },
  });
  const sameDayExceptions = await prisma.doctorAvailabilityException.findMany({
    where: {
      doctorId: doctor.id,
      date: fromZonedTime(`${clinicDate}T00:00:00`, CLINIC_TZ),
    },
    select: { type: true, startTime: true, endTime: true },
  });

  const sameDayBusy = await prisma.appointment.findMany({
    where: {
      doctorId: doctor.id,
      status: { notIn: ["CANCELADA", "NAO_COMPARECEU"] },
      startAt: { lt: endAt },
      endAt: { gt: startAt },
    },
    select: { startAt: true, endAt: true },
  });
  const busy = sameDayBusy.map((b) => ({ start: b.startAt, end: b.endAt }));

  if (hasConflict(busy, startAt, endAt)) {
    return { error: t("agenda.booking.errors.conflict") };
  }

  const daySlots = generateDaySlots(
    fromZonedTime(`${clinicDate}T00:00:00`, CLINIC_TZ),
    sameDayRule ?? undefined,
    sameDayExceptions.map((ex) => ({
      type: ex.type as "FOLGA" | "FERIAS" | "HORARIO_ESPECIAL" | "BLOQUEIO",
      startTime: ex.startTime,
      endTime: ex.endTime,
    })),
    busy,
    CLINIC_TZ,
  );

  const slotMatches = daySlots.some((slot) => slot.start.getTime() === startAt.getTime());
  if (!slotMatches) {
    return { error: t("agenda.booking.errors.doctorUnavailable") };
  }

  // An exam / procedure must say which one, and its price drives the quote.
  let serviceId: string | null = null;
  let servicePrice: number | null = null;
  if (data.type === "EXAME" || data.type === "PROCEDIMENTO") {
    if (!data.serviceId) return { error: t("agenda.booking.errors.serviceRequired") };
    const service = await prisma.service.findFirst({
      where: { id: data.serviceId, clinicId: user.clinicId },
      select: { id: true, basePrice: true },
    });
    if (!service) return { error: t("agenda.booking.errors.invalidService") };
    serviceId = service.id;
    servicePrice = service.basePrice;
  }

  let healthPlanId: string | null = null;
  let priceQuoted = servicePrice ?? doctor.consultationPrice;
  if (!data.isPrivate && data.healthPlanId) {
    const plan = await prisma.healthPlan.findFirst({
      where: { id: data.healthPlanId, clinicId: user.clinicId },
      select: { id: true, contractPrice: true },
    });
    if (plan) {
      healthPlanId = plan.id;
      priceQuoted = plan.contractPrice;
    }
  }

  const appt = await prisma.$transaction(async (tx) => {
    const appointment = await tx.appointment.create({
      data: {
        clinicId: user.clinicId,
        patientId: patient.id,
        doctorId: doctor.id,
        specialtyId: doctor.specialtyId,
        type: data.type,
        serviceId,
        status: "MARCADA",
        startAt,
        endAt,
        isPrivate: data.isPrivate || !healthPlanId,
        healthPlanId,
        priceQuoted,
        reason: data.reason || null,
        createdById: user.userId,
      },
      select: { id: true },
    });

    await tx.consultation.create({
      data: {
        clinicId: user.clinicId,
        appointmentId: appointment.id,
        patientId: patient.id,
        doctorId: doctor.id,
        startedAt: startAt,
      },
    });

    return appointment;
  });

  await audit({
    clinicId: user.clinicId,
    userId: user.userId,
    action: "appointment.create",
    entity: "Appointment",
    entityId: appt.id,
    metadata: { doctorId: doctor.id, startAt: startAt.toISOString() },
  });

  revalidatePath("/agenda");
  revalidatePath("/");
  return { id: appt.id };
}
