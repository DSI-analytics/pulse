import "server-only";
import {
  startOfMonth,
  endOfMonth,
  subMonths,
  eachDayOfInterval,
  isWeekend,
  format,
  differenceInYears,
  subYears,
  startOfDay,
} from "date-fns";
import { prisma } from "@/lib/prisma";
import { dayRange } from "@/lib/datetime";
import { pct } from "@/lib/utils";
import {
  percentage,
  proportionConfidenceInterval,
  summarizeDistribution,
} from "@/lib/analytics-statistics";
import type { AppointmentType, Prisma } from "@prisma/client";

const SLOTS_PER_DAY = 13; // see seed SLOTS

function weekdaysBetween(from: Date, to: Date): number {
  if (to < from) return 0;
  return eachDayOfInterval({ start: from, end: to }).filter((d) => !isWeekend(d)).length;
}

async function sumRevenue(clinicId: string, gte: Date, lte: Date): Promise<number> {
  const r = await prisma.revenue.aggregate({
    where: { clinicId, recognisedAt: { gte, lte } },
    _sum: { amount: true },
  });
  return r._sum.amount ?? 0;
}

async function sumExpenses(clinicId: string, gte: Date, lte: Date): Promise<number> {
  const r = await prisma.expense.aggregate({
    where: { clinicId, incurredAt: { gte, lte } },
    _sum: { amount: true },
  });
  return r._sum.amount ?? 0;
}

export async function getDashboardData(clinicId: string) {
  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);
  const prevStart = startOfMonth(subMonths(now, 1));
  // Fair month-to-date comparison: same elapsed span in the previous month.
  const prevMtdEnd = subMonths(now, 1);
  const { start: todayStart, end: todayEnd } = dayRange(now);

  const [
    revenueMonth,
    revenuePrev,
    expenseMonth,
    todaysAppointments,
    activeDoctors,
    receivablesAgg,
    apptMonthCount,
    apptPrevCount,
  ] = await Promise.all([
    sumRevenue(clinicId, monthStart, monthEnd),
    sumRevenue(clinicId, prevStart, prevMtdEnd),
    sumExpenses(clinicId, monthStart, now),
    prisma.appointment.findMany({
      where: { clinicId, startAt: { gte: todayStart, lte: todayEnd } },
      orderBy: { startAt: "asc" },
      select: {
        id: true, startAt: true, status: true, type: true, isPrivate: true,
        patient: { select: { name: true } },
        doctor: { select: { name: true } },
        specialty: { select: { name: true, color: true } },
        healthPlan: { select: { name: true, insuranceCompany: { select: { name: true } } } },
      },
    }),
    prisma.doctor.count({ where: { clinicId, status: "ACTIVO" } }),
    prisma.invoice.aggregate({
      where: { clinicId, status: { in: ["EMITIDA", "PARCIAL"] } },
      _sum: { total: true, amountPaid: true },
    }),
    prisma.appointment.count({ where: { clinicId, startAt: { gte: monthStart, lte: now }, status: { not: "CANCELADA" } } }),
    prisma.appointment.count({ where: { clinicId, startAt: { gte: prevStart, lte: prevMtdEnd }, status: { not: "CANCELADA" } } }),
  ]);

  // KPI: today
  const attendedToday = todaysAppointments.filter((a) =>
    ["CHEGOU", "EM_ESPERA", "EM_CONSULTA", "CONCLUIDA"].includes(a.status),
  ).length;
  const consultasHoje = todaysAppointments.filter((a) => a.status !== "CANCELADA").length;

  // KPI: occupancy (clinic-wide fill rate this month to date)
  const weekdaysToDate = weekdaysBetween(monthStart, now);
  const availableSlots = activeDoctors * weekdaysToDate * SLOTS_PER_DAY;
  const occupancy = pct(apptMonthCount, availableSlots);

  const receivables = (receivablesAgg._sum.total ?? 0) - (receivablesAgg._sum.amountPaid ?? 0);
  const resultMonth = revenueMonth - expenseMonth;

  const deltaRevenue = revenuePrev ? ((revenueMonth - revenuePrev) / revenuePrev) * 100 : 0;
  const deltaAppt = apptPrevCount ? ((apptMonthCount - apptPrevCount) / apptPrevCount) * 100 : 0;

  // Doctor occupancy table (this month)
  const [apptByDoctor, revByDoctor, doctors] = await Promise.all([
    prisma.appointment.groupBy({
      by: ["doctorId"],
      where: { clinicId, startAt: { gte: monthStart, lte: now }, status: { not: "CANCELADA" } },
      _count: { _all: true },
    }),
    prisma.revenue.groupBy({
      by: ["doctorId"],
      where: { clinicId, recognisedAt: { gte: monthStart, lte: monthEnd } },
      _sum: { amount: true },
    }),
    prisma.doctor.findMany({
      where: { clinicId },
      select: { id: true, name: true, specialty: { select: { name: true, color: true } } },
    }),
  ]);
  const completedByDoctor = await prisma.appointment.groupBy({
    by: ["doctorId"],
    where: { clinicId, startAt: { gte: monthStart, lte: monthEnd }, status: "CONCLUIDA" },
    _count: { _all: true },
  });
  const apptMap = new Map(apptByDoctor.map((r) => [r.doctorId, r._count._all]));
  const revMap = new Map(revByDoctor.map((r) => [r.doctorId, r._sum.amount ?? 0]));
  const compMap = new Map(completedByDoctor.map((r) => [r.doctorId, r._count._all]));
  const perDoctorCapacity = weekdaysToDate * SLOTS_PER_DAY;

  const doctorOccupancy = doctors
    .map((d) => ({
      id: d.id,
      name: d.name,
      specialty: d.specialty.name,
      color: d.specialty.color,
      occupancy: Math.min(100, pct(apptMap.get(d.id) ?? 0, perDoctorCapacity)),
      consultas: compMap.get(d.id) ?? 0,
      receita: revMap.get(d.id) ?? 0,
    }))
    .sort((a, b) => b.occupancy - a.occupancy);

  // Monthly trends (6 months)
  const trendStart = startOfMonth(subMonths(now, 5));
  const [revTrendRows, apptTrendRows] = await Promise.all([
    prisma.revenue.findMany({
      where: { clinicId, recognisedAt: { gte: trendStart } },
      select: { amount: true, recognisedAt: true },
    }),
    prisma.appointment.findMany({
      where: { clinicId, startAt: { gte: trendStart }, status: { not: "CANCELADA" } },
      select: { startAt: true },
    }),
  ]);
  const months = Array.from({ length: 6 }, (_, i) => subMonths(now, 5 - i)).map((d) => ({
    key: format(d, "yyyy-MM"),
    label: format(d, "LLL"),
  }));
  const revByMonth = new Map(months.map((m) => [m.key, 0]));
  for (const r of revTrendRows) {
    const k = format(r.recognisedAt, "yyyy-MM");
    if (revByMonth.has(k)) revByMonth.set(k, revByMonth.get(k)! + r.amount);
  }
  const apptByMonth = new Map(months.map((m) => [m.key, 0]));
  for (const a of apptTrendRows) {
    const k = format(a.startAt, "yyyy-MM");
    if (apptByMonth.has(k)) apptByMonth.set(k, apptByMonth.get(k)! + 1);
  }
  const revenueTrend = months.map((m) => ({ label: capitalize(m.label), value: revByMonth.get(m.key)! }));
  const appointmentTrend = months.map((m) => ({ label: capitalize(m.label), value: apptByMonth.get(m.key)! }));

  // Revenue by specialty & plan (this month)
  const [revBySpec, revByPlan] = await Promise.all([
    prisma.revenue.groupBy({
      by: ["specialtyId"],
      where: { clinicId, recognisedAt: { gte: monthStart, lte: monthEnd }, specialtyId: { not: null } },
      _sum: { amount: true },
    }),
    prisma.revenue.groupBy({
      by: ["healthPlanId"],
      where: { clinicId, recognisedAt: { gte: monthStart, lte: monthEnd } },
      _sum: { amount: true },
    }),
  ]);
  const specMeta = new Map(
    (await prisma.specialty.findMany({ where: { clinicId }, select: { id: true, name: true, color: true } })).map(
      (s) => [s.id, s],
    ),
  );
  const bySpecialty = revBySpec
    .map((r) => ({
      label: specMeta.get(r.specialtyId!)?.name ?? "—",
      color: specMeta.get(r.specialtyId!)?.color ?? "#0C7C74",
      value: r._sum.amount ?? 0,
    }))
    .sort((a, b) => b.value - a.value);

  const planMeta = new Map(
    (
      await prisma.healthPlan.findMany({
        where: { clinicId },
        select: { id: true, name: true, insuranceCompany: { select: { name: true } } },
      })
    ).map((p) => [p.id, `${p.insuranceCompany.name} · ${p.name}`]),
  );
  const byPlan = revByPlan
    .map((r) => ({
      label: r.healthPlanId ? planMeta.get(r.healthPlanId) ?? "Plano" : "Particular",
      value: r._sum.amount ?? 0,
    }))
    .sort((a, b) => b.value - a.value);

  return {
    kpis: {
      consultasHoje,
      pacientesHoje: attendedToday,
      revenueMonth,
      deltaRevenue,
      occupancy,
      receivables,
      resultMonth,
      apptMonthCount,
      deltaAppt,
    },
    todaysAppointments,
    doctorOccupancy,
    revenueTrend,
    appointmentTrend,
    bySpecialty,
    byPlan,
  };
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export interface DashboardFilters {
  from: Date;
  to: Date;
  doctorId?: string;
  specialtyId?: string;
  appointmentType?: AppointmentType;
  payer?: "private" | "insured";
}

const TYPE_LABEL: Record<AppointmentType, string> = {
  CONSULTA: "Primeira consulta",
  RETORNO: "Seguimento",
  EXAME: "Exame",
  PROCEDIMENTO: "Procedimento",
};

function minutesBetween(start: Date, end: Date) {
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60_000));
}

function clockMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function ageBand(birthDate: Date | null, at: Date) {
  if (!birthDate) return "Não registada";
  const age = differenceInYears(at, birthDate);
  if (age < 18) return "0–17";
  if (age < 35) return "18–34";
  if (age < 50) return "35–49";
  if (age < 65) return "50–64";
  return "65+";
}

function countLabels(values: string[]) {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

export async function getDashboardFilterOptions(clinicId: string) {
  const [doctors, specialties] = await Promise.all([
    prisma.doctor.findMany({
      where: { clinicId, status: "ACTIVO" },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.specialty.findMany({
      where: { clinicId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);
  return { doctors, specialties };
}

export async function getGroupedDashboardData(
  clinicId: string,
  filters: DashboardFilters,
  { includeFinancials = true }: { includeFinancials?: boolean } = {},
) {
  const { from, to, doctorId, specialtyId, appointmentType, payer } = filters;
  const durationMs = Math.max(0, to.getTime() - from.getTime());
  const previousTo = new Date(from.getTime() - 1);
  const previousFrom = new Date(previousTo.getTime() - durationMs);

  const appointmentWhere: Prisma.AppointmentWhereInput = {
    clinicId,
    startAt: { gte: from, lte: to },
    ...(doctorId ? { doctorId } : {}),
    ...(specialtyId ? { specialtyId } : {}),
    ...(appointmentType ? { type: appointmentType } : {}),
    ...(payer === "private" ? { healthPlanId: null } : payer === "insured" ? { healthPlanId: { not: null } } : {}),
  };
  const revenueWhere: Prisma.RevenueWhereInput = {
    clinicId,
    recognisedAt: { gte: from, lte: to },
    ...(doctorId ? { doctorId } : {}),
    ...(specialtyId ? { specialtyId } : {}),
    ...(payer === "private" ? { healthPlanId: null } : payer === "insured" ? { healthPlanId: { not: null } } : {}),
    ...(appointmentType ? { appointment: { type: appointmentType } } : {}),
  };
  const doctorWhere: Prisma.DoctorWhereInput = {
    clinicId,
    ...(doctorId ? { id: doctorId } : {}),
    ...(specialtyId ? { specialtyId } : {}),
  };

  const [appointments, revenues, expenses, invoices, doctors, previousCompleted, priorYearCompleted] = await Promise.all([
    prisma.appointment.findMany({
      where: appointmentWhere,
      select: {
        id: true, patientId: true, doctorId: true, specialtyId: true, type: true, status: true,
        startAt: true, endAt: true, checkedInAt: true, healthPlanId: true,
        patient: { select: { gender: true, birthDate: true } },
        doctor: { select: { name: true } },
        specialty: { select: { name: true, color: true } },
        consultation: { select: { startedAt: true, endedAt: true, subjective: true, notes: true, diagnosis: true, prescription: true } },
      },
    }),
    includeFinancials ? prisma.revenue.findMany({
      where: revenueWhere,
      select: { amount: true, patientId: true, specialtyId: true, healthPlanId: true, appointment: { select: { type: true } }, specialty: { select: { name: true, color: true } } },
    }) : Promise.resolve([]),
    includeFinancials ? prisma.expense.aggregate({
      where: { clinicId, incurredAt: { gte: from, lte: to }, status: { not: "ANULADA" } },
      _sum: { amount: true },
    }) : Promise.resolve({ _sum: { amount: null } }),
    includeFinancials ? prisma.invoice.findMany({
      where: {
        clinicId, issuedAt: { gte: from, lte: to }, status: { notIn: ["RASCUNHO", "ANULADA"] },
        ...(payer === "private" ? { healthPlanId: null } : payer === "insured" ? { healthPlanId: { not: null } } : {}),
        ...(doctorId || specialtyId || appointmentType ? { appointment: {
          ...(doctorId ? { doctorId } : {}), ...(specialtyId ? { specialtyId } : {}), ...(appointmentType ? { type: appointmentType } : {}),
        } } : {}),
      },
      select: { total: true, amountPaid: true, dueAt: true, issuedAt: true, healthPlanId: true, payments: { select: { amount: true, fromInsurer: true, receivedAt: true } } },
    }) : Promise.resolve([]),
    prisma.doctor.findMany({
      where: doctorWhere,
      select: {
        id: true,
        schedules: { select: { weekday: true, startTime: true, endTime: true, breakStart: true, breakEnd: true, slotMinutes: true } },
        availabilityExceptions: { where: { date: { gte: from, lte: to } }, select: { date: true, type: true, startTime: true, endTime: true } },
      },
    }),
    prisma.appointment.count({
      where: { ...appointmentWhere, startAt: { gte: previousFrom, lte: previousTo }, status: "CONCLUIDA" },
    }),
    prisma.appointment.count({
      where: { ...appointmentWhere, startAt: { gte: subYears(from, 1), lte: subYears(to, 1) }, status: "CONCLUIDA" },
    }),
  ]);

  const scheduled = appointments.filter((item) => item.status !== "CANCELADA");
  const completed = appointments.filter((item) => item.status === "CONCLUIDA");
  const elapsedCutoff = to < new Date() ? to : new Date();
  const elapsedScheduled = scheduled.filter((item) => item.startAt <= elapsedCutoff);
  const noShows = elapsedScheduled.filter((item) => item.status === "NAO_COMPARECEU");
  const uniquePatients = new Map(scheduled.map((item) => [item.patientId, item.patient]));
  const waits = completed.flatMap((item) => item.checkedInAt && item.consultation?.startedAt
    ? [minutesBetween(item.checkedInAt, item.consultation.startedAt)] : []);
  const durations = completed.flatMap((item) => item.consultation?.endedAt
    ? [minutesBetween(item.consultation.startedAt, item.consultation.endedAt)] : []);
  const wait = summarizeDistribution(waits);
  const consultationDuration = summarizeDistribution(durations);

  let availableMinutes = 0;
  let availableSlots = 0;
  const days = eachDayOfInterval({ start: from, end: to });
  for (const doctor of doctors) {
    const exceptions = new Map(doctor.availabilityExceptions.map((item) => [format(item.date, "yyyy-MM-dd"), item]));
    for (const day of days) {
      const schedule = doctor.schedules.find((item) => item.weekday === day.getDay());
      if (!schedule) continue;
      const exception = exceptions.get(format(day, "yyyy-MM-dd"));
      if (exception && exception.type !== "HORARIO_ESPECIAL") continue;
      const start = exception?.startTime ?? schedule.startTime;
      const end = exception?.endTime ?? schedule.endTime;
      let minutes = Math.max(0, clockMinutes(end) - clockMinutes(start));
      if (!exception && schedule.breakStart && schedule.breakEnd) {
        minutes -= Math.max(0, clockMinutes(schedule.breakEnd) - clockMinutes(schedule.breakStart));
      }
      availableMinutes += minutes;
      availableSlots += Math.floor(minutes / schedule.slotMinutes);
    }
  }

  const occupied = scheduled.filter((item) => item.status !== "NAO_COMPARECEU").length;
  const firstConsultations = scheduled.filter((item) => item.type === "CONSULTA").length;
  const followUps = scheduled.filter((item) => item.type === "RETORNO").length;
  const followUpNoShows = scheduled.filter((item) => item.type === "RETORNO" && item.status === "NAO_COMPARECEU").length;
  const examsRequested = scheduled.filter((item) => item.type === "EXAME").length;
  const examsCompleted = completed.filter((item) => item.type === "EXAME").length;
  const noShowCi = proportionConfidenceInterval(noShows.length, elapsedScheduled.length);
  const totalRevenue = revenues.reduce((sum, item) => sum + item.amount, 0);
  const totalExpenses = expenses._sum.amount ?? 0;
  const result = totalRevenue - totalExpenses;
  const costsScoped = !doctorId && !specialtyId && !appointmentType && !payer;
  const overdueInvoices = invoices.filter((item) => item.dueAt && item.dueAt < to && item.amountPaid < item.total);
  const outstandingInvoices = invoices.filter((item) => item.amountPaid < item.total);
  const insurerReceiptDays = invoices.flatMap((invoice) => invoice.payments
    .filter((payment) => payment.fromInsurer)
    .map((payment) => minutesBetween(invoice.issuedAt, payment.receivedAt) / (60 * 24)));
  const receiptTime = summarizeDistribution(insurerReceiptDays);
  const clinicalRecords = completed.flatMap((item) => item.consultation ? [item.consultation] : []);
  const completeRecords = clinicalRecords.filter((record) =>
    [record.subjective, record.diagnosis, record.prescription, record.notes].every((value) => Boolean(value?.trim())),
  ).length;

  const bySpecialty = countLabels(scheduled.map((item) => item.specialty.name)).map((item) => ({
    ...item,
    color: appointments.find((appointment) => appointment.specialty.name === item.label)?.specialty.color ?? "#0C7C74",
  }));
  const diagnoses = countLabels(clinicalRecords.flatMap((record) => record.diagnosis?.trim() ? [record.diagnosis.trim()] : [])).slice(0, 10);
  const revenueSpecialtyMap = new Map<string, { label: string; value: number; color: string }>();
  for (const item of revenues) {
    const label = item.specialty?.name ?? "Sem especialidade";
    const current = revenueSpecialtyMap.get(label) ?? { label, value: 0, color: item.specialty?.color ?? "#0C7C74" };
    current.value += item.amount;
    revenueSpecialtyMap.set(label, current);
  }
  const privateRevenue = revenues.filter((item) => !item.healthPlanId).reduce((sum, item) => sum + item.amount, 0);
  const insuredRevenue = totalRevenue - privateRevenue;
  const completedDelta = completed.length - previousCompleted;
  const completedConsultations = completed.filter((item) => item.type === "CONSULTA" || item.type === "RETORNO").length;
  const consultationRevenue = revenues
    .filter((item) => item.appointment?.type === "CONSULTA" || item.appointment?.type === "RETORNO")
    .reduce((sum, item) => sum + item.amount, 0);
  const trailingStart = new Date(Math.max(from.getTime(), startOfDay(new Date(to.getTime() - 6 * 86_400_000)).getTime()));
  const trailingDays = Math.max(1, Math.round((startOfDay(to).getTime() - trailingStart.getTime()) / 86_400_000) + 1);
  const trailingCompleted = completed.filter((item) => item.startAt >= trailingStart).length;

  return {
    period: { from, to },
    base: {
      scheduled: scheduled.length,
      completed: completed.length,
      uniquePatients: uniquePatients.size,
      completionRate: percentage(completed.length, scheduled.length),
      completedDelta,
      completedDeltaPct: previousCompleted ? percentage(completedDelta, previousCompleted) : null,
      completedYoYPct: priorYearCompleted ? percentage(completed.length - priorYearCompleted, priorYearCompleted) : null,
      movingAverage7d: Math.round((trailingCompleted / trailingDays) * 10) / 10,
      byType: countLabels(scheduled.map((item) => TYPE_LABEL[item.type])),
      byGender: countLabels([...uniquePatients.values()].map((patient) => patient.gender === "FEMININO" ? "Feminino" : patient.gender === "MASCULINO" ? "Masculino" : patient.gender === "OUTRO" ? "Outro" : "Não registado")),
      byAge: countLabels([...uniquePatients.values()].map((patient) => ageBand(patient.birthDate, to))),
      wait,
    },
    care: {
      firstConsultations,
      followUps,
      returnRate: percentage(followUps, firstConsultations + followUps),
      followUpAbandonmentRate: percentage(followUpNoShows, followUps),
      followUpNoShows,
      diagnoses,
      examsRequested,
      examsCompleted,
      examCoverage: percentage(examsCompleted, examsRequested),
      bySpecialty,
    },
    operations: {
      wait,
      consultationDuration,
      noShows: noShows.length,
      noShowDenominator: elapsedScheduled.length,
      noShowRate: percentage(noShows.length, elapsedScheduled.length),
      noShowCi,
      occupied,
      availableSlots,
      occupancyRate: percentage(occupied, availableSlots),
      completedPerDay: days.length ? Math.round((completed.length / days.length) * 10) / 10 : 0,
      completedPerClinicalHour: availableMinutes ? Math.round((completed.length / (availableMinutes / 60)) * 100) / 100 : 0,
    },
    finance: {
      revenue: totalRevenue,
      expenses: totalExpenses,
      result,
      costsScoped,
      margin: costsScoped ? percentage(result, totalRevenue) : null,
      revenuePerConsultation: completedConsultations ? Math.round(consultationRevenue / completedConsultations) : 0,
      completedConsultations,
      consultationRevenue,
      revenuePerPatient: uniquePatients.size ? Math.round(totalRevenue / uniquePatients.size) : 0,
      costPerAttendance: costsScoped && completed.length ? Math.round(totalExpenses / completed.length) : null,
      payerMix: [
        { label: "Particular", value: privateRevenue },
        { label: "Seguradora / convénio", value: insuredRevenue },
      ].filter((item) => item.value > 0),
      bySpecialty: [...revenueSpecialtyMap.values()].sort((a, b) => b.value - a.value),
      overdueInvoices: overdueInvoices.length,
      outstandingInvoices: outstandingInvoices.length,
      delinquencyRate: percentage(overdueInvoices.length, outstandingInvoices.length),
      receiptTime,
    },
    quality: {
      clinicalRecords: clinicalRecords.length,
      completeRecords,
      completenessRate: percentage(completeRecords, clinicalRecords.length),
    },
  };
}
