"use client";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatMZN, formatMZNCompact } from "@/lib/money";

type Point = { label: string; value: number };

function fmt(v: number, kind: "mzn" | "int") {
  return kind === "mzn" ? formatMZN(v) : v.toLocaleString("pt-PT");
}

function TooltipBox({ active, payload, label, kind }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2 text-xs shadow-lg">
      <p className="font-medium text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-semibold tabular">{fmt(payload[0].value, kind)}</p>
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
  const axisTick = { fontSize: 11, fill: "var(--muted-foreground)" };
  const yFmt = (v: number) => (kind === "mzn" ? formatMZNCompact(v).replace(" MZN", "") : String(v));

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
          <Bar dataKey="value" fill="var(--primary)" radius={[4, 4, 0, 0]} maxBarSize={38} />
        </BarChart>
      )}
    </ResponsiveContainer>
  );
}
