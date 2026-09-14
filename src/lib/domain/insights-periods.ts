import { fromZonedTime } from "date-fns-tz";
import type { PeriodKey } from "./insights-catalog";

/**
 * Janelas temporais dos Insights, calculadas no fuso horário da clínica.
 *
 * "Hoje", "esta semana" ou "este mês" começam à meia-noite LOCAL (não em UTC
 * nem no fuso do servidor). Cada período traz também o período anterior
 * comparável e a janela do gráfico mensal (quantos meses e até quando).
 */

export interface PeriodWindow {
  from: Date;
  to: Date;
  previousFrom: Date;
  previousTo: Date;
  /** Último instante coberto pelo gráfico mensal. */
  seriesEnd: Date;
  /** Número de meses do gráfico mensal. */
  seriesMonths: number;
}

const DAY_MS = 86_400_000;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface LocalParts {
  year: number;
  /** 1–12 */
  month: number;
  day: number;
  /** 0 = domingo */
  weekday: number;
}

export function localParts(date: Date, timeZone: string): LocalParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "short",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    weekday: WEEKDAYS.indexOf(get("weekday")),
  };
}

const pad = (value: number) => String(value).padStart(2, "0");

/** Meia-noite local de (ano, mês, dia) como instante UTC. Aceita valores fora do intervalo (mês 0, dia -3…). */
export function zonedMidnight(year: number, month: number, day: number, timeZone: string): Date {
  const normalised = new Date(Date.UTC(year, month - 1, day));
  const iso = `${String(normalised.getUTCFullYear()).padStart(4, "0")}-${pad(normalised.getUTCMonth() + 1)}-${pad(normalised.getUTCDate())}T00:00:00`;
  return fromZonedTime(iso, timeZone);
}

const justBefore = (date: Date) => new Date(date.getTime() - 1);
const minus = (date: Date, ms: number) => new Date(date.getTime() - ms);

/**
 * Fim do período anterior para períodos "até agora" (mês corrente, últimos N
 * meses): a mesma duração já decorrida, para comparar o comparável — o dia 15
 * deste mês compara com o dia 15 do mês passado, não com o mês inteiro.
 */
function sameElapsed(previousFrom: Date, from: Date, to: Date): Date {
  return new Date(Math.min(previousFrom.getTime() + (to.getTime() - from.getTime()), from.getTime() - 1));
}

export function resolvePeriod(period: PeriodKey, timeZone: string, now: Date = new Date()): PeriodWindow {
  const { year, month, day, weekday } = localParts(now, timeZone);
  const midnight = (y: number, m: number, d: number) => zonedMidnight(y, m, d, timeZone);
  const today = midnight(year, month, day);
  const monthStart = (offset: number) => midnight(year, month + offset, 1);
  const sinceMonday = (weekday + 6) % 7;
  const thisMonday = midnight(year, month, day - sinceMonday);
  const lastMonday = midnight(year, month, day - sinceMonday - 7);

  switch (period) {
    case "hoje":
      return { from: today, to: now, previousFrom: midnight(year, month, day - 1), previousTo: minus(now, DAY_MS), seriesEnd: now, seriesMonths: 12 };
    case "ontem": {
      const yesterday = midnight(year, month, day - 1);
      return { from: yesterday, to: justBefore(today), previousFrom: midnight(year, month, day - 2), previousTo: justBefore(yesterday), seriesEnd: now, seriesMonths: 12 };
    }
    case "esta_semana":
      return { from: thisMonday, to: now, previousFrom: lastMonday, previousTo: minus(now, 7 * DAY_MS), seriesEnd: now, seriesMonths: 12 };
    case "semana_passada":
      return {
        from: lastMonday,
        to: justBefore(thisMonday),
        previousFrom: midnight(year, month, day - sinceMonday - 14),
        previousTo: justBefore(lastMonday),
        seriesEnd: now,
        seriesMonths: 12,
      };
    case "ultimos_7_dias":
      return { from: minus(now, 7 * DAY_MS), to: now, previousFrom: minus(now, 14 * DAY_MS), previousTo: minus(now, 7 * DAY_MS), seriesEnd: now, seriesMonths: 12 };
    case "mes_anterior":
      return { from: monthStart(-1), to: justBefore(monthStart(0)), previousFrom: monthStart(-2), previousTo: justBefore(monthStart(-1)), seriesEnd: justBefore(monthStart(0)), seriesMonths: 12 };
    case "ultimos_30_dias":
      return { from: minus(now, 30 * DAY_MS), to: now, previousFrom: minus(now, 60 * DAY_MS), previousTo: minus(now, 30 * DAY_MS), seriesEnd: now, seriesMonths: 12 };
    case "ultimos_3_meses":
      return { from: monthStart(-2), to: now, previousFrom: monthStart(-5), previousTo: sameElapsed(monthStart(-5), monthStart(-2), now), seriesEnd: now, seriesMonths: 3 };
    case "ultimos_6_meses":
      return { from: monthStart(-5), to: now, previousFrom: monthStart(-11), previousTo: sameElapsed(monthStart(-11), monthStart(-5), now), seriesEnd: now, seriesMonths: 6 };
    case "ultimos_12_meses":
      return { from: monthStart(-11), to: now, previousFrom: monthStart(-23), previousTo: sameElapsed(monthStart(-23), monthStart(-11), now), seriesEnd: now, seriesMonths: 12 };
    case "este_ano": {
      // Comparação justa: o mesmo intervalo (1 jan → mesmo dia/hora) do ano anterior.
      const elapsedToday = now.getTime() - today.getTime();
      return {
        from: midnight(year, 1, 1),
        to: now,
        previousFrom: midnight(year - 1, 1, 1),
        previousTo: new Date(midnight(year - 1, month, day).getTime() + elapsedToday),
        seriesEnd: now,
        seriesMonths: Math.max(2, month),
      };
    }
    case "ano_passado":
      return {
        from: midnight(year - 1, 1, 1),
        to: justBefore(midnight(year, 1, 1)),
        previousFrom: midnight(year - 2, 1, 1),
        previousTo: justBefore(midnight(year - 1, 1, 1)),
        seriesEnd: justBefore(midnight(year, 1, 1)),
        seriesMonths: 12,
      };
    case "este_mes":
    default:
      return { from: monthStart(0), to: now, previousFrom: monthStart(-1), previousTo: sameElapsed(monthStart(-1), monthStart(0), now), seriesEnd: now, seriesMonths: 12 };
  }
}

export interface MonthBucket {
  from: Date;
  to: Date;
  year: number;
  /** 1–12 */
  month: number;
}

/** Meses locais consecutivos que terminam no mês de `end` (inclusive). */
export function monthBuckets(end: Date, months: number, timeZone: string): MonthBucket[] {
  const { year, month } = localParts(end, timeZone);
  const buckets: MonthBucket[] = [];
  for (let offset = months - 1; offset >= 0; offset -= 1) {
    const from = zonedMidnight(year, month - offset, 1, timeZone);
    const next = zonedMidnight(year, month - offset + 1, 1, timeZone);
    const label = new Date(Date.UTC(year, month - 1 - offset, 1));
    buckets.push({ from, to: justBefore(next), year: label.getUTCFullYear(), month: label.getUTCMonth() + 1 });
  }
  return buckets;
}
