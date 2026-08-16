"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { addMinutes } from "date-fns";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { generateDaySlots, hasConflict, type WeeklyRule } from "@/lib/domain/availability";

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

const quickPatientSchema = z.object({
  name: z.string().min(3, "Nome demasiado curto"),
  phone: z.string().min(6, "Telefone inválido").optional().or(z.literal("")),
});

export async function quickCreatePatient(input: { name: string; phone?: string }) {
  const user = await requireUser();
  if (!can(user.role, "patient.manage")) return { error: "Sem permissão." };
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

  if (!doctor) return { error: "Médico não encontrado." };

  const target = new Date(`${date}T00:00:00`);
  if (Number.isNaN(target.getTime())) return { error: "Data inválida." };

  const rule = doctor.schedules.find((s) => s.weekday === target.getDay()) as WeeklyRule | undefined;
  const busy = await prisma.appointment.findMany({
    where: {
      doctorId: doctor.id,
      clinicId: user.clinicId,
      status: { notIn: ["CANCELADA", "NAO_COMPARECEU"] },
      startAt: {
        gte: new Date(`${date}T00:00:00`),
        lt: new Date(`${date}T23:59:59`),
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
  );

  const slots: { start: string; label: string }[] = daySlots
    .filter((slot) => !slot.taken)
    .map((slot) => ({
      start: slot.start.toISOString(),
      label: `${slot.start.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit", hour12: false })}`,
    }));

  return { slots };
}

export async function createAppointment(input: z.input<typeof createSchema>) {
  const user = await requireUser();
  if (!can(user.role, "appointment.manage")) return { error: "Sem permissão para marcar." };

  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const data = parsed.data;

  const doctor = await prisma.doctor.findFirst({
    where: { id: data.doctorId, clinicId: user.clinicId },
    select: { id: true, specialtyId: true, consultationPrice: true, consultationDuration: true },
  });
  if (!doctor) return { error: "Médico não encontrado." };

  const patient = await prisma.patient.findFirst({
    where: { id: data.patientId, clinicId: user.clinicId },
    select: { id: true },
  });
  if (!patient) return { error: "Paciente não encontrado." };

  const startAt = new Date(data.startAt);
  if (Number.isNaN(startAt.getTime())) return { error: "Data/hora inválida." };
  // No booking in the past (allow a 2-minute grace for clock skew).
  if (startAt.getTime() < Date.now() - 2 * 60_000) {
    return { error: "Não é possível agendar numa data/hora passada." };
  }
  const endAt = addMinutes(startAt, doctor.consultationDuration);

  const sameDayRule = await prisma.doctorSchedule.findFirst({
    where: {
      doctorId: doctor.id,
      weekday: startAt.getDay(),
    },
    select: { weekday: true, startTime: true, endTime: true, breakStart: true, breakEnd: true, slotMinutes: true },
  });
  const sameDayExceptions = await prisma.doctorAvailabilityException.findMany({
    where: {
      doctorId: doctor.id,
      date: new Date(startAt.toISOString().slice(0, 10)),
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
    return { error: "Conflito de horário: o médico já tem uma marcação nesse período." };
  }

  const daySlots = generateDaySlots(
    new Date(startAt.toISOString().slice(0, 10) + "T00:00:00"),
    sameDayRule ?? undefined,
    sameDayExceptions.map((ex) => ({
      type: ex.type as "FOLGA" | "FERIAS" | "HORARIO_ESPECIAL" | "BLOQUEIO",
      startTime: ex.startTime,
      endTime: ex.endTime,
    })),
    busy,
  );

  const slotMatches = daySlots.some((slot) => slot.start.getTime() === startAt.getTime());
  if (!slotMatches) {
    return { error: "O médico não está disponível nesse dia e horário." };
  }

  // An exam / procedure must say which one, and its price drives the quote.
  let serviceId: string | null = null;
  let servicePrice: number | null = null;
  if (data.type === "EXAME" || data.type === "PROCEDIMENTO") {
    if (!data.serviceId) return { error: "Indique qual o exame/procedimento a efectuar." };
    const service = await prisma.service.findFirst({
      where: { id: data.serviceId, clinicId: user.clinicId },
      select: { id: true, basePrice: true },
    });
    if (!service) return { error: "Exame/serviço inválido." };
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

  const appt = await prisma.appointment.create({
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
