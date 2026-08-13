import "server-only";
import {
  startOfWeek, endOfWeek, startOfMonth, endOfMonth, subMonths,
  eachDayOfInterval, isWeekend, format,
} from "date-fns";
import { prisma } from "@/lib/prisma";
import { pct } from "@/lib/utils";
import { computeOccupancy, type AppointmentFact } from "@/lib/domain/occupancy";

const SLOTS_PER_DAY = 13;
const SLOT_MIN = 30;

function weekdays(from: Date, to: Date): number {
  if (to < from) return 0;
  return eachDayOfInterval({ start: from, end: to }).filter((d) => !isWeekend(d)).length;
}

export interface DoctorCard {
  id: string;
  name: string;
  specialty: string;
  color: string;
  occupancy: number;
  consultas: number;
  receita: number;
  noShowRate: number;
  availableHours: number;
}

export async function getDoctorCards(clinicId: string): Promise<DoctorCard[]> {
  const now = new Date();
  const wStart = startOfWeek(now, { weekStartsOn: 1 });
  const wEnd = endOfWeek(now, { weekStartsOn: 1 });
  const elapsed = weekdays(wStart, now);
  const capToDate = elapsed * SLOTS_PER_DAY;
  const capWeek = 5 * SLOTS_PER_DAY;

  const [doctors, appts, revenue] = await Promise.all([
    prisma.doctor.findMany({
      where: { clinicId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, specialty: { select: { name: true, color: true } } },
    }),
    prisma.appointment.findMany({
      where: { clinicId, startAt: { gte: wStart, lte: wEnd } },
      select: { doctorId: true, status: true, startAt: true },
    }),
    prisma.revenue.groupBy({
      by: ["doctorId"],
      where: { clinicId, recognisedAt: { gte: wStart, lte: wEnd } },
      _sum: { amount: true },
    }),
  ]);

  const revMap = new Map(revenue.map((r) => [r.doctorId, r._sum.amount ?? 0]));

  return doctors
    .map((d) => {
      const mine = appts.filter((a) => a.doctorId === d.id);
      const active = mine.filter((a) => !["CANCELADA", "NAO_COMPARECEU"].includes(a.status));
      const activeToDate = active.filter((a) => a.startAt <= now).length;
      const scheduled = mine.filter((a) => a.status !== "CANCELADA").length;
      const noShows = mine.filter((a) => a.status === "NAO_COMPARECEU").length;
      const consultas = mine.filter((a) => a.status === "CONCLUIDA").length;
      const remainingSlots = Math.max(0, capWeek - active.length);
      return {
        id: d.id,
        name: d.name,
        specialty: d.specialty.name,
        color: d.specialty.color,
        occupancy: Math.min(100, pct(activeToDate, capToDate)),
        consultas,
        receita: revMap.get(d.id) ?? 0,
        noShowRate: pct(noShows, scheduled),
        availableHours: Math.round((remainingSlots * SLOT_MIN) / 60),
      };
    })
    .sort((a, b) => b.occupancy - a.occupancy);
}

// Time blocks for the capacity heatmap and their slot capacity per weekday.
const BLOCKS = [
  { label: "08–10", from: 8, to: 10, slots: 4 },
  { label: "10–12", from: 10, to: 12, slots: 4 },
  { label: "12–14", from: 12, to: 14, slots: 2 }, // lunch 12:30–13:30
  { label: "14–16", from: 14, to: 16, slots: 4 },
];
const WD = ["Seg", "Ter", "Qua", "Qui", "Sex"];

export async function getDoctorDetail(clinicId: string, doctorId: string) {
  const doctor = await prisma.doctor.findFirst({
    where: { id: doctorId, clinicId },
    include: { specialty: true, schedules: { orderBy: { weekday: "asc" } } },
  });
  if (!doctor) return null;

  const now = new Date();
  const mStart = startOfMonth(now);
  const mEnd = endOfMonth(now);

  const [monthAppts, monthRevenue] = await Promise.all([
    prisma.appointment.findMany({
      where: { doctorId, clinicId, startAt: { gte: mStart, lte: mEnd } },
      select: { status: true, startAt: true },
    }),
    prisma.revenue.aggregate({
      where: { doctorId, clinicId, recognisedAt: { gte: mStart, lte: mEnd } },
      _sum: { amount: true },
    }),
  ]);

  const elapsed = weekdays(mStart, now);
  const facts: AppointmentFact[] = monthAppts
    .filter((a) => a.startAt <= now)
    .map((a) => ({ status: a.status, durationMin: SLOT_MIN, revenueCentavos: 0 }));

  const metrics = computeOccupancy({
    availableMinutes: elapsed * SLOTS_PER_DAY * SLOT_MIN,
    availableSlots: elapsed * SLOTS_PER_DAY,
    slotMinutes: SLOT_MIN,
    appointments: facts,
    distinctDays: elapsed,
  });
  const receita = monthRevenue._sum.amount ?? 0;

  // Heatmap over the last 4 weeks
  const hmStart = new Date(now.getTime() - 28 * 86400000);
  const hmAppts = await prisma.appointment.findMany({
    where: { doctorId, clinicId, startAt: { gte: hmStart, lte: now }, status: { notIn: ["CANCELADA", "NAO_COMPARECEU"] } },
    select: { startAt: true },
  });
  // count weekday occurrences in window
  const weekdayCount = [0, 0, 0, 0, 0]; // Mon..Fri
  for (const day of eachDayOfInterval({ start: hmStart, end: now })) {
    const wd = day.getDay();
    if (wd >= 1 && wd <= 5) weekdayCount[wd - 1]++;
  }
  const heat = WD.map((label, col) => ({
    label,
    cells: BLOCKS.map((b) => {
      const booked = hmAppts.filter((a) => {
        const h = a.startAt.getHours() + 2; // UTC -> Maputo
        return a.startAt.getDay() === col + 1 && h >= b.from && h < b.to;
      }).length;
      const capacity = b.slots * (weekdayCount[col] || 1);
      return Math.min(100, pct(booked, capacity));
    }),
  }));

  // Monthly trend (6 months) of completed consultations
  const trendStart = startOfMonth(subMonths(now, 5));
  const trendAppts = await prisma.appointment.findMany({
    where: { doctorId, clinicId, startAt: { gte: trendStart }, status: "CONCLUIDA" },
    select: { startAt: true },
  });
  const months = Array.from({ length: 6 }, (_, i) => subMonths(now, 5 - i)).map((d) => format(d, "yyyy-MM"));
  const byMonth = new Map(months.map((m) => [m, 0]));
  for (const a of trendAppts) {
    const k = format(a.startAt, "yyyy-MM");
    if (byMonth.has(k)) byMonth.set(k, byMonth.get(k)! + 1);
  }
  const trend = months.map((m) => ({
    label: format(new Date(m + "-01"), "LLL").replace(/^./, (c) => c.toUpperCase()),
    value: byMonth.get(m)!,
  }));

  return {
    doctor: {
      id: doctor.id,
      name: doctor.name,
      specialty: doctor.specialty.name,
      color: doctor.specialty.color,
      phone: doctor.phone,
      email: doctor.email,
      license: doctor.licenseNumber,
      price: doctor.consultationPrice,
      duration: doctor.consultationDuration,
      status: doctor.status,
      schedules: doctor.schedules,
    },
    metrics,
    receita,
    blocks: BLOCKS.map((b) => b.label),
    heat,
    trend,
  };
}
