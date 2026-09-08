"use client";

import * as React from "react";
import {
  Activity, AlertTriangle, CalendarClock, ClipboardList, FileText, FlaskConical,
  HeartPulse, Hospital, Pill, Stethoscope, Syringe, LogOut,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { loadPatientTimeline } from "@/server/timeline-actions";
import type { TimelineEvent, TimelineEventType } from "@/server/clinical-record";

const ICON: Record<TimelineEventType, React.ComponentType<{ className?: string }>> = {
  EPISODIO: ClipboardList,
  CONSULTA: Stethoscope,
  DIAGNOSTICO: AlertTriangle,
  SINAIS_VITAIS: HeartPulse,
  ALERGIA: Activity,
  PRESCRICAO: Pill,
  EXAME: FlaskConical,
  RESULTADO: FlaskConical,
  PROCEDIMENTO: Syringe,
  TRATAMENTO: CalendarClock,
  INTERNAMENTO: Hospital,
  ALTA: LogOut,
  DOCUMENTO: FileText,
};

const TYPE_OPTIONS: { value: TimelineEventType; label: string }[] = [
  { value: "CONSULTA", label: "Consultas" },
  { value: "EPISODIO", label: "Episódios" },
  { value: "DIAGNOSTICO", label: "Diagnósticos" },
  { value: "SINAIS_VITAIS", label: "Sinais vitais" },
  { value: "ALERGIA", label: "Alergias" },
  { value: "PRESCRICAO", label: "Prescrições" },
  { value: "EXAME", label: "Pedidos de exame" },
  { value: "RESULTADO", label: "Resultados" },
  { value: "PROCEDIMENTO", label: "Procedimentos" },
  { value: "TRATAMENTO", label: "Tratamentos" },
  { value: "INTERNAMENTO", label: "Internamentos" },
  { value: "ALTA", label: "Altas" },
  { value: "DOCUMENTO", label: "Documentos" },
];

function formatStamp(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString("pt-PT", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function toneClass(severity?: TimelineEvent["severity"]): string {
  if (severity === "CRITICO") return "border-danger/60 bg-danger-muted/40";
  if (severity === "AVISO") return "border-warning/50 bg-warning-muted/30";
  return "border-border bg-surface-2/40";
}

export interface TimelineFilterOption {
  value: string;
  label: string;
}

/**
 * Linha temporal clínica com filtros e carregamento incremental.
 *
 * O cliente nunca recebe o histórico completo: pede páginas por cursor de data
 * ao servidor, que revalida permissão e clínica em cada pedido.
 */
export function ClinicalTimeline({
  patientId,
  initialEvents,
  initialCursor,
  initialHasMore,
  specialties,
  doctors,
}: {
  patientId: string;
  initialEvents: TimelineEvent[];
  initialCursor: string | null;
  initialHasMore: boolean;
  specialties: TimelineFilterOption[];
  doctors: TimelineFilterOption[];
}) {
  const [events, setEvents] = React.useState(initialEvents);
  const [cursor, setCursor] = React.useState(initialCursor);
  const [hasMore, setHasMore] = React.useState(initialHasMore);
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  const [type, setType] = React.useState("");
  const [specialtyId, setSpecialtyId] = React.useState("");
  const [doctorId, setDoctorId] = React.useState("");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");

  const query = React.useCallback(
    (before?: string | null) => ({
      patientId,
      types: type ? [type] : undefined,
      specialtyId: specialtyId || undefined,
      doctorId: doctorId || undefined,
      from: from || undefined,
      to: to || undefined,
      before: before ?? undefined,
    }),
    [patientId, type, specialtyId, doctorId, from, to],
  );

  const applyFilters = React.useCallback(() => {
    setError(null);
    startTransition(async () => {
      const result = await loadPatientTimeline(query(null));
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setEvents(result.events);
      setCursor(result.nextCursor);
      setHasMore(result.hasMore);
    });
  }, [query]);

  const loadMore = React.useCallback(() => {
    if (!cursor) return;
    setError(null);
    startTransition(async () => {
      const result = await loadPatientTimeline(query(cursor));
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setEvents((prev) => {
        const seen = new Set(prev.map((e) => e.id));
        return [...prev, ...result.events.filter((e) => !seen.has(e.id))];
      });
      setCursor(result.nextCursor);
      setHasMore(result.hasMore);
    });
  }, [cursor, query]);

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center">
        <Select aria-label="Tipo de evento" value={type} onChange={(e) => setType(e.target.value)} className="w-full md:w-auto md:min-w-40">
          <option value="">Tipo: Todos</option>
          {TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
        <Select aria-label="Especialidade" value={specialtyId} onChange={(e) => setSpecialtyId(e.target.value)} className="w-full md:w-auto md:min-w-40">
          <option value="">Especialidade: Todas</option>
          {specialties.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
        <Select aria-label="Profissional" value={doctorId} onChange={(e) => setDoctorId(e.target.value)} className="w-full md:w-auto md:min-w-40">
          <option value="">Profissional: Todos</option>
          {doctors.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
        <Input type="date" aria-label="De" value={from} onChange={(e) => setFrom(e.target.value)} className="w-full md:w-auto" />
        <Input type="date" aria-label="Até" value={to} onChange={(e) => setTo(e.target.value)} className="w-full md:w-auto" />
        <Button type="button" size="sm" onClick={applyFilters} disabled={pending}>
          {pending ? "A filtrar…" : "Filtrar"}
        </Button>
      </div>

      {error && <p role="alert" className="text-[13px] text-danger">{error}</p>}

      {events.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Sem eventos clínicos para os filtros escolhidos.</p>
      ) : (
        <ol className="relative space-y-2 border-l border-border pl-5">
          {events.map((event) => {
            const Icon = ICON[event.type];
            return (
              <li key={event.id} className={`relative rounded-lg border p-3 ${toneClass(event.severity)}`}>
                <span className="absolute -left-[27px] top-4 flex size-4 items-center justify-center rounded-full border border-border bg-surface">
                  <Icon className="size-2.5 text-primary" aria-hidden />
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{event.type.replace(/_/g, " ").toLowerCase()}</Badge>
                  <time dateTime={event.at} className="text-xs text-muted-foreground">{formatStamp(event.at)}</time>
                  {event.badge && <Badge variant="neutral">{event.badge.replace(/_/g, " ").toLowerCase()}</Badge>}
                </div>
                <p className="mt-1 text-sm font-medium">{event.title}</p>
                {event.summary && <p className="mt-0.5 whitespace-pre-wrap text-[13px] text-muted-foreground">{event.summary}</p>}
                {(event.professional || event.specialty) && (
                  <p className="mt-1 text-xs text-subtle-foreground">
                    {[event.professional, event.specialty].filter(Boolean).join(" · ")}
                  </p>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {hasMore && (
        <div className="flex justify-center">
          <Button type="button" variant="secondary" size="sm" onClick={loadMore} disabled={pending}>
            {pending ? "A carregar…" : "Carregar mais"}
          </Button>
        </div>
      )}
    </div>
  );
}
