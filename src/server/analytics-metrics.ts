import "server-only";
import type { Permission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { pct } from "@/lib/utils";
import type { Formatters } from "@/lib/format";
import type { Translator } from "@/i18n/translate";
import type { MessageKey } from "@/i18n/types";
import {
  METRIC_IDS,
  PERIOD_KEYS,
  isMetricId,
  isPeriodKey,
  type MetricId,
  type PeriodKey,
} from "@/lib/domain/insights-catalog";
import { monthBuckets, resolvePeriod as resolveWindow, type PeriodWindow } from "@/lib/domain/insights-periods";

export { METRIC_IDS, PERIOD_KEYS, isMetricId, isPeriodKey };
export type { MetricId, PeriodKey };

/**
 * Catálogo controlado de métricas (§25).
 *
 * Esta é a **única** superfície através da qual o assistente de Insights lê
 * dados. Não existe execução de SQL enviado pelo modelo, nem acesso directo à
 * base de dados: o assistente escolhe um identificador desta lista e o
 * servidor executa a consulta correspondente, já limitada pela clínica e pela
 * permissão do utilizador autenticado. Só devolve agregados.
 */

export interface MetricContext extends PeriodWindow {
  clinicId: string;
  /** Fuso da clínica — dias, horas e meses são contados em hora local. */
  timeZone: string;
  t: Translator;
  f: Formatters;
}

export type MetricUnit = "count" | "currency" | "percent" | "minutes";

/** Como a métrica deve ser lida e desenhada. */
export type MetricShape = "value" | "ranking" | "distribution" | "peaks" | "series" | "list" | "growth";

export interface MetricSeriesPoint {
  label: string;
  value: number;
}

export interface MetricTable {
  columns: string[];
  rows: (string | number)[][];
}

export interface MetricResult {
  id: MetricId;
  label: string;
  unit: MetricUnit;
  shape: MetricShape;
  value: number;
  previousValue?: number;
  changePct?: number;
  series?: MetricSeriesPoint[];
  table?: MetricTable;
  note?: string;
  /** Nomes a destacar na resposta (ex.: artigos mais críticos). */
  highlights?: string[];
}

export interface MetricDefinition {
  id: MetricId;
  /** Descrição usada pelo modelo para escolher a métrica certa. */
  description: string;
  permission: Permission;
  unit: MetricUnit;
  shape: MetricShape;
  /** Situação actual — não depende do período pedido. */
  periodIndependent?: boolean;
  run: (ctx: MetricContext) => Promise<MetricResult>;
}

const MONTH_KEYS: MessageKey[] = [
  "insights.months.jan", "insights.months.feb", "insights.months.mar", "insights.months.apr",
  "insights.months.may", "insights.months.jun", "insights.months.jul", "insights.months.aug",
  "insights.months.sep", "insights.months.oct", "insights.months.nov", "insights.months.dec",
];
const WEEKDAY_KEYS: MessageKey[] = [
  "insights.weekdays.sun", "insights.weekdays.mon", "insights.weekdays.tue", "insights.weekdays.wed",
  "insights.weekdays.thu", "insights.weekdays.fri", "insights.weekdays.sat",
];
/** Segunda-feira primeiro, como na agenda. */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

const DAY_MS = 86_400_000;

/** Rótulo apresentado de uma métrica, no idioma activo. O `id` é o identificador estável. */
export function metricLabel(t: Translator, id: MetricId): string {
  return t(`insights.metrics.${id}`);
}

function change(current: number, previous: number): number | undefined {
  if (!previous) return undefined;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

/** Série mensal (meses locais da clínica), agregada na base de dados. */
async function monthlySeries(ctx: MetricContext, loader: (from: Date, to: Date) => Promise<number>): Promise<MetricSeriesPoint[]> {
  const buckets = monthBuckets(ctx.seriesEnd, ctx.seriesMonths, ctx.timeZone);
  return Promise.all(
    buckets.map(async (bucket) => ({
      label: `${ctx.t(MONTH_KEYS[bucket.month - 1])}/${String(bucket.year).slice(2)}`,
      value: await loader(bucket.from, bucket.to),
    })),
  );
}

const range = (ctx: MetricContext) => ({ gte: ctx.from, lte: ctx.to });
const previousRange = (ctx: MetricContext) => ({ gte: ctx.previousFrom, lte: ctx.previousTo });

async function revenueBetween(clinicId: string, recognisedAt: { gte: Date; lte: Date }): Promise<number> {
  const agg = await prisma.revenue.aggregate({ where: { clinicId, recognisedAt }, _sum: { amount: true } });
  return agg._sum.amount ?? 0;
}

async function expensesBetween(clinicId: string, incurredAt: { gte: Date; lte: Date }): Promise<{ total: number; count: number }> {
  const agg = await prisma.expense.aggregate({
    where: { clinicId, incurredAt, status: { not: "ANULADA" } },
    _sum: { amount: true },
    _count: { _all: true },
  });
  return { total: agg._sum.amount ?? 0, count: agg._count._all };
}

export const METRICS: Record<MetricId, MetricDefinition> = {
  // ── Pacientes ───────────────────────────────────────────────────────────
  "patients.total": {
    id: "patients.total",
    description: "Número total de pacientes activos registados na instituição (situação actual).",
    permission: "patient.view",
    unit: "count",
    shape: "value",
    periodIndependent: true,
    run: async (ctx) => {
      const value = await prisma.patient.count({ where: { clinicId: ctx.clinicId, isActive: true } });
      return { id: "patients.total", label: metricLabel(ctx.t, "patients.total"), unit: "count", shape: "value", value };
    },
  },

  "patients.new": {
    id: "patients.new",
    description: "Pacientes registados no período, comparado com o período anterior. Responde a perguntas sobre crescimento de pacientes.",
    permission: "patient.view",
    unit: "count",
    shape: "value",
    run: async (ctx) => {
      const [value, previousValue] = await Promise.all([
        prisma.patient.count({ where: { clinicId: ctx.clinicId, registeredAt: range(ctx) } }),
        prisma.patient.count({ where: { clinicId: ctx.clinicId, registeredAt: previousRange(ctx) } }),
      ]);
      return {
        id: "patients.new",
        label: metricLabel(ctx.t, "patients.new"),
        unit: "count",
        shape: "value",
        value,
        previousValue,
        changePct: change(value, previousValue),
      };
    },
  },

  "patients.active": {
    id: "patients.active",
    description: "Pacientes distintos com pelo menos uma marcação (não cancelada) no período.",
    permission: "patient.view",
    unit: "count",
    shape: "value",
    run: async (ctx) => {
      const [current, previous] = await Promise.all([
        prisma.appointment.groupBy({ by: ["patientId"], where: { clinicId: ctx.clinicId, startAt: range(ctx), status: { not: "CANCELADA" } } }),
        prisma.appointment.groupBy({ by: ["patientId"], where: { clinicId: ctx.clinicId, startAt: previousRange(ctx), status: { not: "CANCELADA" } } }),
      ]);
      return {
        id: "patients.active",
        label: metricLabel(ctx.t, "patients.active"),
        unit: "count",
        shape: "value",
        value: current.length,
        previousValue: previous.length,
        changePct: change(current.length, previous.length),
      };
    },
  },

  "patients.monthly_series": {
    id: "patients.monthly_series",
    description: "Série mensal de novos pacientes (3, 6 ou 12 meses, conforme o período).",
    permission: "patient.view",
    unit: "count",
    shape: "series",
    run: async (ctx) => {
      const series = await monthlySeries(ctx, (from, to) =>
        prisma.patient.count({ where: { clinicId: ctx.clinicId, registeredAt: { gte: from, lte: to } } }),
      );
      return {
        id: "patients.monthly_series",
        label: metricLabel(ctx.t, "patients.monthly_series"),
        unit: "count",
        shape: "series",
        value: series.reduce((sum, point) => sum + point.value, 0),
        series,
      };
    },
  },

  "patients.by_gender": {
    id: "patients.by_gender",
    description: "Distribuição dos pacientes activos por género/sexo (situação actual).",
    permission: "patient.view",
    unit: "count",
    shape: "distribution",
    periodIndependent: true,
    run: async (ctx) => {
      const rows = await prisma.patient.groupBy({
        by: ["gender"],
        where: { clinicId: ctx.clinicId, isActive: true },
        _count: { _all: true },
      });
      const total = rows.reduce((sum, row) => sum + row._count._all, 0);
      const points = rows
        .map((row) => ({ label: ctx.t(`dashboard.gender.${row.gender ?? "unknown"}`), value: row._count._all }))
        .sort((a, b) => b.value - a.value);
      return {
        id: "patients.by_gender",
        label: metricLabel(ctx.t, "patients.by_gender"),
        unit: "count",
        shape: "distribution",
        value: total,
        series: points,
        table: {
          columns: [ctx.t("insights.columns.gender"), ctx.t("insights.columns.patients"), "%"],
          rows: points.map((point) => [point.label, point.value, pct(point.value, total)]),
        },
        note: ctx.t("insights.notes.demographics"),
      };
    },
  },

  "patients.by_age_group": {
    id: "patients.by_age_group",
    description: "Distribuição dos pacientes activos por faixa etária (situação actual).",
    permission: "patient.view",
    unit: "count",
    shape: "distribution",
    periodIndependent: true,
    run: async (ctx) => {
      const rows = await prisma.$queryRaw<{ band: string; total: bigint }[]>`
        SELECT CASE
                 WHEN "birthDate" IS NULL THEN 'unknown'
                 WHEN date_part('year', age(CURRENT_DATE, "birthDate")) < 15 THEN 'child'
                 WHEN date_part('year', age(CURRENT_DATE, "birthDate")) < 25 THEN 'youth'
                 WHEN date_part('year', age(CURRENT_DATE, "birthDate")) < 45 THEN 'adult'
                 WHEN date_part('year', age(CURRENT_DATE, "birthDate")) < 65 THEN 'middle'
                 ELSE 'senior'
               END AS band,
               COUNT(*)::bigint AS total
        FROM "Patient"
        WHERE "clinicId" = ${ctx.clinicId} AND "isActive" = true
        GROUP BY 1
      `;
      const bands = ["child", "youth", "adult", "middle", "senior", "unknown"] as const;
      const byBand = new Map(rows.map((row) => [row.band, Number(row.total)]));
      const points = bands
        .map((band) => ({ label: ctx.t(`insights.ageGroups.${band}`), value: byBand.get(band) ?? 0 }))
        .filter((point) => point.value > 0);
      const total = points.reduce((sum, point) => sum + point.value, 0);
      return {
        id: "patients.by_age_group",
        label: metricLabel(ctx.t, "patients.by_age_group"),
        unit: "count",
        shape: "distribution",
        value: total,
        series: points,
        table: {
          columns: [ctx.t("insights.columns.ageGroup"), ctx.t("insights.columns.patients"), "%"],
          rows: points.map((point) => [point.label, point.value, pct(point.value, total)]),
        },
        note: ctx.t("insights.notes.demographics"),
      };
    },
  },

  // ── Marcações e consultas ───────────────────────────────────────────────
  "appointments.total": {
    id: "appointments.total",
    description: "Total de marcações/consultas no período (excluindo canceladas), comparado com o período anterior.",
    permission: "appointment.view",
    unit: "count",
    shape: "value",
    run: async (ctx) => {
      const [value, previousValue] = await Promise.all([
        prisma.appointment.count({ where: { clinicId: ctx.clinicId, startAt: range(ctx), status: { not: "CANCELADA" } } }),
        prisma.appointment.count({ where: { clinicId: ctx.clinicId, startAt: previousRange(ctx), status: { not: "CANCELADA" } } }),
      ]);
      return {
        id: "appointments.total",
        label: metricLabel(ctx.t, "appointments.total"),
        unit: "count",
        shape: "value",
        value,
        previousValue,
        changePct: change(value, previousValue),
      };
    },
  },

  "appointments.by_status": {
    id: "appointments.by_status",
    description: "Distribuição das marcações do período por estado (marcada, confirmada, concluída, cancelada, falta…).",
    permission: "appointment.view",
    unit: "count",
    shape: "distribution",
    run: async (ctx) => {
      const rows = await prisma.appointment.groupBy({
        by: ["status"],
        where: { clinicId: ctx.clinicId, startAt: range(ctx) },
        _count: { _all: true },
      });
      const total = rows.reduce((sum, row) => sum + row._count._all, 0);
      const points = rows
        .map((row) => ({ label: ctx.t(`appointmentStatus.${row.status}`), value: row._count._all }))
        .sort((a, b) => b.value - a.value);
      return {
        id: "appointments.by_status",
        label: metricLabel(ctx.t, "appointments.by_status"),
        unit: "count",
        shape: "distribution",
        value: total,
        series: points,
        table: {
          columns: [ctx.t("insights.columns.status"), ctx.t("insights.columns.appointments"), "%"],
          rows: points.map((point) => [point.label, point.value, pct(point.value, total)]),
        },
      };
    },
  },

  "appointments.cancellation_rate": {
    id: "appointments.cancellation_rate",
    description: "Percentagem de marcações canceladas no período, com o número de cancelamentos.",
    permission: "appointment.view",
    unit: "percent",
    shape: "value",
    run: async (ctx) => {
      const [cancelled, total, prevCancelled, prevTotal] = await Promise.all([
        prisma.appointment.count({ where: { clinicId: ctx.clinicId, startAt: range(ctx), status: "CANCELADA" } }),
        prisma.appointment.count({ where: { clinicId: ctx.clinicId, startAt: range(ctx) } }),
        prisma.appointment.count({ where: { clinicId: ctx.clinicId, startAt: previousRange(ctx), status: "CANCELADA" } }),
        prisma.appointment.count({ where: { clinicId: ctx.clinicId, startAt: previousRange(ctx) } }),
      ]);
      return {
        id: "appointments.cancellation_rate",
        label: metricLabel(ctx.t, "appointments.cancellation_rate"),
        unit: "percent",
        shape: "value",
        value: pct(cancelled, total),
        previousValue: pct(prevCancelled, prevTotal),
        note: ctx.t("insights.notes.cancelled", { cancelled, total }),
      };
    },
  },

  "appointments.no_show_rate": {
    id: "appointments.no_show_rate",
    description: "Percentagem de pacientes que não compareceram (no-show/faltas) no período, com o número de faltas.",
    permission: "appointment.view",
    unit: "percent",
    shape: "value",
    run: async (ctx) => {
      const [noShow, total, prevNoShow, prevTotal] = await Promise.all([
        prisma.appointment.count({ where: { clinicId: ctx.clinicId, startAt: range(ctx), status: "NAO_COMPARECEU" } }),
        prisma.appointment.count({ where: { clinicId: ctx.clinicId, startAt: range(ctx), status: { not: "CANCELADA" } } }),
        prisma.appointment.count({ where: { clinicId: ctx.clinicId, startAt: previousRange(ctx), status: "NAO_COMPARECEU" } }),
        prisma.appointment.count({ where: { clinicId: ctx.clinicId, startAt: previousRange(ctx), status: { not: "CANCELADA" } } }),
      ]);
      return {
        id: "appointments.no_show_rate",
        label: metricLabel(ctx.t, "appointments.no_show_rate"),
        unit: "percent",
        shape: "value",
        value: pct(noShow, total),
        previousValue: pct(prevNoShow, prevTotal),
        note: ctx.t("insights.notes.noShows", { noShows: noShow, total }),
      };
    },
  },

  "appointments.by_doctor": {
    id: "appointments.by_doctor",
    description: "Ranking de profissionais por número de consultas no período. Responde a 'qual médico realizou mais consultas'.",
    permission: "doctor.stats",
    unit: "count",
    shape: "ranking",
    run: async (ctx) => {
      const rows = await prisma.appointment.groupBy({
        by: ["doctorId"],
        where: { clinicId: ctx.clinicId, startAt: range(ctx), status: { not: "CANCELADA" } },
        _count: { _all: true },
        orderBy: { _count: { doctorId: "desc" } },
        take: 10,
      });
      const doctors = await prisma.doctor.findMany({
        where: { id: { in: rows.map((row) => row.doctorId) }, clinicId: ctx.clinicId },
        select: { id: true, name: true, specialty: { select: { name: true } } },
      });
      const byId = new Map(doctors.map((doctor) => [doctor.id, doctor]));
      const total = await prisma.appointment.count({ where: { clinicId: ctx.clinicId, startAt: range(ctx), status: { not: "CANCELADA" } } });
      return {
        id: "appointments.by_doctor",
        label: metricLabel(ctx.t, "appointments.by_doctor"),
        unit: "count",
        shape: "ranking",
        value: total,
        series: rows.map((row) => ({ label: byId.get(row.doctorId)?.name ?? "—", value: row._count._all })),
        table: {
          columns: [ctx.t("insights.columns.professional"), ctx.t("insights.columns.specialty"), ctx.t("insights.columns.consultations")],
          rows: rows.map((row) => [byId.get(row.doctorId)?.name ?? "—", byId.get(row.doctorId)?.specialty.name ?? "—", row._count._all]),
        },
      };
    },
  },

  "appointments.by_specialty": {
    id: "appointments.by_specialty",
    description: "Distribuição das consultas por especialidade no período. Responde a 'que especialidades tiveram maior procura'.",
    permission: "appointment.view",
    unit: "count",
    shape: "ranking",
    run: async (ctx) => {
      const rows = await prisma.appointment.groupBy({
        by: ["specialtyId"],
        where: { clinicId: ctx.clinicId, startAt: range(ctx), status: { not: "CANCELADA" } },
        _count: { _all: true },
      });
      const specialties = await prisma.specialty.findMany({
        where: { id: { in: rows.map((row) => row.specialtyId) }, clinicId: ctx.clinicId },
        select: { id: true, name: true },
      });
      const byId = new Map(specialties.map((specialty) => [specialty.id, specialty.name]));
      const sorted = rows.sort((a, b) => b._count._all - a._count._all).slice(0, 12);
      const total = rows.reduce((sum, row) => sum + row._count._all, 0);
      return {
        id: "appointments.by_specialty",
        label: metricLabel(ctx.t, "appointments.by_specialty"),
        unit: "count",
        shape: "ranking",
        value: total,
        series: sorted.map((row) => ({ label: byId.get(row.specialtyId) ?? "—", value: row._count._all })),
        table: {
          columns: [ctx.t("insights.columns.specialty"), ctx.t("insights.columns.consultations"), "%"],
          rows: sorted.map((row) => [byId.get(row.specialtyId) ?? "—", row._count._all, pct(row._count._all, total)]),
        },
      };
    },
  },

  "appointments.monthly_series": {
    id: "appointments.monthly_series",
    description: "Série mensal de consultas (3, 6 ou 12 meses, conforme o período). Responde a 'evolução de consultas'.",
    permission: "appointment.view",
    unit: "count",
    shape: "series",
    run: async (ctx) => {
      const series = await monthlySeries(ctx, (from, to) =>
        prisma.appointment.count({ where: { clinicId: ctx.clinicId, startAt: { gte: from, lte: to }, status: { not: "CANCELADA" } } }),
      );
      return {
        id: "appointments.monthly_series",
        label: metricLabel(ctx.t, "appointments.monthly_series"),
        unit: "count",
        shape: "series",
        value: series.reduce((sum, point) => sum + point.value, 0),
        series,
      };
    },
  },

  "appointments.by_weekday": {
    id: "appointments.by_weekday",
    description: "Distribuição das consultas por dia da semana (hora local). Responde a 'que dias têm maior movimento'.",
    permission: "appointment.view",
    unit: "count",
    shape: "peaks",
    run: async (ctx) => {
      // Agregação na base de dados, no fuso da clínica ("startAt" é guardado em UTC).
      const rows = await prisma.$queryRaw<{ weekday: number; total: bigint }[]>`
        SELECT EXTRACT(DOW FROM ("startAt" AT TIME ZONE 'UTC' AT TIME ZONE ${ctx.timeZone}))::int AS weekday,
               COUNT(*)::bigint AS total
        FROM "Appointment"
        WHERE "clinicId" = ${ctx.clinicId}
          AND "startAt" >= ${ctx.from}
          AND "startAt" <= ${ctx.to}
          AND "status" <> 'CANCELADA'
        GROUP BY 1
      `;
      const byDay = new Map(rows.map((row) => [row.weekday, Number(row.total)]));
      const series = WEEK_ORDER.map((index) => ({ label: ctx.t(WEEKDAY_KEYS[index]), value: byDay.get(index) ?? 0 }));
      return {
        id: "appointments.by_weekday",
        label: metricLabel(ctx.t, "appointments.by_weekday"),
        unit: "count",
        shape: "peaks",
        value: series.reduce((sum, point) => sum + point.value, 0),
        series,
      };
    },
  },

  "appointments.by_hour": {
    id: "appointments.by_hour",
    description: "Distribuição das consultas por hora do dia (hora local). Responde a 'horários de maior movimento'.",
    permission: "appointment.view",
    unit: "count",
    shape: "peaks",
    run: async (ctx) => {
      const rows = await prisma.$queryRaw<{ hour: number; total: bigint }[]>`
        SELECT EXTRACT(HOUR FROM ("startAt" AT TIME ZONE 'UTC' AT TIME ZONE ${ctx.timeZone}))::int AS hour,
               COUNT(*)::bigint AS total
        FROM "Appointment"
        WHERE "clinicId" = ${ctx.clinicId}
          AND "startAt" >= ${ctx.from}
          AND "startAt" <= ${ctx.to}
          AND "status" <> 'CANCELADA'
        GROUP BY 1
        ORDER BY 1
      `;
      const series = rows.map((row) => ({ label: `${String(row.hour).padStart(2, "0")}h`, value: Number(row.total) }));
      return {
        id: "appointments.by_hour",
        label: metricLabel(ctx.t, "appointments.by_hour"),
        unit: "count",
        shape: "peaks",
        value: series.reduce((sum, point) => sum + point.value, 0),
        series,
      };
    },
  },

  "specialties.growth": {
    id: "specialties.growth",
    description: "Comparação da procura por especialidade entre o período actual e o anterior (crescimento).",
    permission: "appointment.view",
    unit: "count",
    shape: "growth",
    run: async (ctx) => {
      const [current, previous, specialties] = await Promise.all([
        prisma.appointment.groupBy({
          by: ["specialtyId"],
          where: { clinicId: ctx.clinicId, startAt: range(ctx), status: { not: "CANCELADA" } },
          _count: { _all: true },
        }),
        prisma.appointment.groupBy({
          by: ["specialtyId"],
          where: { clinicId: ctx.clinicId, startAt: previousRange(ctx), status: { not: "CANCELADA" } },
          _count: { _all: true },
        }),
        prisma.specialty.findMany({ where: { clinicId: ctx.clinicId }, select: { id: true, name: true } }),
      ]);
      const byId = new Map(specialties.map((specialty) => [specialty.id, specialty.name]));
      const previousById = new Map(previous.map((row) => [row.specialtyId, row._count._all]));
      const rows = current
        .map((row) => {
          const before = previousById.get(row.specialtyId) ?? 0;
          return { name: byId.get(row.specialtyId) ?? "—", now: row._count._all, before, delta: change(row._count._all, before) };
        })
        .sort((a, b) => (b.delta ?? -Infinity) - (a.delta ?? -Infinity) || b.now - a.now)
        .slice(0, 10);

      return {
        id: "specialties.growth",
        label: metricLabel(ctx.t, "specialties.growth"),
        unit: "count",
        shape: "growth",
        value: rows.reduce((sum, row) => sum + row.now, 0),
        series: rows.map((row) => ({ label: row.name, value: row.now })),
        table: {
          columns: [ctx.t("insights.columns.specialty"), ctx.t("insights.columns.currentPeriod"), ctx.t("insights.columns.previousPeriod"), ctx.t("insights.columns.change")],
          rows: rows.map((row) => [row.name, row.now, row.before, row.delta === undefined ? "—" : `${row.delta > 0 ? "+" : ""}${row.delta}%`]),
        },
        highlights: rows.filter((row) => (row.delta ?? 0) > 0).slice(0, 3).map((row) => `${row.name} (+${row.delta}%)`),
      };
    },
  },

  // ── Finanças ────────────────────────────────────────────────────────────
  "finance.revenue": {
    id: "finance.revenue",
    description: "Receita/facturação reconhecida no período, comparada com o período anterior.",
    permission: "finance.view",
    unit: "currency",
    shape: "value",
    run: async (ctx) => {
      const [value, previousValue] = await Promise.all([revenueBetween(ctx.clinicId, range(ctx)), revenueBetween(ctx.clinicId, previousRange(ctx))]);
      return {
        id: "finance.revenue",
        label: metricLabel(ctx.t, "finance.revenue"),
        unit: "currency",
        shape: "value",
        value,
        previousValue,
        changePct: change(value, previousValue),
      };
    },
  },

  "finance.revenue_monthly_series": {
    id: "finance.revenue_monthly_series",
    description: "Série mensal de receita (3, 6 ou 12 meses, conforme o período). Responde a comparações de receita entre meses.",
    permission: "finance.view",
    unit: "currency",
    shape: "series",
    run: async (ctx) => {
      const series = await monthlySeries(ctx, (from, to) => revenueBetween(ctx.clinicId, { gte: from, lte: to }));
      return {
        id: "finance.revenue_monthly_series",
        label: metricLabel(ctx.t, "finance.revenue_monthly_series"),
        unit: "currency",
        shape: "series",
        value: series.reduce((sum, point) => sum + point.value, 0),
        series,
      };
    },
  },

  "finance.payments_received": {
    id: "finance.payments_received",
    description: "Total efectivamente recebido (pagamentos) no período, comparado com o período anterior.",
    permission: "finance.view",
    unit: "currency",
    shape: "value",
    run: async (ctx) => {
      const [current, previous] = await Promise.all([
        prisma.payment.aggregate({ where: { clinicId: ctx.clinicId, receivedAt: range(ctx) }, _sum: { amount: true } }),
        prisma.payment.aggregate({ where: { clinicId: ctx.clinicId, receivedAt: previousRange(ctx) }, _sum: { amount: true } }),
      ]);
      const value = current._sum.amount ?? 0;
      const previousValue = previous._sum.amount ?? 0;
      return {
        id: "finance.payments_received",
        label: metricLabel(ctx.t, "finance.payments_received"),
        unit: "currency",
        shape: "value",
        value,
        previousValue,
        changePct: change(value, previousValue),
      };
    },
  },

  "finance.outstanding": {
    id: "finance.outstanding",
    description: "Total por receber (facturas emitidas ou parcialmente pagas) — situação actual.",
    permission: "finance.view",
    unit: "currency",
    shape: "value",
    periodIndependent: true,
    run: async (ctx) => {
      const agg = await prisma.invoice.aggregate({
        where: { clinicId: ctx.clinicId, status: { in: ["EMITIDA", "PARCIAL"] } },
        _sum: { total: true, amountPaid: true },
        _count: { _all: true },
      });
      const value = (agg._sum.total ?? 0) - (agg._sum.amountPaid ?? 0);
      return {
        id: "finance.outstanding",
        label: metricLabel(ctx.t, "finance.outstanding"),
        unit: "currency",
        shape: "value",
        value,
        note: ctx.t("insights.notes.outstanding", { count: agg._count._all }),
      };
    },
  },

  "finance.revenue_per_patient": {
    id: "finance.revenue_per_patient",
    description: "Receita do período dividida pelo número de pacientes distintos atendidos (ticket médio por paciente).",
    permission: "finance.view",
    unit: "currency",
    shape: "value",
    run: async (ctx) => {
      const [revenue, patients] = await Promise.all([
        revenueBetween(ctx.clinicId, range(ctx)),
        prisma.appointment.groupBy({ by: ["patientId"], where: { clinicId: ctx.clinicId, startAt: range(ctx), status: { not: "CANCELADA" } } }),
      ]);
      return {
        id: "finance.revenue_per_patient",
        label: metricLabel(ctx.t, "finance.revenue_per_patient"),
        unit: "currency",
        shape: "value",
        value: patients.length ? Math.round(revenue / patients.length) : 0,
        note: ctx.t("insights.notes.distinctPatients", { count: patients.length }),
      };
    },
  },

  "finance.expenses": {
    id: "finance.expenses",
    description: "Total de despesas/gastos (não anuladas) no período, comparado com o período anterior.",
    permission: "finance.view",
    unit: "currency",
    shape: "value",
    run: async (ctx) => {
      const [current, previous] = await Promise.all([expensesBetween(ctx.clinicId, range(ctx)), expensesBetween(ctx.clinicId, previousRange(ctx))]);
      return {
        id: "finance.expenses",
        label: metricLabel(ctx.t, "finance.expenses"),
        unit: "currency",
        shape: "value",
        value: current.total,
        previousValue: previous.total,
        changePct: change(current.total, previous.total),
        note: ctx.t("insights.notes.expenses", { count: current.count }),
      };
    },
  },

  "finance.expenses_by_category": {
    id: "finance.expenses_by_category",
    description: "Despesas do período agrupadas por categoria (onde se gastou mais).",
    permission: "finance.view",
    unit: "currency",
    shape: "ranking",
    run: async (ctx) => {
      const [rows, categories] = await Promise.all([
        prisma.expense.groupBy({
          by: ["categoryId"],
          where: { clinicId: ctx.clinicId, incurredAt: range(ctx), status: { not: "ANULADA" } },
          _sum: { amount: true },
        }),
        prisma.expenseCategory.findMany({ where: { clinicId: ctx.clinicId }, select: { id: true, name: true } }),
      ]);
      const byId = new Map(categories.map((category) => [category.id, category.name]));
      const points = rows
        .map((row) => ({
          label: row.categoryId ? (byId.get(row.categoryId) ?? "—") : ctx.t("insights.notes.uncategorised"),
          value: row._sum.amount ?? 0,
        }))
        .sort((a, b) => b.value - a.value);
      const total = points.reduce((sum, point) => sum + point.value, 0);
      return {
        id: "finance.expenses_by_category",
        label: metricLabel(ctx.t, "finance.expenses_by_category"),
        unit: "currency",
        shape: "ranking",
        value: total,
        series: points.slice(0, 10),
        table: {
          columns: [ctx.t("insights.columns.category"), ctx.t("insights.columns.amount"), "%"],
          rows: points.slice(0, 12).map((point) => [point.label, ctx.f.money(point.value), pct(point.value, total)]),
        },
      };
    },
  },

  "finance.net_result": {
    id: "finance.net_result",
    description: "Resultado (lucro ou prejuízo): receita menos despesas no período, comparado com o período anterior.",
    permission: "finance.view",
    unit: "currency",
    shape: "value",
    run: async (ctx) => {
      const [revenue, previousRevenue, expenses, previousExpenses] = await Promise.all([
        revenueBetween(ctx.clinicId, range(ctx)),
        revenueBetween(ctx.clinicId, previousRange(ctx)),
        expensesBetween(ctx.clinicId, range(ctx)),
        expensesBetween(ctx.clinicId, previousRange(ctx)),
      ]);
      const value = revenue - expenses.total;
      const previousValue = previousRevenue - previousExpenses.total;
      return {
        id: "finance.net_result",
        label: metricLabel(ctx.t, "finance.net_result"),
        unit: "currency",
        shape: "value",
        value,
        previousValue,
        changePct: previousValue > 0 ? change(value, previousValue) : undefined,
        note: ctx.t("insights.notes.netResult", {
          revenue: ctx.f.money(revenue),
          expenses: ctx.f.money(expenses.total),
          margin: revenue ? Math.round((value / revenue) * 100) : 0,
        }),
      };
    },
  },

  "finance.revenue_by_specialty": {
    id: "finance.revenue_by_specialty",
    description: "Receita do período por especialidade (qual especialidade gera mais receita).",
    permission: "finance.view",
    unit: "currency",
    shape: "ranking",
    run: async (ctx) => {
      const [rows, specialties] = await Promise.all([
        prisma.revenue.groupBy({ by: ["specialtyId"], where: { clinicId: ctx.clinicId, recognisedAt: range(ctx) }, _sum: { amount: true } }),
        prisma.specialty.findMany({ where: { clinicId: ctx.clinicId }, select: { id: true, name: true } }),
      ]);
      const byId = new Map(specialties.map((specialty) => [specialty.id, specialty.name]));
      const points = rows
        .map((row) => ({
          label: row.specialtyId ? (byId.get(row.specialtyId) ?? "—") : ctx.t("insights.notes.noSpecialty"),
          value: row._sum.amount ?? 0,
        }))
        .sort((a, b) => b.value - a.value);
      const total = points.reduce((sum, point) => sum + point.value, 0);
      return {
        id: "finance.revenue_by_specialty",
        label: metricLabel(ctx.t, "finance.revenue_by_specialty"),
        unit: "currency",
        shape: "ranking",
        value: total,
        series: points.slice(0, 10),
        table: {
          columns: [ctx.t("insights.columns.specialty"), ctx.t("insights.columns.amount"), "%"],
          rows: points.slice(0, 12).map((point) => [point.label, ctx.f.money(point.value), pct(point.value, total)]),
        },
      };
    },
  },

  "finance.revenue_by_doctor": {
    id: "finance.revenue_by_doctor",
    description: "Receita do período por médico/profissional (qual médico factura mais).",
    permission: "finance.view",
    unit: "currency",
    shape: "ranking",
    run: async (ctx) => {
      const rows = await prisma.revenue.groupBy({ by: ["doctorId"], where: { clinicId: ctx.clinicId, recognisedAt: range(ctx) }, _sum: { amount: true } });
      const doctors = await prisma.doctor.findMany({
        where: { clinicId: ctx.clinicId, id: { in: rows.map((row) => row.doctorId).filter((id): id is string => Boolean(id)) } },
        select: { id: true, name: true },
      });
      const byId = new Map(doctors.map((doctor) => [doctor.id, doctor.name]));
      const points = rows
        .map((row) => ({
          label: row.doctorId ? (byId.get(row.doctorId) ?? "—") : ctx.t("insights.notes.noDoctor"),
          value: row._sum.amount ?? 0,
        }))
        .sort((a, b) => b.value - a.value);
      const total = points.reduce((sum, point) => sum + point.value, 0);
      return {
        id: "finance.revenue_by_doctor",
        label: metricLabel(ctx.t, "finance.revenue_by_doctor"),
        unit: "currency",
        shape: "ranking",
        value: total,
        series: points.slice(0, 10),
        table: {
          columns: [ctx.t("insights.columns.professional"), ctx.t("insights.columns.amount"), "%"],
          rows: points.slice(0, 12).map((point) => [point.label, ctx.f.money(point.value), pct(point.value, total)]),
        },
      };
    },
  },

  "finance.payments_by_method": {
    id: "finance.payments_by_method",
    description: "Pagamentos recebidos no período por método (dinheiro, M-Pesa, e-Mola, cartão, transferência, seguradora).",
    permission: "finance.view",
    unit: "currency",
    shape: "ranking",
    run: async (ctx) => {
      const rows = await prisma.payment.groupBy({
        by: ["method"],
        where: { clinicId: ctx.clinicId, receivedAt: range(ctx) },
        _sum: { amount: true },
        _count: { _all: true },
      });
      const points = rows
        .map((row) => ({ label: ctx.t(`charts.paymentMethods.${row.method}`), value: row._sum.amount ?? 0, count: row._count._all }))
        .sort((a, b) => b.value - a.value);
      const total = points.reduce((sum, point) => sum + point.value, 0);
      return {
        id: "finance.payments_by_method",
        label: metricLabel(ctx.t, "finance.payments_by_method"),
        unit: "currency",
        shape: "ranking",
        value: total,
        series: points.map(({ label, value }) => ({ label, value })),
        table: {
          columns: [ctx.t("insights.columns.method"), ctx.t("insights.columns.payments"), ctx.t("insights.columns.amount"), "%"],
          rows: points.map((point) => [point.label, point.count, ctx.f.money(point.value), pct(point.value, total)]),
        },
      };
    },
  },

  // ── Operação ────────────────────────────────────────────────────────────
  "operations.consultation_duration": {
    id: "operations.consultation_duration",
    description: "Tempo médio entre o início e o fim das consultas concluídas, em minutos.",
    permission: "doctor.stats",
    unit: "minutes",
    shape: "value",
    run: async (ctx) => {
      const rows = await prisma.$queryRaw<{ avg_minutes: number | null; total: bigint }[]>`
        SELECT AVG(EXTRACT(EPOCH FROM ("endedAt" - "startedAt")) / 60)::float AS avg_minutes,
               COUNT(*)::bigint AS total
        FROM "Consultation"
        WHERE "clinicId" = ${ctx.clinicId}
          AND "startedAt" >= ${ctx.from}
          AND "startedAt" <= ${ctx.to}
          AND "endedAt" IS NOT NULL
      `;
      const row = rows[0];
      const total = Number(row?.total ?? 0);
      return {
        id: "operations.consultation_duration",
        label: metricLabel(ctx.t, "operations.consultation_duration"),
        unit: "minutes",
        shape: "value",
        value: Math.round(row?.avg_minutes ?? 0),
        note: total ? ctx.t("insights.notes.durationBasis", { count: total }) : ctx.t("insights.notes.durationEmpty"),
      };
    },
  },

  "operations.doctor_productivity": {
    id: "operations.doctor_productivity",
    description: "Consultas concluídas por profissional e taxa de conclusão no período (produtividade/desempenho).",
    permission: "doctor.stats",
    unit: "count",
    shape: "ranking",
    run: async (ctx) => {
      const rows = await prisma.appointment.groupBy({
        by: ["doctorId", "status"],
        where: { clinicId: ctx.clinicId, startAt: range(ctx) },
        _count: { _all: true },
      });
      const byDoctor = new Map<string, { done: number; total: number }>();
      for (const row of rows) {
        const entry = byDoctor.get(row.doctorId) ?? { done: 0, total: 0 };
        entry.total += row._count._all;
        if (row.status === "CONCLUIDA") entry.done += row._count._all;
        byDoctor.set(row.doctorId, entry);
      }
      const doctors = await prisma.doctor.findMany({
        where: { id: { in: [...byDoctor.keys()] }, clinicId: ctx.clinicId },
        select: { id: true, name: true },
      });
      const table = doctors
        .map((doctor) => {
          const entry = byDoctor.get(doctor.id)!;
          return { name: doctor.name, done: entry.done, total: entry.total, rate: pct(entry.done, entry.total) };
        })
        .sort((a, b) => b.done - a.done);

      return {
        id: "operations.doctor_productivity",
        label: metricLabel(ctx.t, "operations.doctor_productivity"),
        unit: "count",
        shape: "ranking",
        value: table.reduce((sum, row) => sum + row.done, 0),
        series: table.slice(0, 10).map((row) => ({ label: row.name, value: row.done })),
        table: {
          columns: [ctx.t("insights.columns.professional"), ctx.t("insights.columns.completed"), ctx.t("insights.columns.scheduled"), ctx.t("insights.columns.completionRate")],
          rows: table.map((row) => [row.name, row.done, row.total, `${row.rate}%`]),
        },
      };
    },
  },

  // ── Stock ───────────────────────────────────────────────────────────────
  "inventory.low_stock": {
    id: "inventory.low_stock",
    description: "Artigos de stock abaixo do stock mínimo ou esgotados (situação actual) — o que é preciso encomendar.",
    permission: "inventory.view",
    unit: "count",
    shape: "list",
    periodIndependent: true,
    run: async (ctx) => {
      const items = await prisma.inventoryItem.findMany({
        where: { clinicId: ctx.clinicId, minStock: { gt: 0 } },
        select: { name: true, unit: true, currentStock: true, minStock: true },
      });
      const low = items
        .filter((item) => item.currentStock < item.minStock)
        .sort((a, b) => a.currentStock / a.minStock - b.currentStock / b.minStock);
      return {
        id: "inventory.low_stock",
        label: metricLabel(ctx.t, "inventory.low_stock"),
        unit: "count",
        shape: "list",
        value: low.length,
        table: {
          columns: [ctx.t("insights.columns.item"), ctx.t("insights.columns.currentStock"), ctx.t("insights.columns.minimumStock")],
          rows: low.slice(0, 20).map((item) => [item.name, `${item.currentStock} ${item.unit}`, `${item.minStock} ${item.unit}`]),
        },
        highlights: low.slice(0, 3).map((item) => item.name),
        note: ctx.t("insights.notes.currentSituation"),
      };
    },
  },

  "inventory.expiring": {
    id: "inventory.expiring",
    description: "Lotes de stock expirados ou a expirar dentro do prazo de aviso configurado (situação actual).",
    permission: "inventory.view",
    unit: "count",
    shape: "list",
    periodIndependent: true,
    run: async (ctx) => {
      const settings = await prisma.clinicSettings.findUnique({ where: { clinicId: ctx.clinicId }, select: { expiryWarningDays: true } });
      const days = settings?.expiryWarningDays ?? 30;
      const now = Date.now();
      const items = await prisma.inventoryItem.findMany({
        where: { clinicId: ctx.clinicId, currentStock: { gt: 0 }, expiryDate: { not: null, lte: new Date(now + days * DAY_MS) } },
        select: { name: true, batchNumber: true, expiryDate: true },
        orderBy: { expiryDate: "asc" },
      });
      return {
        id: "inventory.expiring",
        label: metricLabel(ctx.t, "inventory.expiring"),
        unit: "count",
        shape: "list",
        value: items.length,
        table: {
          columns: [ctx.t("insights.columns.item"), ctx.t("insights.columns.batch"), ctx.t("insights.columns.expiryDate"), ctx.t("insights.columns.daysLeft")],
          rows: items.slice(0, 20).map((item) => {
            const left = Math.ceil((item.expiryDate!.getTime() - now) / DAY_MS);
            return [item.name, item.batchNumber ?? "—", ctx.f.date(item.expiryDate!), left <= 0 ? ctx.t("insights.notes.expired") : left];
          }),
        },
        highlights: items.slice(0, 3).map((item) => item.name),
        note: ctx.t("insights.notes.expiring", { days }),
      };
    },
  },
};

/** Métricas que este perfil pode consultar. */
export function availableMetrics(has: (permission: Permission) => boolean): MetricDefinition[] {
  return METRIC_IDS.map((id) => METRICS[id]).filter((metric) => has(metric.permission));
}

/** Rótulos em português usados apenas no prompt do modelo. */
export const PERIOD_LABEL: Record<PeriodKey, string> = {
  hoje: "hoje",
  ontem: "ontem",
  esta_semana: "esta semana",
  semana_passada: "a semana passada",
  ultimos_7_dias: "os últimos 7 dias",
  este_mes: "este mês",
  mes_anterior: "o mês anterior",
  ultimos_30_dias: "os últimos 30 dias",
  ultimos_3_meses: "os últimos 3 meses",
  ultimos_6_meses: "os últimos 6 meses",
  ultimos_12_meses: "os últimos 12 meses",
  este_ano: "este ano",
  ano_passado: "o ano passado",
};

/** Converte um período nomeado em intervalos actual/anterior no fuso da clínica. */
export function resolvePeriod(period: PeriodKey, timeZone: string, now: Date = new Date()): PeriodWindow {
  return resolveWindow(period, timeZone, now);
}
