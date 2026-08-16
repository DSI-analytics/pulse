import "server-only";
import { startOfMonth, endOfMonth, subMonths, format } from "date-fns";
import { prisma } from "@/lib/prisma";

const PAYMENT_LABEL: Record<string, string> = {
  DINHEIRO: "Dinheiro",
  MPESA: "M-Pesa",
  EMOLA: "e-Mola",
  CARTAO: "Cartão",
  TRANSFERENCIA: "Transferência",
  SEGURADORA: "Seguradora",
};

export async function getFinanceData(clinicId: string) {
  const now = new Date();
  const mStart = startOfMonth(now);
  const mEnd = endOfMonth(now);

  const [revAgg, expAgg, completed, receivables, payablesExp, payablesPur, byMethod, recentRev, recentExp, revTrendRows, expTrendRows] =
    await Promise.all([
      prisma.revenue.aggregate({ where: { clinicId, recognisedAt: { gte: mStart, lte: mEnd } }, _sum: { amount: true } }),
      prisma.expense.aggregate({ where: { clinicId, incurredAt: { gte: mStart, lte: now } }, _sum: { amount: true } }),
      prisma.appointment.count({ where: { clinicId, startAt: { gte: mStart, lte: mEnd }, status: "CONCLUIDA" } }),
      prisma.invoice.aggregate({ where: { clinicId, status: { in: ["EMITIDA", "PARCIAL"] } }, _sum: { total: true, amountPaid: true } }),
      prisma.expense.aggregate({ where: { clinicId, status: "PENDENTE" }, _sum: { amount: true } }),
      prisma.purchase.aggregate({ where: { clinicId, paymentStatus: { in: ["PENDENTE", "PARCIAL"] } }, _sum: { total: true } }),
      prisma.payment.groupBy({ by: ["method"], where: { clinicId, receivedAt: { gte: mStart, lte: mEnd } }, _sum: { amount: true } }),
      prisma.revenue.findMany({
        where: { clinicId }, orderBy: { recognisedAt: "desc" }, take: 8,
        select: { id: true, description: true, amount: true, source: true, recognisedAt: true, method: true, patient: { select: { name: true } } },
      }),
      prisma.expense.findMany({
        where: { clinicId }, orderBy: { incurredAt: "desc" }, take: 8,
        select: { id: true, description: true, amount: true, status: true, incurredAt: true, categoryId: true, method: true, category: { select: { name: true } } },
      }),
      prisma.revenue.findMany({ where: { clinicId, recognisedAt: { gte: startOfMonth(subMonths(now, 5)) } }, select: { amount: true, recognisedAt: true } }),
      prisma.expense.findMany({ where: { clinicId, incurredAt: { gte: startOfMonth(subMonths(now, 5)) } }, select: { amount: true, incurredAt: true } }),
    ]);

  const revenue = revAgg._sum.amount ?? 0;
  const expenses = expAgg._sum.amount ?? 0;
  const result = revenue - expenses;
  const receivable = (receivables._sum.total ?? 0) - (receivables._sum.amountPaid ?? 0);
  const payable = (payablesExp._sum.amount ?? 0) + (payablesPur._sum.total ?? 0);
  const ticket = completed ? Math.round(revenue / completed) : 0;
  const margin = revenue ? Math.round((result / revenue) * 100) : 0;

  const months = Array.from({ length: 6 }, (_, i) => subMonths(now, 5 - i)).map((d) => ({
    key: format(d, "yyyy-MM"),
    label: format(d, "LLL").replace(/^./, (c) => c.toUpperCase()),
  }));
  const bucket = (rows: { amount: number; d: Date }[]) => {
    const m = new Map(months.map((x) => [x.key, 0]));
    for (const r of rows) {
      const k = format(r.d, "yyyy-MM");
      if (m.has(k)) m.set(k, m.get(k)! + r.amount);
    }
    return months.map((x) => ({ label: x.label, value: m.get(x.key)! }));
  };
  const revenueTrend = bucket(revTrendRows.map((r) => ({ amount: r.amount, d: r.recognisedAt })));
  const expenseTrend = bucket(expTrendRows.map((r) => ({ amount: r.amount, d: r.incurredAt })));
  const resultTrend = revenueTrend.map((r, i) => ({ label: r.label, value: r.value - expenseTrend[i].value }));

  const byPaymentMethod = byMethod
    .map((m) => ({ label: PAYMENT_LABEL[m.method] ?? m.method, value: m._sum.amount ?? 0 }))
    .sort((a, b) => b.value - a.value);

  return {
    kpis: { revenue, expenses, result, margin, receivable, payable, ticket },
    revenueTrend, expenseTrend, resultTrend, byPaymentMethod,
    recentRev, recentExp,
  };
}

export { PAYMENT_LABEL };
