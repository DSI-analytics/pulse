import "server-only";
import {
  startOfMonth,
  endOfMonth,
  subMonths,
  eachDayOfInterval,
  isWeekend,
  format,
} from "date-fns";
import { prisma } from "@/lib/prisma";
import { dayRange } from "@/lib/datetime";
import { pct } from "@/lib/utils";

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
