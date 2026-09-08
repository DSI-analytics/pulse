import "server-only";

import { Prisma } from "@prisma/client";
import { addDays, addMinutes } from "date-fns";
import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { CLINIC_TZ } from "@/lib/datetime";
import { generateDaySlots, type WeeklyRule } from "@/lib/domain/availability";
import { nameKey, phoneKey } from "@/lib/domain/patient-matching";
import { prisma } from "@/lib/prisma";
import type { PublicBookingPrincipal } from "@/lib/public-booking-auth";
import { formatSequence, withNumberRetry } from "@/lib/sequences";

/**
 * Marcação online a partir do website institucional — o canal público.
 *
 * O visitante não tem sessão nem histórico: identifica-se pelo nome, telefone e
 * data de nascimento. O pedido entra no Pulso como qualquer outra marcação —
 * mesma agenda, mesmas validações de disponibilidade, mesma auditoria — com
 * estado `MARCADA`, por confirmar pela recepção.
 *
 * Reaproveitamento de ficha: só quando o contacto *e* o nome coincidem. Um
 * contacto isolado não basta — um número mal digitado não pode pendurar uma
 * marcação no processo clínico de outra pessoa. Na dúvida abre-se ficha nova e
 * a recepção funde-a com a ferramenta de deduplicação já existente.
 */

const MAX_HORIZON_DAYS = 90;

class PublicBookingConflictError extends Error {}

const requestSchema = z.object({
  name: z.string().trim().min(5, "Indique o nome completo.").max(120, "Nome demasiado longo."),
  phone: z.string().trim().min(9, "Indique um telefone válido.").max(40, "Telefone inválido."),
  email: z.string().trim().toLowerCase().email("Indique um email válido.").max(160).optional().or(z.literal("")),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data de nascimento inválida.").optional().or(z.literal("")),
  gender: z.enum(["MASCULINO", "FEMININO", "OUTRO"]).optional().or(z.literal("")),
  doctorId: z.string().min(1, "Selecione o profissional."),
  startAt: z.string().datetime({ offset: true, message: "Data ou hora inválida." }),
  type: z.enum(["CONSULTA", "EXAME", "PROCEDIMENTO"]).default("CONSULTA"),
  serviceId: z.string().optional().or(z.literal("")),
  reason: z.string().trim().max(500, "O motivo deve ter no máximo 500 caracteres.").optional().or(z.literal("")),
  consent: z.literal(true, { message: "É necessário aceitar o tratamento dos seus dados." }),
});

export type PublicBookingInput = z.input<typeof requestSchema>;

export interface PublicBookingContext {
  clinic: { name: string; phone: string | null; email: string | null; address: string | null; city: string };
  specialties: Array<{ id: string; name: string; color: string }>;
  doctors: Array<{
    id: string;
    name: string;
    specialtyId: string;
    specialty: string;
    licenseNumber: string | null;
    consultationPrice: number;
    consultationDuration: number;
    weekdays: number[];
  }>;
  services: Array<{ id: string; name: string; category: string; source: "EXAME" | "PROCEDIMENTO"; basePrice: number }>;
  horizonDays: number;
}

/** Catálogo público: quem atende, em que especialidade e a que preço. */
export async function getPublicBookingContext(principal: PublicBookingPrincipal): Promise<PublicBookingContext> {
  const [clinic, specialties, doctors, services] = await Promise.all([
    prisma.clinic.findUniqueOrThrow({
      where: { id: principal.clinicId },
      select: { name: true, phone: true, email: true, address: true, city: true },
    }),
    prisma.specialty.findMany({
      where: { clinicId: principal.clinicId, doctors: { some: { status: "ACTIVO" } } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, color: true },
    }),
    prisma.doctor.findMany({
      where: { clinicId: principal.clinicId, status: "ACTIVO", schedules: { some: {} } },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        specialtyId: true,
        licenseNumber: true,
        consultationPrice: true,
        consultationDuration: true,
        specialty: { select: { name: true } },
        schedules: { select: { weekday: true } },
      },
    }),
    prisma.service.findMany({
      where: { clinicId: principal.clinicId, isActive: true, source: { in: ["EXAME", "PROCEDIMENTO"] } },
      orderBy: [{ category: "asc" }, { name: "asc" }],
      select: { id: true, name: true, category: true, source: true, basePrice: true },
    }),
  ]);

  return {
    clinic,
    specialties,
    doctors: doctors.map(({ specialty, schedules, ...doctor }) => ({
      ...doctor,
      specialty: specialty.name,
      weekdays: schedules.map((item) => item.weekday).sort(),
    })),
    services: services.map((service) => ({ ...service, source: service.source as "EXAME" | "PROCEDIMENTO" })),
    horizonDays: MAX_HORIZON_DAYS,
  };
}

/** Horários livres de um profissional num dia. Não revela quem ocupa os restantes. */
export async function getPublicDoctorAvailability(
  principal: PublicBookingPrincipal,
  doctorId: string,
  date: string,
): Promise<{ slots: Array<{ start: string; label: string }> } | { error: string }> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Data inválida." };
  const target = fromZonedTime(`${date}T00:00:00`, CLINIC_TZ);
  if (Number.isNaN(target.getTime())) return { error: "Data inválida." };

  const today = formatInTimeZone(new Date(), CLINIC_TZ, "yyyy-MM-dd");
  if (date < today) return { error: "Não é possível marcar numa data passada." };
  if (date > formatInTimeZone(addDays(new Date(), MAX_HORIZON_DAYS), CLINIC_TZ, "yyyy-MM-dd")) {
    return { error: `Só é possível marcar até ${MAX_HORIZON_DAYS} dias de antecedência.` };
  }

  const doctor = await prisma.doctor.findFirst({
    where: { id: doctorId, clinicId: principal.clinicId, status: "ACTIVO" },
    select: {
      id: true,
      schedules: {
        select: { weekday: true, startTime: true, endTime: true, breakStart: true, breakEnd: true, slotMinutes: true },
      },
      availabilityExceptions: { where: { date: target }, select: { type: true, startTime: true, endTime: true } },
    },
  });
  if (!doctor) return { error: "Profissional não encontrado." };

  const rule = doctor.schedules.find(
    (item) => item.weekday === toZonedTime(target, CLINIC_TZ).getDay(),
  ) as WeeklyRule | undefined;
  const dayEnd = fromZonedTime(`${formatInTimeZone(addDays(target, 1), CLINIC_TZ, "yyyy-MM-dd")}T00:00:00`, CLINIC_TZ);
  const busy = await prisma.appointment.findMany({
    where: {
      doctorId: doctor.id,
      clinicId: principal.clinicId,
      status: { notIn: ["CANCELADA", "NAO_COMPARECEU"] },
      startAt: { gte: target, lt: dayEnd },
    },
    select: { startAt: true, endAt: true },
  });

  const slots = generateDaySlots(
    target,
    rule,
    doctor.availabilityExceptions.map((item) => ({ type: item.type, startTime: item.startTime, endTime: item.endTime })),
    busy.map((item) => ({ start: item.startAt, end: item.endAt })),
    CLINIC_TZ,
  )
    // Uma hora de folga entre o pedido online e o horário: a recepção ainda tem
    // de confirmar antes de o paciente sair de casa.
    .filter((slot) => !slot.taken && slot.start.getTime() > Date.now() + 60 * 60_000)
    .map((slot) => ({ start: slot.start.toISOString(), label: formatInTimeZone(slot.start, CLINIC_TZ, "HH:mm") }));

  return { slots };
}

/** Ficha existente cujo contacto *e* nome coincidem, se houver. */
async function findMatchingPatient(clinicId: string, name: string, phone: string, email: string) {
  const key = phoneKey(phone);
  const or: object[] = [];
  if (key) {
    // O telefone é guardado formatado ("+258 84 123 4567"), pelo que se procura
    // pelo último bloco de dígitos e se confirma em memória.
    const tail = key.slice(-4);
    or.push({ phone: { contains: tail } }, { phoneAlt: { contains: tail } });
  }
  if (email) or.push({ email: { equals: email, mode: "insensitive" as const } });
  if (!or.length) return null;

  const rows = await prisma.patient.findMany({
    where: { clinicId, isActive: true, mergedIntoId: null, OR: or },
    take: 200,
    select: { id: true, name: true, phone: true, phoneAlt: true, email: true },
  });

  const subjectTokens = new Set(nameKey(name).split(" ").filter(Boolean));
  if (!subjectTokens.size) return null;

  return (
    rows.find((row) => {
      const contactMatch =
        (!!key && (phoneKey(row.phone) === key || phoneKey(row.phoneAlt) === key)) ||
        (!!email && row.email?.toLowerCase() === email);
      if (!contactMatch) return false;
      const candidateTokens = nameKey(row.name).split(" ").filter(Boolean);
      if (!candidateTokens.length) return false;
      const shared = candidateTokens.filter((token) => subjectTokens.has(token)).length;
      return shared >= Math.min(2, candidateTokens.length, subjectTokens.size);
    }) ?? null
  );
}

export interface PublicBookingResult {
  id: string;
  reference: string;
  patientCode: string;
  date: string;
  time: string;
  doctor: string;
  specialty: string;
  priceQuoted: number;
  isNewPatient: boolean;
}

/** Cria a marcação no Pulso a partir do pedido anónimo do website. */
export async function createPublicBookingRequest(
  principal: PublicBookingPrincipal,
  input: unknown,
): Promise<PublicBookingResult | { error: string }> {
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };
  const data = parsed.data;

  const startAt = new Date(data.startAt);
  const clinicDate = formatInTimeZone(startAt, CLINIC_TZ, "yyyy-MM-dd");
  const availability = await getPublicDoctorAvailability(principal, data.doctorId, clinicDate);
  if ("error" in availability) return availability;
  if (!availability.slots.some((slot) => slot.start === startAt.toISOString())) {
    return { error: "O horário selecionado já não está disponível. Escolha outro." };
  }

  const doctor = await prisma.doctor.findFirst({
    where: { id: data.doctorId, clinicId: principal.clinicId, status: "ACTIVO" },
    select: {
      id: true,
      name: true,
      branchId: true,
      specialtyId: true,
      consultationPrice: true,
      consultationDuration: true,
      specialty: { select: { name: true } },
    },
  });
  if (!doctor) return { error: "Profissional não encontrado." };

  let serviceId: string | null = null;
  let priceQuoted = doctor.consultationPrice;
  if (data.type === "EXAME" || data.type === "PROCEDIMENTO") {
    if (!data.serviceId) return { error: "Selecione o exame ou procedimento pretendido." };
    const service = await prisma.service.findFirst({
      where: { id: data.serviceId, clinicId: principal.clinicId, isActive: true, source: data.type },
      select: { id: true, basePrice: true },
    });
    if (!service) return { error: "Exame ou procedimento inválido." };
    serviceId = service.id;
    priceQuoted = service.basePrice;
  }

  const email = data.email || "";
  const birthDate = data.birthDate ? new Date(`${data.birthDate}T00:00:00Z`) : null;
  if (birthDate && (Number.isNaN(birthDate.getTime()) || birthDate > new Date())) {
    return { error: "Data de nascimento inválida." };
  }

  const existing = await findMatchingPatient(principal.clinicId, data.name, data.phone, email);

  const endAt = addMinutes(startAt, doctor.consultationDuration);
  let created: { appointmentId: string; patientId: string; patientCode: string; isNewPatient: boolean };
  try {
    created = await withNumberRetry(async () =>
      prisma.$transaction(async (tx) => {
      // A leitura final e a criação têm de pertencer à mesma transação. Com
      // isolamento serializável, duas submissões simultâneas não reservam o
      // mesmo período: uma delas termina com P2034 e recebe a mensagem abaixo.
      const conflicting = await tx.appointment.count({
        where: {
          doctorId: doctor.id,
          status: { notIn: ["CANCELADA", "NAO_COMPARECEU"] },
          startAt: { lt: endAt },
          endAt: { gt: startAt },
        },
      });
      if (conflicting) throw new PublicBookingConflictError();

      let patientId: string;
      let patientCode: string;

      if (existing) {
        const patient = await tx.patient.update({
          where: { id: existing.id },
          data: {
            // Só preenche lacunas — nunca sobrepõe dados validados na recepção.
            ...(existing.phone ? {} : { phone: data.phone }),
            ...(existing.email || !email ? {} : { email }),
          },
          select: { id: true, code: true },
        });
        patientId = patient.id;
        patientCode = patient.code;
      } else {
        const count = await tx.patient.count({ where: { clinicId: principal.clinicId } });
        const patient = await tx.patient.create({
          data: {
            clinicId: principal.clinicId,
            code: formatSequence("patient", new Date().getUTCFullYear(), count + 1).replace(/^PAC-\d{4}-/, "PAC-"),
            name: data.name,
            phone: data.phone,
            email: email || null,
            birthDate,
            gender: data.gender || null,
            notes: "Ficha aberta por marcação online no website. Confirmar dados na recepção.",
          },
          select: { id: true, code: true },
        });
        patientId = patient.id;
        patientCode = patient.code;
      }

      const appointment = await tx.appointment.create({
        data: {
          clinicId: principal.clinicId,
          branchId: doctor.branchId,
          patientId,
          doctorId: doctor.id,
          specialtyId: doctor.specialtyId,
          isPrivate: true,
          type: data.type,
          serviceId,
          status: "MARCADA",
          startAt,
          endAt,
          priceQuoted,
          reason: data.reason || null,
          notes: `Pedido online via ${principal.clientName}. Contacto indicado: ${data.phone}${email ? ` · ${email}` : ""}.`,
        },
        select: { id: true },
      });

      await tx.consultation.create({
        data: {
          clinicId: principal.clinicId,
          appointmentId: appointment.id,
          patientId,
          doctorId: doctor.id,
          startedAt: startAt,
        },
      });

      await tx.notification.create({
        data: {
          clinicId: principal.clinicId,
          type: "MARCACAO",
          severity: "INFO",
          title: "Nova marcação online",
          body: `${data.name} pediu ${doctor.specialty.name} com ${doctor.name} em ${formatInTimeZone(startAt, CLINIC_TZ, "dd/MM/yyyy 'às' HH:mm")}. Confirmar por telefone: ${data.phone}.`,
          entity: "Appointment",
          entityId: appointment.id,
          requiredPermission: "appointment.view",
        },
      });

      return { appointmentId: appointment.id, patientId, patientCode, isNewPatient: !existing };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }),
    );
  } catch (error) {
    if (
      error instanceof PublicBookingConflictError ||
      (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034")
    ) {
      return { error: "O horário selecionado já não está disponível. Escolha outro." };
    }
    throw error;
  }

  await audit({
    clinicId: principal.clinicId,
    userName: `Website: ${principal.clientName}`,
    action: "public_booking.appointment_create",
    module: "agenda",
    entity: "Appointment",
    entityId: created.appointmentId,
    request: {
      ipAddress: principal.ipAddress,
      userAgent: principal.userAgent,
      requestId: principal.requestId,
      endpoint: "/api/public/booking",
      httpMethod: "POST",
    },
    metadata: {
      canal: "website",
      cliente: principal.clientName,
      doctorId: doctor.id,
      patientId: created.patientId,
      fichaNova: created.isNewPatient,
      startAt: startAt.toISOString(),
    },
  });

  return {
    id: created.appointmentId,
    reference: `LM-${created.appointmentId.slice(-6).toUpperCase()}`,
    patientCode: created.patientCode,
    date: formatInTimeZone(startAt, CLINIC_TZ, "dd/MM/yyyy"),
    time: formatInTimeZone(startAt, CLINIC_TZ, "HH:mm"),
    doctor: doctor.name,
    specialty: doctor.specialty.name,
    priceQuoted,
    isNewPatient: created.isNewPatient,
  };
}
