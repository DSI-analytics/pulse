import "server-only";

import { addDays, addMinutes } from "date-fns";
import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";
import { pt } from "date-fns/locale";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { CLINIC_TZ } from "@/lib/datetime";
import { generateDaySlots, type WeeklyRule } from "@/lib/domain/availability";
import { formatMZNExact } from "@/lib/money";
import type { PatientPortalContext } from "@/lib/patient-portal-auth";
import { prisma } from "@/lib/prisma";

const ACTIVE_APPOINTMENT_STATUSES = ["MARCADA", "CONFIRMADA", "CHEGOU", "EM_ESPERA", "EM_CONSULTA"] as const;

const bookingSchema = z.object({
  doctorId: z.string().min(1, "Selecione o médico."),
  startAt: z.string().datetime({ offset: true, message: "Data ou hora inválida." }),
  type: z.enum(["CONSULTA", "RETORNO", "EXAME", "PROCEDIMENTO"]).default("CONSULTA"),
  serviceId: z.string().optional().nullable(),
  patientHealthPlanId: z.string().optional().nullable(),
  reason: z.string().trim().max(500, "O motivo deve ter no máximo 500 caracteres.").optional(),
});

const profileSchema = z.object({
  phone: z.string().trim().max(40).optional().nullable(),
  email: z.string().trim().toLowerCase().email("Indique um email válido.").optional().nullable().or(z.literal("")),
  address: z.string().trim().max(300).optional().nullable(),
  emergencyContactName: z.string().trim().max(120).optional().nullable(),
  emergencyContactPhone: z.string().trim().max(40).optional().nullable(),
});

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function appointmentStatus(status: string): "Confirmada" | "Concluída" | "Cancelada" {
  if (status === "CONCLUIDA") return "Concluída";
  if (status === "CANCELADA" || status === "NAO_COMPARECEU") return "Cancelada";
  return "Confirmada";
}

function mapAppointment(appointment: {
  id: string; startAt: Date; status: string; doctor: { name: string };
  specialty: { name: string }; branch: { name: string } | null; clinic: { name: string };
}) {
  const month = formatInTimeZone(appointment.startAt, CLINIC_TZ, "MMM", { locale: pt }).replace(".", "").toUpperCase();
  return {
    id: appointment.id,
    day: formatInTimeZone(appointment.startAt, CLINIC_TZ, "dd"),
    month,
    weekday: capitalize(formatInTimeZone(appointment.startAt, CLINIC_TZ, "EEEE", { locale: pt })),
    date: formatInTimeZone(appointment.startAt, CLINIC_TZ, "yyyy-MM-dd"),
    time: formatInTimeZone(appointment.startAt, CLINIC_TZ, "HH:mm"),
    doctor: appointment.doctor.name,
    specialty: appointment.specialty.name,
    clinic: [appointment.clinic.name, appointment.branch?.name].filter(Boolean).join(" · "),
    status: appointmentStatus(appointment.status),
    canCancel: ["MARCADA", "CONFIRMADA"].includes(appointment.status) && appointment.startAt > new Date(),
    avatar: initials(appointment.doctor.name.replace(/^(Dr|Dra)\.\s*/, "")),
  };
}

export async function getPatientDashboard(context: PatientPortalContext) {
  const patient = await prisma.patient.findFirstOrThrow({
    where: { id: context.patientId, clinicId: context.clinicId },
    select: {
      name: true, code: true, phone: true, email: true, birthDate: true, gender: true, address: true,
      emergencyContactName: true, emergencyContactPhone: true,
      clinic: { select: { name: true, phone: true, address: true, city: true } },
      healthPlans: {
        where: { isPrimary: true }, take: 1,
        select: { membershipNumber: true, validUntil: true, healthPlan: { select: { name: true, insuranceCompany: { select: { name: true } } } } },
      },
      appointments: {
        orderBy: { startAt: "desc" }, take: 40,
        select: { id: true, startAt: true, status: true, doctor: { select: { name: true } }, specialty: { select: { name: true } }, branch: { select: { name: true } }, clinic: { select: { name: true } } },
      },
      consultations: {
        where: { endedAt: { not: null } }, orderBy: { endedAt: "desc" }, take: 20,
        select: { id: true, endedAt: true, diagnosis: true, prescription: true, recommendations: true, doctor: { select: { name: true, specialty: { select: { name: true } } } } },
      },
      invoices: {
        where: { status: { notIn: ["RASCUNHO", "ANULADA"] } }, orderBy: { issuedAt: "desc" }, take: 20,
        select: { id: true, number: true, issuedAt: true, patientDue: true, status: true, items: { select: { description: true } }, payments: { where: { fromInsurer: false }, select: { amount: true } } },
      },
    },
  });

  const appointments = patient.appointments.map(mapAppointment);
  const nextAppointment = patient.appointments
    .filter((item) => item.startAt >= new Date() && (ACTIVE_APPOINTMENT_STATUSES as readonly string[]).includes(item.status))
    .sort((a, b) => a.startAt.getTime() - b.startAt.getTime())[0];
  const plan = patient.healthPlans[0];

  return {
    patient: {
      name: patient.name,
      firstName: patient.name.split(/\s+/)[0],
      code: patient.code,
      initials: initials(patient.name),
      phone: patient.phone ?? "",
      email: patient.email ?? "",
      birthDate: patient.birthDate ? formatInTimeZone(patient.birthDate, CLINIC_TZ, "dd 'de' MMMM 'de' yyyy", { locale: pt }) : "Não registada",
      gender: patient.gender === "FEMININO" ? "Feminino" : patient.gender === "MASCULINO" ? "Masculino" : patient.gender === "OUTRO" ? "Outro" : "Não registado",
      address: patient.address ?? "",
      emergencyContact: [patient.emergencyContactName, patient.emergencyContactPhone].filter(Boolean).join(" · "),
      emergencyContactName: patient.emergencyContactName ?? "",
      emergencyContactPhone: patient.emergencyContactPhone ?? "",
    },
    clinic: {
      name: patient.clinic.name,
      phone: patient.clinic.phone ?? "",
      address: [patient.clinic.address, patient.clinic.city].filter(Boolean).join(" · "),
    },
    plan: plan ? {
      provider: plan.healthPlan.insuranceCompany.name,
      name: plan.healthPlan.name,
      memberNumber: plan.membershipNumber ?? "Não registado",
      validUntil: plan.validUntil ? formatInTimeZone(plan.validUntil, CLINIC_TZ, "dd MMM yyyy", { locale: pt }) : "Sem validade definida",
    } : null,
    nextAppointment: nextAppointment ? mapAppointment(nextAppointment) : null,
    appointments,
    consultations: patient.consultations.map((consultation) => ({
      id: consultation.id,
      date: formatInTimeZone(consultation.endedAt!, CLINIC_TZ, "dd 'de' MMMM 'de' yyyy", { locale: pt }),
      doctor: consultation.doctor.name,
      specialty: consultation.doctor.specialty.name,
      diagnosis: consultation.diagnosis ?? "Sem diagnóstico registado",
      prescription: consultation.prescription ?? "Sem prescrição",
      recommendations: consultation.recommendations ?? "",
    })),
    invoices: patient.invoices.map((invoice) => ({
      id: invoice.id,
      number: invoice.number,
      date: formatInTimeZone(invoice.issuedAt, CLINIC_TZ, "dd MMM yyyy", { locale: pt }),
      description: invoice.items.map((item) => item.description).join(" · ") || "Serviços clínicos",
      amount: formatMZNExact(invoice.patientDue),
      status: invoice.status === "PAGA" || invoice.payments.reduce((sum, payment) => sum + payment.amount, 0) >= invoice.patientDue ? "Pago" as const : "Pendente" as const,
    })),
  };
}

export async function getPatientBookingContext(context: PatientPortalContext) {
  const [specialties, doctors, services, planLinks] = await Promise.all([
    prisma.specialty.findMany({ where: { clinicId: context.clinicId, doctors: { some: { status: "ACTIVO" } } }, orderBy: { name: "asc" }, select: { id: true, name: true, color: true } }),
    prisma.doctor.findMany({ where: { clinicId: context.clinicId, status: "ACTIVO" }, orderBy: { name: "asc" }, select: { id: true, name: true, specialtyId: true, consultationPrice: true, consultationDuration: true, acceptedPlans: { select: { healthPlanId: true } } } }),
    prisma.service.findMany({ where: { clinicId: context.clinicId, isActive: true, source: { in: ["EXAME", "PROCEDIMENTO"] } }, orderBy: [{ category: "asc" }, { name: "asc" }], select: { id: true, name: true, category: true, source: true, basePrice: true } }),
    prisma.patientHealthPlan.findMany({
      where: { patientId: context.patientId, clinicId: context.clinicId, healthPlan: { isActive: true }, OR: [{ validUntil: null }, { validUntil: { gte: new Date() } }] },
      select: { id: true, healthPlanId: true, membershipNumber: true, healthPlan: { select: { name: true, contractPrice: true, insuranceCompany: { select: { name: true } } } } },
    }),
  ]);
  return {
    specialties,
    doctors: doctors.map(({ acceptedPlans, ...doctor }) => ({ ...doctor, acceptedPlanIds: acceptedPlans.map((plan) => plan.healthPlanId) })),
    services,
    plans: planLinks.map((link) => ({ id: link.id, healthPlanId: link.healthPlanId, name: link.healthPlan.name, insurer: link.healthPlan.insuranceCompany.name, membershipNumber: link.membershipNumber, contractPrice: link.healthPlan.contractPrice })),
  };
}

export async function getPatientDoctorAvailability(context: PatientPortalContext, doctorId: string, date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Data inválida." };
  const target = fromZonedTime(`${date}T00:00:00`, CLINIC_TZ);
  if (Number.isNaN(target.getTime())) return { error: "Data inválida." };
  if (date < formatInTimeZone(new Date(), CLINIC_TZ, "yyyy-MM-dd")) return { error: "Não é possível marcar numa data passada." };

  const doctor = await prisma.doctor.findFirst({
    where: { id: doctorId, clinicId: context.clinicId, status: "ACTIVO" },
    select: {
      id: true,
      schedules: { select: { weekday: true, startTime: true, endTime: true, breakStart: true, breakEnd: true, slotMinutes: true } },
      availabilityExceptions: { where: { date: target }, select: { type: true, startTime: true, endTime: true } },
    },
  });
  if (!doctor) return { error: "Médico não encontrado." };

  const rule = doctor.schedules.find((item) => item.weekday === toZonedTime(target, CLINIC_TZ).getDay()) as WeeklyRule | undefined;
  const dayEnd = fromZonedTime(`${formatInTimeZone(addDays(target, 1), CLINIC_TZ, "yyyy-MM-dd")}T00:00:00`, CLINIC_TZ);
  const busy = await prisma.appointment.findMany({
    where: { doctorId, clinicId: context.clinicId, status: { notIn: ["CANCELADA", "NAO_COMPARECEU"] }, startAt: { gte: target, lt: dayEnd } },
    select: { startAt: true, endAt: true },
  });
  const slots = generateDaySlots(
    target,
    rule,
    doctor.availabilityExceptions.map((item) => ({ type: item.type, startTime: item.startTime, endTime: item.endTime })),
    busy.map((item) => ({ start: item.startAt, end: item.endAt })),
    CLINIC_TZ,
  ).filter((slot) => !slot.taken && slot.start.getTime() > Date.now() + 2 * 60_000)
    .map((slot) => ({ start: slot.start.toISOString(), label: formatInTimeZone(slot.start, CLINIC_TZ, "HH:mm") }));
  return { slots };
}

export async function createPatientAppointment(context: PatientPortalContext, input: unknown) {
  const parsed = bookingSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const data = parsed.data;
  const startAt = new Date(data.startAt);
  const clinicDate = formatInTimeZone(startAt, CLINIC_TZ, "yyyy-MM-dd");
  const availability = await getPatientDoctorAvailability(context, data.doctorId, clinicDate);
  if ("error" in availability) return availability;
  if (!availability.slots.some((slot) => slot.start === startAt.toISOString())) return { error: "O horário selecionado já não está disponível." };

  const doctor = await prisma.doctor.findFirst({
    where: { id: data.doctorId, clinicId: context.clinicId, status: "ACTIVO" },
    select: { id: true, branchId: true, specialtyId: true, consultationPrice: true, consultationDuration: true },
  });
  if (!doctor) return { error: "Médico não encontrado." };

  let serviceId: string | null = null;
  let priceQuoted = doctor.consultationPrice;
  if (data.type === "EXAME" || data.type === "PROCEDIMENTO") {
    if (!data.serviceId) return { error: "Selecione o exame ou procedimento." };
    const service = await prisma.service.findFirst({ where: { id: data.serviceId, clinicId: context.clinicId, isActive: true, source: data.type }, select: { id: true, basePrice: true } });
    if (!service) return { error: "Exame ou procedimento inválido." };
    serviceId = service.id;
    priceQuoted = service.basePrice;
  }

  let patientHealthPlanId: string | null = null;
  let healthPlanId: string | null = null;
  if (data.patientHealthPlanId) {
    const planLink = await prisma.patientHealthPlan.findFirst({
      where: { id: data.patientHealthPlanId, patientId: context.patientId, clinicId: context.clinicId, healthPlan: { isActive: true }, OR: [{ validUntil: null }, { validUntil: { gte: fromZonedTime(`${clinicDate}T00:00:00`, CLINIC_TZ) } }] },
      select: { id: true, healthPlanId: true, healthPlan: { select: { contractPrice: true } } },
    });
    if (!planLink) return { error: "O plano selecionado não é válido para este paciente." };
    const accepted = await prisma.doctorHealthPlan.findUnique({ where: { doctorId_healthPlanId: { doctorId: doctor.id, healthPlanId: planLink.healthPlanId } }, select: { doctorId: true } });
    if (!accepted) return { error: "O médico selecionado não aceita este plano." };
    patientHealthPlanId = planLink.id;
    healthPlanId = planLink.healthPlanId;
    priceQuoted = planLink.healthPlan.contractPrice;
  }

  const endAt = addMinutes(startAt, doctor.consultationDuration);
  const conflicting = await prisma.appointment.count({
    where: { doctorId: doctor.id, status: { notIn: ["CANCELADA", "NAO_COMPARECEU"] }, startAt: { lt: endAt }, endAt: { gt: startAt } },
  });
  if (conflicting) return { error: "O horário selecionado já não está disponível." };

  const appointment = await prisma.$transaction(async (tx) => {
    const created = await tx.appointment.create({
      data: {
        clinicId: context.clinicId, branchId: doctor.branchId, patientId: context.patientId,
        doctorId: doctor.id, specialtyId: doctor.specialtyId, patientHealthPlanId, healthPlanId,
        isPrivate: !healthPlanId, type: data.type, serviceId, status: "MARCADA", startAt, endAt,
        priceQuoted, reason: data.reason || null,
      },
      select: { id: true },
    });
    await tx.consultation.create({ data: { clinicId: context.clinicId, appointmentId: created.id, patientId: context.patientId, doctorId: doctor.id, startedAt: startAt } });
    return created;
  });
  await audit({ clinicId: context.clinicId, action: "patient_portal.appointment_create", entity: "Appointment", entityId: appointment.id, metadata: { patientId: context.patientId, doctorId: doctor.id, startAt: startAt.toISOString() } });
  return { id: appointment.id };
}

export async function cancelPatientAppointment(context: PatientPortalContext, appointmentId: string) {
  const appointment = await prisma.appointment.findFirst({
    where: { id: appointmentId, patientId: context.patientId, clinicId: context.clinicId },
    select: { id: true, status: true, startAt: true },
  });
  if (!appointment) return { error: "Marcação não encontrada." };
  if (!["MARCADA", "CONFIRMADA"].includes(appointment.status) || appointment.startAt <= new Date()) return { error: "Esta marcação já não pode ser cancelada pelo portal." };
  await prisma.appointment.update({ where: { id: appointment.id }, data: { status: "CANCELADA", cancelReason: "Cancelada pelo paciente através do portal" } });
  await audit({ clinicId: context.clinicId, action: "patient_portal.appointment_cancel", entity: "Appointment", entityId: appointment.id, metadata: { patientId: context.patientId } });
  return { ok: true };
}

export async function updatePatientPortalProfile(context: PatientPortalContext, input: unknown) {
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const clean = (value: string | null | undefined) => value?.trim() || null;
  await prisma.patient.update({
    where: { id: context.patientId, clinicId: context.clinicId },
    data: {
      ...(parsed.data.phone !== undefined ? { phone: clean(parsed.data.phone) } : {}),
      ...(parsed.data.email !== undefined ? { email: clean(parsed.data.email) } : {}),
      ...(parsed.data.address !== undefined ? { address: clean(parsed.data.address) } : {}),
      ...(parsed.data.emergencyContactName !== undefined ? { emergencyContactName: clean(parsed.data.emergencyContactName) } : {}),
      ...(parsed.data.emergencyContactPhone !== undefined ? { emergencyContactPhone: clean(parsed.data.emergencyContactPhone) } : {}),
    },
  });
  await audit({ clinicId: context.clinicId, action: "patient_portal.profile_update", entity: "Patient", entityId: context.patientId });
  return { ok: true };
}
