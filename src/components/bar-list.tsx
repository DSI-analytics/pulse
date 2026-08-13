import { formatMZN } from "@/lib/money";
import { cn } from "@/lib/utils";

export interface BarDatum {
  label: string;
  value: number;
  color?: string;
  meta?: string;
}

/** Horizontal magnitude bars (single-hue by default). Server-renderable. */
export function BarList({
  data,
  format = "mzn",
  className,
}: {
  data: BarDatum[];
  format?: "mzn" | "int";
  className?: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const fmt = (v: number) => (format === "mzn" ? formatMZN(v) : v.toLocaleString("pt-PT"));

  return (
    <div className={cn("space-y-3", className)}>
      {data.map((d) => (
        <div key={d.label} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3">
          <span className="truncate text-[13px] font-medium" title={d.label}>
            {d.label}
            {d.meta && <span className="ml-1 text-xs text-subtle-foreground">{d.meta}</span>}
          </span>
          <div className="h-2.5 overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.max(2, (d.value / max) * 100)}%`,
                backgroundColor: d.color ?? "var(--primary)",
              }}
            />
          </div>
          <span className="text-[13px] font-semibold tabular">{fmt(d.value)}</span>
        </div>
      ))}
    </div>
  );
}
