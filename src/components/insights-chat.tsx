"use client";

import * as React from "react";
import { Send, Sparkles, ShieldAlert, User2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TrendChart } from "@/components/charts/trend-chart";

/**
 * Chat de Insights.
 *
 * O componente renderiza APENAS texto e valores numéricos vindos do backend.
 * Nada é interpretado como HTML e nenhum código produzido pelo modelo é
 * executado: o gráfico é construído a partir de um descritor validado
 * (`{ type, data: [{label, value}] }`) com os componentes já existentes no
 * sistema.
 */

interface ChartSpec {
  type: "line" | "bar" | "none";
  metric: string;
  data: { label: string; value: number }[];
  unit: "count" | "currency" | "percent" | "minutes";
}

interface AnswerPayload {
  answer: string;
  metric: {
    id: string;
    label: string;
    unit: string;
    value: number;
    formattedValue: string;
    previousValue?: number;
    changePct?: number;
    note?: string;
  } | null;
  table?: { columns: string[]; rows: (string | number)[][] };
  visualization: ChartSpec;
  periodLabel: string;
  denied?: string;
}

type Turn =
  | { role: "user"; id: string; text: string }
  | { role: "assistant"; id: string; payload: AnswerPayload }
  | { role: "error"; id: string; text: string };

let turnCounter = 0;
const nextId = () => `t${(turnCounter += 1)}`;

export function InsightsChat({ suggestions }: { suggestions: string[] }) {
  const [turns, setTurns] = React.useState<Turn[]>([]);
  const [question, setQuestion] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const endRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [turns, pending]);

  const ask = React.useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || pending) return;
    setQuestion("");
    setTurns((prev) => [...prev, { role: "user", id: nextId(), text: trimmed }]);
    setPending(true);
    try {
      const response = await fetch("/api/insights/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: trimmed }),
      });
      const data = await response.json();
      if (!response.ok) {
        setTurns((prev) => [...prev, { role: "error", id: nextId(), text: data?.error ?? "Não foi possível obter a resposta." }]);
      } else {
        setTurns((prev) => [...prev, { role: "assistant", id: nextId(), payload: data as AnswerPayload }]);
      }
    } catch {
      setTurns((prev) => [...prev, { role: "error", id: nextId(), text: "Falha de ligação. Tente novamente." }]);
    } finally {
      setPending(false);
    }
  }, [pending]);

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="min-h-[260px] flex-1 space-y-3 overflow-y-auto" role="log" aria-live="polite" aria-label="Conversa com o assistente">
        {turns.length === 0 && (
          <div className="space-y-2">
            <p className="text-[13px] text-muted-foreground">
              Pergunte em linguagem natural sobre os indicadores da sua instituição.
            </p>
            <ul className="space-y-1.5">
              {suggestions.map((s) => (
                <li key={s}>
                  <button
                    type="button"
                    onClick={() => ask(s)}
                    className="w-full rounded-md border border-dashed border-border-strong bg-surface-2/40 px-3 py-2 text-left text-[13px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                  >
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {turns.map((turn) => {
          if (turn.role === "user") {
            return (
              <div key={turn.id} className="flex justify-end">
                <p className="max-w-[85%] rounded-lg rounded-br-sm bg-primary px-3 py-2 text-[13px] text-primary-foreground">
                  <User2 className="mr-1.5 inline size-3.5 align-[-2px]" aria-hidden />
                  {turn.text}
                </p>
              </div>
            );
          }
          if (turn.role === "error") {
            return (
              <p key={turn.id} role="alert" className="rounded-lg border border-danger/40 bg-danger-muted/40 px-3 py-2 text-[13px] text-danger">
                {turn.text}
              </p>
            );
          }
          return <AssistantTurn key={turn.id} payload={turn.payload} />;
        })}

        {pending && (
          <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <Sparkles className="size-3.5 animate-pulse text-primary" aria-hidden /> A calcular…
          </p>
        )}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(question);
        }}
        className="flex gap-2"
      >
        <Input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ex.: quantos pacientes novos tivemos este mês?"
          aria-label="Pergunta"
          maxLength={500}
          disabled={pending}
        />
        <Button type="submit" size="icon" aria-label="Enviar pergunta" disabled={pending || !question.trim()}>
          <Send className="size-4" />
        </Button>
      </form>
    </div>
  );
}

function AssistantTurn({ payload }: { payload: AnswerPayload }) {
  const { metric, visualization, table } = payload;
  const kind = visualization.unit === "currency" ? "mzn" : "int";

  return (
    <div className="space-y-2.5 rounded-lg border border-border bg-surface-2/40 p-3">
      <p className="flex items-start gap-2 text-sm">
        <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
        <span className="whitespace-pre-wrap">{payload.answer}</span>
      </p>

      {payload.denied && (
        <p className="flex items-center gap-1.5 text-xs text-warning">
          <ShieldAlert className="size-3.5" aria-hidden /> Indicador restrito: {payload.denied}
        </p>
      )}

      {metric && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="rounded-md border border-border bg-surface px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-subtle-foreground">{metric.label}</p>
            <p className="font-display text-lg font-semibold tabular">{metric.formattedValue}</p>
          </div>
          {metric.changePct !== undefined && (
            <Badge variant={metric.changePct >= 0 ? "success" : "danger"}>
              {metric.changePct >= 0 ? "+" : ""}
              {metric.changePct}% vs. período anterior
            </Badge>
          )}
          <Badge variant="neutral">{payload.periodLabel}</Badge>
        </div>
      )}

      {visualization.type !== "none" && visualization.data.length > 1 && (
        <div className="rounded-md border border-border bg-surface p-2">
          <TrendChart
            data={visualization.data}
            kind={kind}
            variant={visualization.type === "line" ? "area" : "bar"}
            height={180}
          />
        </div>
      )}

      {table && table.rows.length > 0 && (
        <div className="overflow-x-auto rounded-md border border-border bg-surface">
          <Table>
            <TableHeader>
              <TableRow>
                {table.columns.map((column) => <TableHead key={column}>{column}</TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {table.rows.slice(0, 12).map((row, index) => (
                <TableRow key={index}>
                  {row.map((cell, cellIndex) => (
                    <TableCell key={cellIndex} className="text-[13px]">{String(cell)}</TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
