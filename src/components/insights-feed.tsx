import { Sparkles, TrendingUp, AlertTriangle, AlertCircle, Info } from "lucide-react";
import type { Insight } from "@/server/insights";
import { cn } from "@/lib/utils";
import { getTranslator } from "@/i18n/server";

const SEV = {
  INFO: { icon: Info, cls: "text-info", bg: "bg-info-muted" },
  AVISO: { icon: AlertTriangle, cls: "text-warning", bg: "bg-warning-muted" },
  CRITICO: { icon: AlertCircle, cls: "text-danger", bg: "bg-danger-muted" },
};

export async function InsightsFeed({ insights, compact = false }: { insights: Insight[]; compact?: boolean }) {
  if (insights.length === 0) {
    const t = await getTranslator();
    return <p className="text-sm text-muted-foreground">{t("insights.feed.empty")}</p>;
  }
  return (
    <div className="space-y-2">
      {insights.map((it, i) => {
        const s = SEV[it.severity];
        const Icon = it.kind === "receita" ? TrendingUp : s.icon;
        return (
          <div
            key={i}
            className="flex gap-3 rounded-[16px] bg-fill-subtle p-3 transition-colors duration-150 hover:bg-fill"
          >
            <div className={cn("flex size-8 shrink-0 items-center justify-center rounded-full", s.bg, s.cls)}>
              <Icon className="size-4" />
            </div>
            <div className="min-w-0">
              <p className="text-[13.5px] font-semibold leading-snug">{it.title}</p>
              {!compact && <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">{it.body}</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export async function InsightsHeading() {
  const t = await getTranslator();
  return (
    <span className="inline-flex items-center gap-1.5">
      <Sparkles className="size-4 text-primary" /> {t("insights.feed.heading")}
    </span>
  );
}
