import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
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
}

export function KpiCard({
  label,
  value,
  icon: Icon,
  deltaPct,
  invertDelta = false,
  deltaLabel = "vs. mês anterior",
  hint,
}: KpiCardProps) {
  const hasDelta = typeof deltaPct === "number" && Number.isFinite(deltaPct);
  const up = (deltaPct ?? 0) >= 0;
  const good = invertDelta ? !up : up;

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium text-muted-foreground">{label}</span>
        {Icon && <Icon className="size-4 text-subtle-foreground" />}
      </div>
      <div className="mt-2 font-display text-[26px] font-semibold leading-none tracking-tight tabular">
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
    </Card>
  );
}
