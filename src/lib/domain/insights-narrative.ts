import type { Translator } from "@/i18n/translate";
import type { MetricResult, MetricUnit } from "@/server/analytics-metrics";

/**
 * Texto da resposta a partir dos números calculados — sem IA.
 *
 * Cada forma de métrica tem a sua leitura: quem lidera um ranking, o maior
 * grupo de uma distribuição, os picos de movimento, a tendência de uma série
 * ou os artigos mais críticos de uma lista. Só usa valores fornecidos.
 */

export type FormatValue = (unit: MetricUnit, value: number) => string;

type NarrativeInput = Pick<
  MetricResult,
  "label" | "unit" | "shape" | "value" | "previousValue" | "changePct" | "series" | "note" | "highlights"
>;

function share(part: number, total: number): number {
  return total ? Math.round((part / total) * 100) : 0;
}

export function joinList(items: string[], t: Translator): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} ${t("insights.narrative.and")} ${items[items.length - 1]}`;
}

export function narrate(result: NarrativeInput, periodLabel: string, t: Translator, formatValue: FormatValue): string {
  const metric = result.label;
  const format = (value: number) => formatValue(result.unit, value);
  const points = result.series ?? [];
  const parts: string[] = [];

  const hasData =
    result.shape === "value" || result.shape === "list" ? true : points.some((point) => point.value !== 0);
  if (!hasData) {
    parts.push(t("insights.narrative.noData", { metric, period: periodLabel }));
    if (result.note) parts.push(result.note);
    return parts.join(" ");
  }

  switch (result.shape) {
    case "ranking": {
      const sorted = [...points].sort((a, b) => b.value - a.value);
      const total = result.value || sorted.reduce((sum, point) => sum + point.value, 0);
      const [top, ...rest] = sorted;
      parts.push(
        t("insights.narrative.leader", {
          metric,
          period: periodLabel,
          top: top.label,
          value: format(top.value),
          share: share(top.value, total),
          total: format(total),
        }),
      );
      const runnersUp = rest.filter((point) => point.value > 0).slice(0, 2).map((point) => `${point.label} (${format(point.value)})`);
      if (runnersUp.length) parts.push(t("insights.narrative.runnersUp", { items: joinList(runnersUp, t) }));
      break;
    }
    case "distribution": {
      const sorted = [...points].sort((a, b) => b.value - a.value);
      const total = sorted.reduce((sum, point) => sum + point.value, 0);
      parts.push(
        t("insights.narrative.largestGroup", {
          metric,
          period: periodLabel,
          top: sorted[0].label,
          value: format(sorted[0].value),
          share: share(sorted[0].value, total),
          total: format(total),
        }),
      );
      const others = sorted
        .slice(1, 3)
        .filter((point) => point.value > 0)
        .map((point) => `${point.label} (${format(point.value)}, ${share(point.value, total)}%)`);
      if (others.length) parts.push(t("insights.narrative.runnersUp", { items: joinList(others, t) }));
      break;
    }
    case "growth": {
      parts.push(
        result.highlights?.length
          ? t("insights.narrative.growth", { metric, period: periodLabel, items: joinList(result.highlights.slice(0, 3), t) })
          : t("insights.narrative.growthNone", { metric, period: periodLabel }),
      );
      break;
    }
    case "peaks": {
      const withData = points.filter((point) => point.value > 0);
      const top = withData.reduce((a, b) => (b.value > a.value ? b : a));
      const bottom = withData.reduce((a, b) => (b.value < a.value ? b : a));
      parts.push(
        t("insights.narrative.peaks", {
          metric,
          period: periodLabel,
          top: top.label,
          value: format(top.value),
          bottom: bottom.label,
          bottomValue: format(bottom.value),
        }),
      );
      break;
    }
    case "series": {
      const total = points.reduce((sum, point) => sum + point.value, 0);
      parts.push(t("insights.narrative.series", { metric, total: format(total), months: points.length }));
      if (points.length >= 2) {
        const max = points.reduce((a, b) => (b.value > a.value ? b : a));
        const min = points.reduce((a, b) => (b.value < a.value ? b : a));
        parts.push(t("insights.narrative.seriesExtremes", { max: max.label, maxValue: format(max.value), min: min.label, minValue: format(min.value) }));
        const first = points[0].value;
        const last = points[points.length - 1].value;
        if (first > 0) {
          const delta = Math.round(((last - first) / first) * 1000) / 10;
          parts.push(t("insights.narrative.seriesChange", { delta: `${delta >= 0 ? "+" : ""}${delta}` }));
        }
      }
      break;
    }
    case "list": {
      if (result.value === 0) {
        parts.push(t("insights.narrative.listEmpty", { metric }));
      } else {
        parts.push(t("insights.narrative.list", { metric, count: result.value }));
        if (result.highlights?.length) parts.push(t("insights.narrative.listItems", { items: joinList(result.highlights.slice(0, 3), t) }));
      }
      break;
    }
    case "value":
    default: {
      parts.push(t("insights.answers.summary", { metric, period: periodLabel, value: format(result.value) }));
      if (result.previousValue !== undefined) {
        const previous = format(result.previousValue);
        if (result.changePct === undefined) {
          parts.push(t("insights.answers.previous", { value: previous }));
        } else {
          const delta = result.changePct;
          parts.push(
            t(result.value >= result.previousValue ? "insights.answers.changeAbove" : "insights.answers.changeBelow", {
              delta: `${delta >= 0 ? "+" : ""}${delta}`,
              value: previous,
            }),
          );
        }
      }
    }
  }

  if (result.note) parts.push(result.note);
  return parts.join(" ");
}
