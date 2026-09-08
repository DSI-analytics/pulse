import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight, CircleHelp } from "lucide-react";
import { Card } from "@/components/ui/card";
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

export function KpiCard({
  label,
  value,
  icon: Icon,
  deltaPct,
  invertDelta = false,
  deltaLabel = "vs. mês anterior",
  hint,
  description,
}: KpiCardProps) {
  const hasDelta = typeof deltaPct === "number" && Number.isFinite(deltaPct);
  const up = (deltaPct ?? 0) >= 0;
  const good = invertDelta ? !up : up;
  const indicatorDescription = description ?? hint;

  return (
    <Card
      className={cn("group relative p-4", indicatorDescription && "cursor-help")}
      tabIndex={indicatorDescription ? 0 : undefined}
      aria-label={indicatorDescription ? `${label}: ${value}. ${indicatorDescription}` : undefined}
    >
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium text-muted-foreground">{label}</span>
        <span className="flex items-center gap-1.5 text-subtle-foreground">
          {indicatorDescription && <CircleHelp className="size-3.5" aria-hidden />}
          {Icon && <Icon className="size-4" aria-hidden />}
        </span>
      </div>
      <div className="mt-2 font-display text-[24px] font-semibold leading-none tabular [overflow-wrap:anywhere]">
        {value}
      </div>
      <div className="mt-2 flex items-center gap-2">
        {hasDelta ? (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 text-[13px] font-semibold",
              good ? "text-success" : "text-danger",
            )}
          >
            {up ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
            {Math.abs(deltaPct!).toLocaleString("pt-PT", { maximumFractionDigits: 1 })}%
          </span>
        ) : null}
        <span className="text-xs text-subtle-foreground">{hint ?? deltaLabel}</span>
      </div>
      {indicatorDescription && (
        <div
          role="tooltip"
          className="pointer-events-none absolute left-3 right-3 top-full z-40 mt-2 translate-y-1 rounded-md border border-border-strong bg-foreground px-3 py-2.5 text-left text-xs leading-relaxed text-background opacity-0 shadow-lg transition-[opacity,transform] duration-150 group-hover:translate-y-0 group-hover:opacity-100 group-focus:translate-y-0 group-focus:opacity-100"
        >
          <span className="mb-0.5 block font-semibold">Sobre este indicador</span>
          {indicatorDescription}
        </div>
      )}
    </Card>
  );
}
