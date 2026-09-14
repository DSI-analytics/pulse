"use client";

import * as React from "react";
import { MessageSquarePlus, Send, Sparkles, ShieldAlert, User2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TrendChart } from "@/components/charts/trend-chart";
import { useT } from "@/i18n/client";

/**
 * Chat de Insights.
 *
 * O componente renderiza APENAS texto e valores numéricos vindos do backend.
 * Nada é interpretado como HTML e nenhum código produzido pelo modelo é
 * executado: o gráfico é construído a partir de um descritor validado
 * (`{ type, data: [{label, value}] }`) com os componentes já existentes.
 *
 * A conversa guarda o contexto da última resposta (métrica e período) para
 * que continuações como "e no mês passado?" funcionem.
 */

interface ChartSpec {
  type: "line" | "bar" | "none";
  metric: string | null;
  data: { label: string; value: number }[];
  unit: "count" | "currency" | "percent" | "minutes";
}

interface Suggestion {
  question: string;
  label: string;
}

interface AnswerPayload {
  kind: "metric" | "denied" | "unknown" | "clinical" | "forecast" | "smalltalk";
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
  suggestions?: Suggestion[];
  context?: { metric: string | null; period: string };
}

type Turn =
  | { role: "user"; id: string; text: string }
  | { role: "assistant"; id: string; payload: AnswerPayload }
  | { role: "error"; id: string; text: string };

let turnCounter = 0;
const nextId = () => `t${(turnCounter += 1)}`;

export function InsightsChat({ suggestions }: { suggestions: Suggestion[] }) {
  const t = useT();
  const [turns, setTurns] = React.useState<Turn[]>([]);
  const [question, setQuestion] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const contextRef = React.useRef<AnswerPayload["context"] | null>(null);
  const endRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

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
        body: JSON.stringify({ question: trimmed, context: contextRef.current ?? undefined }),
      });
      const data = await response.json();
      if (!response.ok) {
        setTurns((prev) => [...prev, { role: "error", id: nextId(), text: data?.error ?? t("insights.chat.fetchError") }]);
      } else {
        const payload = data as AnswerPayload;
        if (payload.context) contextRef.current = payload.context;
        setTurns((prev) => [...prev, { role: "assistant", id: nextId(), payload }]);
      }
    } catch {
      setTurns((prev) => [...prev, { role: "error", id: nextId(), text: t("insights.chat.networkError") }]);
    } finally {
      setPending(false);
      inputRef.current?.focus();
    }
  }, [pending, t]);

  function reset() {
    contextRef.current = null;
    setTurns([]);
    setQuestion("");
    inputRef.current?.focus();
  }

  const lastAssistantId = [...turns].reverse().find((turn) => turn.role === "assistant")?.id;

  return (
    <div className="flex h-full flex-col gap-3">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(question);
        }}
        className="glass-thin flex shrink-0 items-center gap-2 rounded-[20px] p-2 transition-[border-color,box-shadow] duration-300 focus-within:border-primary focus-within:shadow-[0_0_0_3px_var(--primary-muted)]"
      >
        {turns.length > 0 && (
          <Button type="button" variant="ghost" size="icon" className="size-11 shrink-0 bg-fill" onClick={reset} aria-label={t("insights.chat.newConversation")} title={t("insights.chat.newConversation")}>
            <MessageSquarePlus className="size-4" />
          </Button>
        )}
        <div className="relative min-w-0 flex-1">
          <Sparkles className="pointer-events-none absolute left-4 top-1/2 z-10 size-4 -translate-y-1/2 text-primary" aria-hidden />
          <Input
            ref={inputRef}
            className="h-12 border-primary-edge bg-surface pl-11 pr-4 text-[15px] shadow-card placeholder:text-muted-foreground hover:border-primary focus-visible:border-primary focus-visible:bg-surface focus-visible:shadow-[0_0_0_3px_var(--primary-muted)]"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={t("insights.chat.placeholder")}
            aria-label={t("insights.chat.questionLabel")}
            maxLength={500}
            disabled={pending}
          />
        </div>
        <Button type="submit" size="icon" className="size-12 shrink-0" aria-label={t("insights.chat.send")} disabled={pending || !question.trim()}>
          <Send className="size-4" />
        </Button>
      </form>

      <div className="min-h-[260px] flex-1 space-y-3 overflow-y-auto" role="log" aria-live="polite" aria-label={t("insights.chat.logLabel")}>
        {turns.length === 0 && (
          <div className="space-y-2">
            <p className="text-[13px] text-muted-foreground">{t("insights.chat.intro")}</p>
            <SuggestionList suggestions={suggestions} onPick={ask} disabled={pending} />
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
              <p key={turn.id} role="alert" className="rounded-lg border border-danger-edge bg-danger-muted px-3 py-2 text-[13px] text-danger">
                {turn.text}
              </p>
            );
          }
          return (
            <AssistantTurn
              key={turn.id}
              payload={turn.payload}
              showSuggestions={turn.id === lastAssistantId && !pending}
              onPick={ask}
            />
          );
        })}

        {pending && (
          <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <Sparkles className="size-3.5 animate-pulse text-primary" aria-hidden /> {t("insights.chat.thinking")}
          </p>
        )}
        <div ref={endRef} />
      </div>

    </div>
  );
}

function SuggestionList({ suggestions, onPick, disabled }: { suggestions: Suggestion[]; onPick: (question: string) => void; disabled?: boolean }) {
  return (
    <ul className="space-y-1.5">
      {suggestions.map((suggestion) => (
        <li key={suggestion.question}>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onPick(suggestion.question)}
            className="w-full rounded-md border border-dashed border-border-strong bg-fill-subtle px-3 py-2 text-left text-[13px] text-muted-foreground transition-colors hover:border-primary-edge hover:text-foreground disabled:cursor-not-allowed"
          >
            {suggestion.label}
          </button>
        </li>
      ))}
    </ul>
  );
}

function AssistantTurn({
  payload,
  showSuggestions,
  onPick,
}: {
  payload: AnswerPayload;
  showSuggestions: boolean;
  onPick: (question: string) => void;
}) {
  const t = useT();
  const { metric, visualization, table } = payload;
  const kind = visualization.unit === "currency" ? "mzn" : "int";

  return (
    <div className="space-y-2.5 rounded-lg border border-border bg-fill-subtle p-3">
      <p className="flex items-start gap-2 text-sm">
        <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
        <span className="whitespace-pre-wrap">{payload.answer}</span>
      </p>

      {payload.denied && (
        <p className="flex items-center gap-1.5 text-xs text-warning">
          <ShieldAlert className="size-3.5" aria-hidden /> {t("insights.chat.restricted", { metric: payload.denied })}
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
              {t("insights.chat.vsPrevious", { value: `${metric.changePct >= 0 ? "+" : ""}${metric.changePct}` })}
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

      {showSuggestions && payload.suggestions && payload.suggestions.length > 0 && (
        <div className="space-y-1.5 border-t border-border pt-2.5">
          <p className="text-[12px] font-medium text-muted-foreground">
            {payload.kind === "metric" ? t("insights.chat.followUps") : t("insights.chat.tryAsking")}
          </p>
          <SuggestionList suggestions={payload.suggestions} onPick={onPick} />
        </div>
      )}
    </div>
  );
}
