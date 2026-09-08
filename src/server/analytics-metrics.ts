import "server-only";
import { endOfMonth, startOfMonth, subDays, subMonths } from "date-fns";
import type { Permission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { pct } from "@/lib/utils";

/**
 * Catálogo controlado de métricas (§25).
 *
 * Esta é a **única** superfície através da qual o assistente de Insights lê
 * dados. Não existe execução de SQL enviado pelo modelo, nem acesso directo à
 * base de dados: o modelo escolhe um identificador desta lista e o servidor
 * executa a consulta correspondente, já limitada pela clínica e pela permissão
 * do utilizador autenticado.
 */

export interface MetricContext {
  clinicId: string;
  from: Date;
  to: Date;
  previousFrom: Date;
  previousTo: Date;
}

export type MetricUnit = "count" | "currency" | "percent" | "minutes";

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
  value: number;
  previousValue?: number;
  changePct?: number;
  series?: MetricSeriesPoint[];
  table?: MetricTable;
  note?: string;
}

export interface MetricDefinition {
  id: MetricId;
  label: string;
  /** Descrição usada para o modelo escolher a métrica certa. */
  description: string;
  permission: Permission;
  unit: MetricUnit;
  run: (ctx: MetricContext) => Promise<MetricResult>;
}

export type MetricId =
  | "patients.total"
  | "patients.new"
  | "patients.active"
  | "patients.monthly_series"
  | "appointments.total"
  | "appointments.by_status"
  | "appointments.cancellation_rate"
  | "appointments.no_show_rate"
  | "appointments.by_doctor"
  | "appointments.by_specialty"
  | "appointments.monthly_series"
  | "appointments.by_weekday"
  | "appointments.by_hour"
  | "specialties.growth"
  | "finance.revenue"
  | "finance.revenue_monthly_series"
  | "finance.payments_received"
  | "finance.outstanding"
  | "finance.revenue_per_patient"
  | "operations.consultation_duration"
  | "operations.doctor_productivity";

const MONTH_LABELS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const WEEKDAY_LABELS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

function change(current: number, previous: number): number | undefined {
  if (!previous) return undefined;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function monthKey(date: Date): string {
  return `${MONTH_LABELS[date.getUTCMonth()]}/${String(date.getUTCFullYear()).slice(2)}`;
}

/** Série mensal dos últimos N meses, agregada na base de dados. */
async function monthlySeries(
  clinicId: string,
  to: Date,
  months: number,
  loader: (from: Date, until: Date) => Promise<number>,
): Promise<MetricSeriesPoint[]> {
  const points: MetricSeriesPoint[] = [];
  for (let i = months - 1; i >= 0; i -= 1) {
    const anchor = subMonths(to, i);
    const from = startOfMonth(anchor);
    const until = endOfMonth(anchor);
    points.push({ label: monthKey(anchor), value: await loader(from, until) });
  }
  return points;
}

export const METRICS: Record<MetricId, MetricDefinition> = {
  "patients.total": {
    id: "patients.total",
    label: "Total de pacientes",
    description: "Número total de pacientes activos registados na instituição.",
    permission: "patient.view",
    unit: "count",
    run: async (ctx) => {
      const value = await prisma.patient.count({ where: { clinicId: ctx.clinicId, isActive: true } });
      return { id: "patients.total", label: "Total de pacientes", unit: "count", value };
    },
  },

  "patients.new": {
    id: "patients.new",
    label: "Novos pacientes",
    description: "Pacientes registados no período, comparado com o período anterior. Responde a perguntas sobre crescimento de pacientes.",
    permission: "patient.view",
    unit: "count",
    run: async (ctx) => {
      const [value, previousValue] = await Promise.all([
        prisma.patient.count({ where: { clinicId: ctx.clinicId, registeredAt: { gte: ctx.from, lte: ctx.to } } }),
        prisma.patient.count({ where: { clinicId: ctx.clinicId, registeredAt: { gte: ctx.previousFrom, lte: ctx.previousTo } } }),
      ]);
      return {
        id: "patients.new",
        label: "Novos pacientes",
        unit: "count",
        value,
        previousValue,
        changePct: change(value, previousValue),
      };
    },
  },

  "patients.active": {
    id: "patients.active",
    label: "Pacientes activos",
    description: "Pacientes com pelo menos uma marcação no período.",
    permission: "patient.view",
    unit: "count",
    run: async (ctx) => {
      const rows = await prisma.appointment.groupBy({
        by: ["patientId"],
        where: { clinicId: ctx.clinicId, startAt: { gte: ctx.from, lte: ctx.to } },
      });
      return { id: "patients.active", label: "Pacientes activos", unit: "count", value: rows.length };
    },
  },

  "patients.monthly_series": {
    id: "patients.monthly_series",
    label: "Evolução de novos pacientes",
    description: "Série mensal de novos pacientes nos últimos 12 meses.",
    permission: "patient.view",
    unit: "count",
    run: async (ctx) => {
      const series = await monthlySeries(ctx.clinicId, ctx.to, 12, (from, until) =>
        prisma.patient.count({ where: { clinicId: ctx.clinicId, registeredAt: { gte: from, lte: until } } }),
      );
      return {
        id: "patients.monthly_series",
        label: "Evolução de novos pacientes",
        unit: "count",
        value: series.reduce((sum, p) => sum + p.value, 0),
        series,
      };
    },
  },

  "appointments.total": {
    id: "appointments.total",
    label: "Consultas no período",
    description: "Total de marcações no período (excluindo canceladas), comparado com o período anterior.",
    permission: "appointment.view",
    unit: "count",
    run: async (ctx) => {
      const [value, previousValue] = await Promise.all([
        prisma.appointment.count({ where: { clinicId: ctx.clinicId, startAt: { gte: ctx.from, lte: ctx.to }, status: { not: "CANCELADA" } } }),
        prisma.appointment.count({ where: { clinicId: ctx.clinicId, startAt: { gte: ctx.previousFrom, lte: ctx.previousTo }, status: { not: "CANCELADA" } } }),
      ]);
      return { id: "appointments.total", label: "Consultas no período", unit: "count", value, previousValue, changePct: change(value, previousValue) };
    },
  },

  "appointments.by_status": {
    id: "appointments.by_status",
    label: "Marcações por estado",
    description: "Distribuição das marcações por estado (marcada, confirmada, concluída, cancelada, falta…).",
    permission: "appointment.view",
    unit: "count",
    run: async (ctx) => {
      const rows = await prisma.appointment.groupBy({
        by: ["status"],
        where: { clinicId: ctx.clinicId, startAt: { gte: ctx.from, lte: ctx.to } },
        _count: { _all: true },
        orderBy: { status: "asc" },
      });
      const total = rows.reduce((sum, r) => sum + r._count._all, 0);
      return {
        id: "appointments.by_status",
        label: "Marcações por estado",
        unit: "count",
        value: total,
        table: {
          columns: ["Estado", "Marcações", "%"],
          rows: rows.map((r) => [r.status.replace(/_/g, " "), r._count._all, pct(r._count._all, total)]),
        },
      };
    },
  },

  "appointments.cancellation_rate": {
    id: "appointments.cancellation_rate",
    label: "Taxa de cancelamento",
    description: "Percentagem de marcações canceladas no período.",
    permission: "appointment.view",
    unit: "percent",
    run: async (ctx) => {
      const [cancelled, total, prevCancelled, prevTotal] = await Promise.all([
        prisma.appointment.count({ where: { clinicId: ctx.clinicId, startAt: { gte: ctx.from, lte: ctx.to }, status: "CANCELADA" } }),
        prisma.appointment.count({ where: { clinicId: ctx.clinicId, startAt: { gte: ctx.from, lte: ctx.to } } }),
        prisma.appointment.count({ where: { clinicId: ctx.clinicId, startAt: { gte: ctx.previousFrom, lte: ctx.previousTo }, status: "CANCELADA" } }),
        prisma.appointment.count({ where: { clinicId: ctx.clinicId, startAt: { gte: ctx.previousFrom, lte: ctx.previousTo } } }),
      ]);
      const value = pct(cancelled, total);
      const previousValue = pct(prevCancelled, prevTotal);
      return {
        id: "appointments.cancellation_rate",
        label: "Taxa de cancelamento",
        unit: "percent",
        value,
        previousValue,
        note: `${cancelled} canceladas em ${total} marcações.`,
      };
    },
  },

  "appointments.no_show_rate": {
    id: "appointments.no_show_rate",
    label: "Taxa de faltas",
    description: "Percentagem de pacientes que não compareceram (no-show) no período.",
    permission: "appointment.view",
    unit: "percent",
    run: async (ctx) => {
      const [noShow, total, prevNoShow, prevTotal] = await Promise.all([
        prisma.appointment.count({ where: { clinicId: ctx.clinicId, startAt: { gte: ctx.from, lte: ctx.to }, status: "NAO_COMPARECEU" } }),
        prisma.appointment.count({ where: { clinicId: ctx.clinicId, startAt: { gte: ctx.from, lte: ctx.to }, status: { not: "CANCELADA" } } }),
        prisma.appointment.count({ where: { clinicId: ctx.clinicId, startAt: { gte: ctx.previousFrom, lte: ctx.previousTo }, status: "NAO_COMPARECEU" } }),
        prisma.appointment.count({ where: { clinicId: ctx.clinicId, startAt: { gte: ctx.previousFrom, lte: ctx.previousTo }, status: { not: "CANCELADA" } } }),
      ]);
      return {
        id: "appointments.no_show_rate",
        label: "Taxa de faltas",
        unit: "percent",
        value: pct(noShow, total),
        previousValue: pct(prevNoShow, prevTotal),
        note: `${noShow} faltas em ${total} marcações.`,
      };
    },
  },

  "appointments.by_doctor": {
    id: "appointments.by_doctor",
    label: "Consultas por profissional",
    description: "Ranking de profissionais por número de consultas no período. Responde a 'qual médico realizou mais consultas'.",
    permission: "doctor.stats",
    unit: "count",
    run: async (ctx) => {
      const rows = await prisma.appointment.groupBy({
        by: ["doctorId"],
        where: { clinicId: ctx.clinicId, startAt: { gte: ctx.from, lte: ctx.to }, status: { not: "CANCELADA" } },
        _count: { _all: true },
        orderBy: { _count: { doctorId: "desc" } },
        take: 10,
      });
      const doctors = await prisma.doctor.findMany({
        where: { id: { in: rows.map((r) => r.doctorId) }, clinicId: ctx.clinicId },
        select: { id: true, name: true, specialty: { select: { name: true } } },
      });
      const byId = new Map(doctors.map((d) => [d.id, d]));
      return {
        id: "appointments.by_doctor",
        label: "Consultas por profissional",
        unit: "count",
        value: rows.reduce((sum, r) => sum + r._count._all, 0),
        series: rows.map((r) => ({ label: byId.get(r.doctorId)?.name ?? "—", value: r._count._all })),
        table: {
          columns: ["Profissional", "Especialidade", "Consultas"],
          rows: rows.map((r) => [byId.get(r.doctorId)?.name ?? "—", byId.get(r.doctorId)?.specialty.name ?? "—", r._count._all]),
        },
      };
    },
  },

  "appointments.by_specialty": {
    id: "appointments.by_specialty",
    label: "Procura por especialidade",
    description: "Distribuição das consultas por especialidade no período. Responde a 'que especialidades tiveram maior procura'.",
    permission: "appointment.view",
    unit: "count",
    run: async (ctx) => {
      const rows = await prisma.appointment.groupBy({
        by: ["specialtyId"],
        where: { clinicId: ctx.clinicId, startAt: { gte: ctx.from, lte: ctx.to }, status: { not: "CANCELADA" } },
        _count: { _all: true },
        orderBy: { _count: { specialtyId: "desc" } },
        take: 12,
      });
      const specialties = await prisma.specialty.findMany({
        where: { id: { in: rows.map((r) => r.specialtyId) }, clinicId: ctx.clinicId },
        select: { id: true, name: true },
      });
      const byId = new Map(specialties.map((s) => [s.id, s.name]));
      const total = rows.reduce((sum, r) => sum + r._count._all, 0);
      return {
        id: "appointments.by_specialty",
        label: "Procura por especialidade",
        unit: "count",
        value: total,
        series: rows.map((r) => ({ label: byId.get(r.specialtyId) ?? "—", value: r._count._all })),
        table: {
          columns: ["Especialidade", "Consultas", "%"],
          rows: rows.map((r) => [byId.get(r.specialtyId) ?? "—", r._count._all, pct(r._count._all, total)]),
        },
      };
    },
  },

  "appointments.monthly_series": {
    id: "appointments.monthly_series",
    label: "Evolução de consultas",
    description: "Série mensal de consultas nos últimos 12 meses. Responde a 'evolução de consultas dos últimos seis meses'.",
    permission: "appointment.view",
    unit: "count",
    run: async (ctx) => {
      const series = await monthlySeries(ctx.clinicId, ctx.to, 12, (from, until) =>
        prisma.appointment.count({ where: { clinicId: ctx.clinicId, startAt: { gte: from, lte: until }, status: { not: "CANCELADA" } } }),
      );
      return {
        id: "appointments.monthly_series",
        label: "Evolução de consultas",
        unit: "count",
        value: series.reduce((sum, p) => sum + p.value, 0),
        series,
      };
    },
  },

  "appointments.by_weekday": {
    id: "appointments.by_weekday",
    label: "Movimento por dia da semana",
    description: "Distribuição das consultas por dia da semana. Responde a 'que dias têm maior movimento'.",
    permission: "appointment.view",
    unit: "count",
    run: async (ctx) => {
      // Agregação na base de dados — nunca carregar as marcações para o cliente.
      const rows = await prisma.$queryRaw<{ weekday: number; total: bigint }[]>`
        SELECT EXTRACT(DOW FROM "startAt")::int AS weekday, COUNT(*)::bigint AS total
        FROM "Appointment"
        WHERE "clinicId" = ${ctx.clinicId}
          AND "startAt" >= ${ctx.from}
          AND "startAt" <= ${ctx.to}
          AND "status" <> 'CANCELADA'
        GROUP BY 1
        ORDER BY 1
      `;
      const byDay = new Map(rows.map((r) => [r.weekday, Number(r.total)]));
      const series = WEEKDAY_LABELS.map((label, index) => ({ label, value: byDay.get(index) ?? 0 }));
      return {
        id: "appointments.by_weekday",
        label: "Movimento por dia da semana",
        unit: "count",
        value: series.reduce((sum, p) => sum + p.value, 0),
        series,
      };
    },
  },

  "appointments.by_hour": {
    id: "appointments.by_hour",
    label: "Movimento por hora",
    description: "Distribuição das consultas por hora do dia. Responde a 'horários de maior movimento'.",
    permission: "appointment.view",
    unit: "count",
    run: async (ctx) => {
      const rows = await prisma.$queryRaw<{ hour: number; total: bigint }[]>`
        SELECT EXTRACT(HOUR FROM "startAt")::int AS hour, COUNT(*)::bigint AS total
        FROM "Appointment"
        WHERE "clinicId" = ${ctx.clinicId}
          AND "startAt" >= ${ctx.from}
          AND "startAt" <= ${ctx.to}
          AND "status" <> 'CANCELADA'
        GROUP BY 1
        ORDER BY 1
      `;
      const series = rows.map((r) => ({ label: `${String(r.hour).padStart(2, "0")}h`, value: Number(r.total) }));
      return {
        id: "appointments.by_hour",
        label: "Movimento por hora",
        unit: "count",
        value: series.reduce((sum, p) => sum + p.value, 0),
        series,
      };
    },
  },

  "specialties.growth": {
    id: "specialties.growth",
    label: "Crescimento por especialidade",
    description: "Comparação da procura por especialidade entre o período actual e o anterior.",
    permission: "appointment.view",
    unit: "count",
    run: async (ctx) => {
      const [current, previous, specialties] = await Promise.all([
        prisma.appointment.groupBy({
          by: ["specialtyId"],
          where: { clinicId: ctx.clinicId, startAt: { gte: ctx.from, lte: ctx.to }, status: { not: "CANCELADA" } },
          _count: { _all: true },
        }),
        prisma.appointment.groupBy({
          by: ["specialtyId"],
          where: { clinicId: ctx.clinicId, startAt: { gte: ctx.previousFrom, lte: ctx.previousTo }, status: { not: "CANCELADA" } },
          _count: { _all: true },
        }),
        prisma.specialty.findMany({ where: { clinicId: ctx.clinicId }, select: { id: true, name: true } }),
      ]);
      const byId = new Map(specialties.map((s) => [s.id, s.name]));
      const prevById = new Map(previous.map((r) => [r.specialtyId, r._count._all]));
      const rows = current
        .map((r) => {
          const before = prevById.get(r.specialtyId) ?? 0;
          return {
            name: byId.get(r.specialtyId) ?? "—",
            now: r._count._all,
            before,
            delta: change(r._count._all, before),
          };
        })
        .sort((a, b) => b.now - a.now)
        .slice(0, 10);

      return {
        id: "specialties.growth",
        label: "Crescimento por especialidade",
        unit: "count",
        value: rows.reduce((sum, r) => sum + r.now, 0),
        table: {
          columns: ["Especialidade", "Período actual", "Período anterior", "Variação"],
          rows: rows.map((r) => [r.name, r.now, r.before, r.delta === undefined ? "—" : `${r.delta > 0 ? "+" : ""}${r.delta}%`]),
        },
      };
    },
  },

  "finance.revenue": {
    id: "finance.revenue",
    label: "Receita do período",
    description: "Receita reconhecida no período, em MZN, comparada com o período anterior.",
    permission: "finance.view",
    unit: "currency",
    run: async (ctx) => {
      const [current, previous] = await Promise.all([
        prisma.revenue.aggregate({ where: { clinicId: ctx.clinicId, recognisedAt: { gte: ctx.from, lte: ctx.to } }, _sum: { amount: true } }),
        prisma.revenue.aggregate({ where: { clinicId: ctx.clinicId, recognisedAt: { gte: ctx.previousFrom, lte: ctx.previousTo } }, _sum: { amount: true } }),
      ]);
      const value = current._sum.amount ?? 0;
      const previousValue = previous._sum.amount ?? 0;
      return { id: "finance.revenue", label: "Receita do período", unit: "currency", value, previousValue, changePct: change(value, previousValue) };
    },
  },

  "finance.revenue_monthly_series": {
    id: "finance.revenue_monthly_series",
    label: "Evolução da receita",
    description: "Série mensal de receita nos últimos 12 meses. Responde a comparações de receita entre meses.",
    permission: "finance.view",
    unit: "currency",
    run: async (ctx) => {
      const series = await monthlySeries(ctx.clinicId, ctx.to, 12, async (from, until) => {
        const agg = await prisma.revenue.aggregate({ where: { clinicId: ctx.clinicId, recognisedAt: { gte: from, lte: until } }, _sum: { amount: true } });
        return agg._sum.amount ?? 0;
      });
      return {
        id: "finance.revenue_monthly_series",
        label: "Evolução da receita",
        unit: "currency",
        value: series.reduce((sum, p) => sum + p.value, 0),
        series,
      };
    },
  },

  "finance.payments_received": {
    id: "finance.payments_received",
    label: "Pagamentos recebidos",
    description: "Total efectivamente recebido no período.",
    permission: "finance.view",
    unit: "currency",
    run: async (ctx) => {
      const [current, previous] = await Promise.all([
        prisma.payment.aggregate({ where: { clinicId: ctx.clinicId, receivedAt: { gte: ctx.from, lte: ctx.to } }, _sum: { amount: true } }),
        prisma.payment.aggregate({ where: { clinicId: ctx.clinicId, receivedAt: { gte: ctx.previousFrom, lte: ctx.previousTo } }, _sum: { amount: true } }),
      ]);
      const value = current._sum.amount ?? 0;
      const previousValue = previous._sum.amount ?? 0;
      return { id: "finance.payments_received", label: "Pagamentos recebidos", unit: "currency", value, previousValue, changePct: change(value, previousValue) };
    },
  },

  "finance.outstanding": {
    id: "finance.outstanding",
    label: "Valores pendentes",
    description: "Total por receber (facturas emitidas ou parcialmente pagas).",
    permission: "finance.view",
    unit: "currency",
    run: async (ctx) => {
      const agg = await prisma.invoice.aggregate({
        where: { clinicId: ctx.clinicId, status: { in: ["EMITIDA", "PARCIAL"] } },
        _sum: { total: true, amountPaid: true },
      });
      const value = (agg._sum.total ?? 0) - (agg._sum.amountPaid ?? 0);
      return { id: "finance.outstanding", label: "Valores pendentes", unit: "currency", value, note: "Saldo actual, independente do período seleccionado." };
    },
  },

  "finance.revenue_per_patient": {
    id: "finance.revenue_per_patient",
    label: "Receita média por paciente",
    description: "Receita do período dividida pelo número de pacientes distintos atendidos.",
    permission: "finance.view",
    unit: "currency",
    run: async (ctx) => {
      const [agg, patients] = await Promise.all([
        prisma.revenue.aggregate({ where: { clinicId: ctx.clinicId, recognisedAt: { gte: ctx.from, lte: ctx.to } }, _sum: { amount: true } }),
        prisma.appointment.groupBy({
          by: ["patientId"],
          where: { clinicId: ctx.clinicId, startAt: { gte: ctx.from, lte: ctx.to }, status: { not: "CANCELADA" } },
        }),
      ]);
      const revenue = agg._sum.amount ?? 0;
      const value = patients.length ? Math.round(revenue / patients.length) : 0;
      return {
        id: "finance.revenue_per_patient",
        label: "Receita média por paciente",
        unit: "currency",
        value,
        note: `${patients.length} pacientes distintos atendidos no período.`,
      };
    },
  },

  "operations.consultation_duration": {
    id: "operations.consultation_duration",
    label: "Duração média de atendimento",
    description: "Tempo médio entre o início e o fim das consultas concluídas, em minutos.",
    permission: "doctor.stats",
    unit: "minutes",
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
        label: "Duração média de atendimento",
        unit: "minutes",
        value: Math.round(row?.avg_minutes ?? 0),
        note: total ? `Baseado em ${total} consultas concluídas com hora de fim registada.` : "Sem consultas concluídas com hora de fim registada no período.",
      };
    },
  },

  "operations.doctor_productivity": {
    id: "operations.doctor_productivity",
    label: "Produtividade por profissional",
    description: "Consultas concluídas por profissional e taxa de conclusão no período.",
    permission: "doctor.stats",
    unit: "count",
    run: async (ctx) => {
      const rows = await prisma.appointment.groupBy({
        by: ["doctorId", "status"],
        where: { clinicId: ctx.clinicId, startAt: { gte: ctx.from, lte: ctx.to } },
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
        .map((d) => {
          const entry = byDoctor.get(d.id)!;
          return { name: d.name, done: entry.done, total: entry.total, rate: pct(entry.done, entry.total) };
        })
        .sort((a, b) => b.done - a.done);

      return {
        id: "operations.doctor_productivity",
        label: "Produtividade por profissional",
        unit: "count",
        value: table.reduce((sum, r) => sum + r.done, 0),
        table: {
          columns: ["Profissional", "Concluídas", "Marcadas", "Taxa de conclusão"],
          rows: table.map((r) => [r.name, r.done, r.total, `${r.rate}%`]),
        },
      };
    },
  },
};

export const METRIC_IDS = Object.keys(METRICS) as MetricId[];

export function isMetricId(value: string): value is MetricId {
  return (METRIC_IDS as string[]).includes(value);
}

/** Métricas que este perfil pode consultar. */
export function availableMetrics(has: (permission: Permission) => boolean): MetricDefinition[] {
  return METRIC_IDS.map((id) => METRICS[id]).filter((m) => has(m.permission));
}

export type PeriodKey = "este_mes" | "mes_anterior" | "ultimos_3_meses" | "ultimos_6_meses" | "ultimos_12_meses" | "ultimos_30_dias" | "este_ano";

export const PERIOD_LABEL: Record<PeriodKey, string> = {
  este_mes: "este mês",
  mes_anterior: "o mês anterior",
  ultimos_3_meses: "os últimos 3 meses",
  ultimos_6_meses: "os últimos 6 meses",
  ultimos_12_meses: "os últimos 12 meses",
  ultimos_30_dias: "os últimos 30 dias",
  este_ano: "este ano",
};

export const PERIOD_KEYS = Object.keys(PERIOD_LABEL) as PeriodKey[];

export function isPeriodKey(value: string): value is PeriodKey {
  return (PERIOD_KEYS as string[]).includes(value);
}

/** Converte um período nomeado em intervalos actual/anterior comparáveis. */
export function resolvePeriod(period: PeriodKey, now = new Date()): Omit<MetricContext, "clinicId"> {
  switch (period) {
    case "mes_anterior": {
      const anchor = subMonths(now, 1);
      return {
        from: startOfMonth(anchor),
        to: endOfMonth(anchor),
        previousFrom: startOfMonth(subMonths(anchor, 1)),
        previousTo: endOfMonth(subMonths(anchor, 1)),
      };
    }
    case "ultimos_30_dias":
      return { from: subDays(now, 30), to: now, previousFrom: subDays(now, 60), previousTo: subDays(now, 30) };
    case "ultimos_3_meses":
      return { from: startOfMonth(subMonths(now, 2)), to: now, previousFrom: startOfMonth(subMonths(now, 5)), previousTo: endOfMonth(subMonths(now, 3)) };
    case "ultimos_6_meses":
      return { from: startOfMonth(subMonths(now, 5)), to: now, previousFrom: startOfMonth(subMonths(now, 11)), previousTo: endOfMonth(subMonths(now, 6)) };
    case "ultimos_12_meses":
      return { from: startOfMonth(subMonths(now, 11)), to: now, previousFrom: startOfMonth(subMonths(now, 23)), previousTo: endOfMonth(subMonths(now, 12)) };
    case "este_ano": {
      const from = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
      const previousFrom = new Date(Date.UTC(now.getUTCFullYear() - 1, 0, 1));
      return { from, to: now, previousFrom, previousTo: new Date(Date.UTC(now.getUTCFullYear() - 1, 11, 31, 23, 59, 59)) };
    }
    case "este_mes":
    default:
      return {
        from: startOfMonth(now),
        to: now,
        previousFrom: startOfMonth(subMonths(now, 1)),
        previousTo: endOfMonth(subMonths(now, 1)),
      };
  }
}
