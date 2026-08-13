"use client";
import * as React from "react";
import { TrendChart } from "@/components/charts/trend-chart";
import { cn } from "@/lib/utils";

export interface TrendSeries {
  key: string;
  label: string;
  kind: "mzn" | "int";
  variant: "area" | "bar";
  data: { label: string; value: number }[];
}

/** Client-side metric switcher — the chart re-renders instantly without a page reload. */
export function InteractiveTrend({ series, height = 220 }: { series: TrendSeries[]; height?: number }) {
  const [active, setActive] = React.useState(series[0]?.key);
  const current = series.find((s) => s.key === active) ?? series[0];

  return (
    <div>
      <div className="mb-3 inline-flex rounded-lg border border-border bg-surface-2 p-0.5">
        {series.map((s) => (
          <button
            key={s.key}
            onClick={() => setActive(s.key)}
            className={cn(
              "rounded-md px-3 py-1 text-[13px] font-medium transition-colors",
              s.key === active ? "bg-surface text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {s.label}
          </button>
        ))}
      </div>
      <TrendChart data={current.data} kind={current.kind} variant={current.variant} height={height} />
    </div>
  );
}
