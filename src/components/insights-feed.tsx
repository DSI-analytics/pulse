import { Sparkles, TrendingUp, AlertTriangle, AlertCircle, Info } from "lucide-react";
import type { Insight } from "@/server/insights";
import { cn } from "@/lib/utils";

const SEV = {
  INFO: { icon: Info, cls: "text-info", bg: "bg-info-muted" },
  AVISO: { icon: AlertTriangle, cls: "text-warning", bg: "bg-warning-muted" },
  CRITICO: { icon: AlertCircle, cls: "text-danger", bg: "bg-danger-muted" },
};

export function InsightsFeed({ insights, compact = false }: { insights: Insight[]; compact?: boolean }) {
  if (insights.length === 0) {
    return <p className="text-sm text-muted-foreground">Sem alertas de gestão neste momento.</p>;
  }
  return (
    <div className="space-y-2.5">
      {insights.map((it, i) => {
        const s = SEV[it.severity];
        const Icon = it.kind === "receita" ? TrendingUp : s.icon;
        return (
          <div
            key={i}
            className="flex gap-3 rounded-lg border border-border bg-surface-2/60 p-3"
          >
            <div className={cn("flex size-8 shrink-0 items-center justify-center rounded-md", s.bg, s.cls)}>
              <Icon className="size-4" />
            </div>
            <div className="min-w-0">
              <p className="text-[13.5px] font-semibold leading-snug">{it.title}</p>
              {!compact && <p className="mt-0.5 text-[13px] text-muted-foreground">{it.body}</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function InsightsHeading() {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Sparkles className="size-4 text-primary" /> Insights do Pulso
    </span>
  );
}
