import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight, CircleHelp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { getFormatters, getTranslator } from "@/i18n/server";
import { cn } from "@/lib/utils";

export interface KpiCardProps {
  label: string;
  value: string;
  icon?: LucideIcon;
  /** Percentage change vs previous period (e.g. 12.4). Positive = up. */
  deltaPct?: number;
  /** When true, a downward trend is "good" (e.g. no-show rate). */
  invertDelta?: boolean;
  deltaLabel?: string;
  hint?: string;
  description?: string;
}

export async function KpiCard({
  label,
  value,
  icon: Icon,
  deltaPct,
  invertDelta = false,
  deltaLabel,
  hint,
  description,
}: KpiCardProps) {
  const [t, f] = await Promise.all([getTranslator(), getFormatters()]);
  const hasDelta = typeof deltaPct === "number" && Number.isFinite(deltaPct);
  const up = (deltaPct ?? 0) >= 0;
  const good = invertDelta ? !up : up;
  const indicatorDescription = description ?? hint;

  return (
    <Card
      className={cn(
        "group relative p-4 hover:z-20 hover:shadow-card-hover hover:[--card-border:var(--primary-edge)] focus-within:z-20 focus-within:shadow-card-hover",
        indicatorDescription && "cursor-help",
      )}
      tabIndex={indicatorDescription ? 0 : undefined}
      aria-label={indicatorDescription ? `${label}: ${value}. ${indicatorDescription}` : undefined}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-medium text-muted-foreground">{label}</span>
        <span className="flex items-center gap-1.5 text-subtle-foreground">
          {indicatorDescription && (
            <CircleHelp className="size-3.5 text-subtle-foreground group-hover:text-primary" aria-hidden />
          )}
          {Icon && (
            <span className="flex size-7 items-center justify-center rounded-full border border-border bg-fill group-hover:border-primary-edge group-hover:bg-primary-muted group-hover:text-primary">
              <Icon className="size-3.5" aria-hidden />
            </span>
          )}
        </span>
      </div>
      <div className="mt-2 font-display text-[26px] font-semibold leading-none tracking-[-0.02em] tabular antialiased [overflow-wrap:anywhere]">
        {value}
      </div>
      <div className="mt-2.5 flex items-center gap-2">
        {hasDelta ? (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[12px] font-semibold",
              good ? "border-success-edge bg-success-muted text-success" : "border-danger-edge bg-danger-muted text-danger",
            )}
          >
            {up ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
            {f.number(Math.abs(deltaPct!), 1)}%
          </span>
        ) : null}
        <span className="text-xs text-subtle-foreground">{hint ?? deltaLabel ?? t("common.vsLastMonth")}</span>
      </div>
      {indicatorDescription && (
        // Aparece por visibilidade + deslocação — nunca por opacidade sobre o texto.
        <div
          role="tooltip"
          className="glass-tooltip pointer-events-none absolute right-2 top-[calc(100%+0.5rem)] z-50 w-max min-w-44 max-w-[calc(100vw-2rem)] origin-top-right translate-y-2 scale-[0.96] rounded-[14px] px-3 py-2.5 text-left text-xs leading-relaxed text-foreground opacity-0 blur-[2px] transition-[opacity,transform,filter] duration-[360ms] ease-[var(--ease-spring)] group-hover:translate-y-0 group-hover:scale-100 group-hover:opacity-100 group-hover:blur-none group-focus:translate-y-0 group-focus:scale-100 group-focus:opacity-100 group-focus:blur-none sm:max-w-80"
        >
          <span className="mb-0.5 block font-semibold">{t("common.aboutIndicator")}</span>
          <span className="text-muted-foreground">{indicatorDescription}</span>
        </div>
      )}
    </Card>
  );
}
