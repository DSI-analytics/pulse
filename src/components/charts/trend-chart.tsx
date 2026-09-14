"use client";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useFormat } from "@/i18n/client";
import { barColor } from "@/lib/chart-color";

type Point = { label: string; value: number };
type TooltipPayload = { value: number };
type TooltipProps = {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
  kind: "mzn" | "int";
};

function TooltipBox({ active, payload, label, kind }: TooltipProps) {
  const f = useFormat();
  if (!active || !payload?.length) return null;
  const fmt = (v: number) => (kind === "mzn" ? f.money(v) : f.number(v));
  return (
    <div className="glass-strong rounded-[14px] px-3 py-2 text-xs">
      <p className="font-medium text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-semibold tabular">{fmt(payload[0].value)}</p>
    </div>
  );
}

export function TrendChart({
  data,
  kind = "int",
  variant = "area",
  height = 220,
}: {
  data: Point[];
  kind?: "mzn" | "int";
  variant?: "area" | "bar";
  height?: number;
}) {
  const f = useFormat();
  const axisTick = { fontSize: 11, fill: "var(--muted-foreground)" };
  // Eixo compacto sem o código da moeda (já indicado no contexto do gráfico).
  const yFmt = (v: number) => (kind === "mzn" ? f.moneyCompact(v).replace(f.currency, "").trim() : f.number(v));

  return (
    <ResponsiveContainer width="100%" height={height}>
      {variant === "area" ? (
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
          <defs>
            <linearGradient id="fillAccent" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.28} />
              <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={axisTick} />
          <YAxis tickLine={false} axisLine={false} tick={axisTick} width={46} tickFormatter={yFmt} />
          <Tooltip content={<TooltipBox kind={kind} />} cursor={{ stroke: "var(--border-strong)" }} />
          <Area
            type="monotone"
            dataKey="value"
            stroke="var(--primary)"
            strokeWidth={2.5}
            fill="url(#fillAccent)"
            dot={false}
            activeDot={{ r: 4, fill: "var(--primary)" }}
          />
        </AreaChart>
      ) : (
        <BarChart data={data} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={axisTick} />
          <YAxis tickLine={false} axisLine={false} tick={axisTick} width={40} tickFormatter={yFmt} />
          <Tooltip content={<TooltipBox kind={kind} />} cursor={{ fill: "var(--surface-2)" }} />
          {/* Tonalidades distribuídas uniformemente pela quantidade de barras. */}
          <Bar dataKey="value" fill="var(--primary)" radius={[4, 4, 0, 0]} maxBarSize={38}>
            {data.map((point, index) => (
              <Cell key={`${point.label}-${index}`} fill={barColor(index, data.length)} />
            ))}
          </Bar>
        </BarChart>
      )}
    </ResponsiveContainer>
  );
}
