import "server-only";
import { startOfMonth, endOfMonth, subMonths } from "date-fns";
import { prisma } from "@/lib/prisma";
import { pct } from "@/lib/utils";
import { getFormatters, getTranslator } from "@/i18n/server";

export interface Insight {
  severity: "INFO" | "AVISO" | "CRITICO";
  title: string;
  body: string;
  kind: string;
}

/**
 * Deterministic, rule-based management insights derived from clinic data.
 * This is the surface a future LLM assistant will query — for now every card
 * is computed, not generated, and never exposes patient-level detail.
 */
export async function getInsights(clinicId: string): Promise<Insight[]> {
  const [t, f] = await Promise.all([getTranslator(), getFormatters()]);
  const now = new Date();
  const mStart = startOfMonth(now);
  const mEnd = endOfMonth(now);
  const pStart = startOfMonth(subMonths(now, 1));
  const pEnd = endOfMonth(subMonths(now, 1));

  const [revM, revP, noShowM, schedM, noShowP, schedP, lowStock, expiring, byInsurer, topSpec] =
    await Promise.all([
      prisma.revenue.aggregate({ where: { clinicId, recognisedAt: { gte: mStart, lte: mEnd } }, _sum: { amount: true } }),
      prisma.revenue.aggregate({ where: { clinicId, recognisedAt: { gte: pStart, lte: pEnd } }, _sum: { amount: true } }),
      prisma.appointment.count({ where: { clinicId, startAt: { gte: mStart, lte: mEnd }, status: "NAO_COMPARECEU" } }),
      prisma.appointment.count({ where: { clinicId, startAt: { gte: mStart, lte: mEnd }, status: { not: "CANCELADA" } } }),
      prisma.appointment.count({ where: { clinicId, startAt: { gte: pStart, lte: pEnd }, status: "NAO_COMPARECEU" } }),
      prisma.appointment.count({ where: { clinicId, startAt: { gte: pStart, lte: pEnd }, status: { not: "CANCELADA" } } }),
      prisma.inventoryItem.findMany({
        where: { clinicId },
        select: { name: true, currentStock: true, minStock: true },
      }),
      prisma.inventoryItem.findMany({
        where: { clinicId, expiryDate: { not: null, lte: new Date(now.getTime() + 30 * 86400000) } },
        select: { name: true, expiryDate: true },
      }),
      prisma.invoice.groupBy({
        by: ["healthPlanId"],
        where: { clinicId, status: { in: ["EMITIDA", "PARCIAL"] }, healthPlanId: { not: null } },
        _sum: { total: true, amountPaid: true },
      }),
      prisma.appointment.groupBy({
        by: ["specialtyId"],
        where: { clinicId, startAt: { gte: mStart, lte: mEnd }, status: { not: "CANCELADA" } },
        _count: { _all: true },
      }),
    ]);

  const insights: Insight[] = [];

  // Revenue growth
  const rM = revM._sum.amount ?? 0;
  const rP = revP._sum.amount ?? 0;
  if (rP > 0) {
    const delta = ((rM - rP) / rP) * 100;
    const deltaText = Math.abs(delta).toFixed(1);
    insights.push({
      severity: delta >= 0 ? "INFO" : "AVISO",
      kind: "receita",
      title: delta >= 0
        ? t("insights.feedItems.revenueUpTitle", { delta: deltaText })
        : t("insights.feedItems.revenueDownTitle", { delta: deltaText }),
      body: t("insights.feedItems.revenueBody", { current: f.money(rM), previous: f.money(rP) }),
    });
  }

  // No-show trend
  const nsM = pct(noShowM, schedM);
  const nsP = pct(noShowP, schedP);
  if (schedM > 0) {
    const up = nsM > nsP;
    insights.push({
      severity: nsM >= 12 ? "CRITICO" : up ? "AVISO" : "INFO",
      kind: "faltas",
      title: t("insights.feedItems.noShowTitle", { rate: nsM }),
      body:
        nsP > 0
          ? t(up ? "insights.feedItems.noShowUpBody" : "insights.feedItems.noShowDownBody", { previous: nsP })
          : t("insights.feedItems.noShowRemindersBody"),
    });
  }

  // Top specialty demand
  if (topSpec.length) {
    const total = topSpec.reduce((s, r) => s + r._count._all, 0);
    const top = topSpec.sort((a, b) => b._count._all - a._count._all)[0];
    const spec = await prisma.specialty.findUnique({ where: { id: top.specialtyId! }, select: { name: true } });
    insights.push({
      severity: "INFO",
      kind: "procura",
      title: t("insights.feedItems.demandTitle", {
        specialty: spec?.name ?? t("insights.feedItems.specialtyFallback"),
        share: pct(top._count._all, total),
      }),
      body: t("insights.feedItems.demandBody"),
    });
  }

  // Receivables concentration
  const insurerAr = byInsurer
    .map((r) => ({ id: r.healthPlanId!, ar: (r._sum.total ?? 0) - (r._sum.amountPaid ?? 0) }))
    .filter((r) => r.ar > 0);
  const totalAr = insurerAr.reduce((s, r) => s + r.ar, 0);
  if (totalAr > 0) {
    const top = insurerAr.sort((a, b) => b.ar - a.ar)[0];
    const plan = await prisma.healthPlan.findUnique({
      where: { id: top.id },
      select: { insuranceCompany: { select: { name: true } } },
    });
    insights.push({
      severity: "AVISO",
      kind: "recebiveis",
      title: t("insights.feedItems.receivablesTitle", {
        insurer: plan?.insuranceCompany.name ?? t("insights.feedItems.insurerFallback"),
        share: pct(top.ar, totalAr),
      }),
      body: t("insights.feedItems.receivablesBody", { total: f.money(totalAr) }),
    });
  }

  // Low stock
  const low = lowStock.filter((i) => i.currentStock < i.minStock);
  for (const i of low.slice(0, 2)) {
    insights.push({
      severity: i.currentStock === 0 ? "CRITICO" : "AVISO",
      kind: "stock",
      title: t(i.currentStock === 0 ? "insights.feedItems.outOfStockTitle" : "insights.feedItems.lowStockTitle", { item: i.name }),
      body: t("insights.feedItems.stockBody", { current: i.currentStock, min: i.minStock }),
    });
  }

  // Expiring
  for (const i of expiring.slice(0, 1)) {
    const days = Math.max(0, Math.round((i.expiryDate!.getTime() - now.getTime()) / 86400000));
    insights.push({
      severity: days <= 15 ? "AVISO" : "INFO",
      kind: "validade",
      title: t("insights.feedItems.expiryTitle", { item: i.name, days }),
      body: t("insights.feedItems.expiryBody"),
    });
  }

  return insights;
}
