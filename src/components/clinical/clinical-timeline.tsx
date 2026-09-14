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
import { useFormat, useT } from "@/i18n/client";
import { clinicalEnumLabel } from "./enum-label";

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

/** Ordem das opções do filtro de tipo. */
const TYPE_OPTIONS: TimelineEventType[] = [
  "CONSULTA",
  "EPISODIO",
  "DIAGNOSTICO",
  "SINAIS_VITAIS",
  "ALERGIA",
  "PRESCRICAO",
  "EXAME",
  "RESULTADO",
  "PROCEDIMENTO",
  "TRATAMENTO",
  "INTERNAMENTO",
  "ALTA",
  "DOCUMENTO",
];

function toneClass(severity?: TimelineEvent["severity"]): string {
  if (severity === "CRITICO") return "border-danger-edge bg-danger-muted";
  if (severity === "AVISO") return "border-warning-edge bg-warning-muted";
  return "border-border bg-fill-subtle";
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
  const t = useT();
  const f = useFormat();
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
        <Select aria-label={t("clinical.timeline.eventType")} value={type} onChange={(e) => setType(e.target.value)} className="w-full md:w-auto md:min-w-40">
          <option value="">{t("common.allOption", { label: t("clinical.timeline.type") })}</option>
          {TYPE_OPTIONS.map((value) => <option key={value} value={value}>{t(`clinical.timeline.types.${value}`)}</option>)}
        </Select>
        <Select aria-label={t("clinical.timeline.specialty")} value={specialtyId} onChange={(e) => setSpecialtyId(e.target.value)} className="w-full md:w-auto md:min-w-40">
          <option value="">{t("clinical.timeline.specialtyAll")}</option>
          {specialties.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
        <Select aria-label={t("clinical.timeline.professional")} value={doctorId} onChange={(e) => setDoctorId(e.target.value)} className="w-full md:w-auto md:min-w-40">
          <option value="">{t("common.allOption", { label: t("clinical.timeline.professional") })}</option>
          {doctors.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
        <Input type="date" aria-label={t("clinical.timeline.from")} value={from} onChange={(e) => setFrom(e.target.value)} className="w-full md:w-auto" />
        <Input type="date" aria-label={t("clinical.timeline.to")} value={to} onChange={(e) => setTo(e.target.value)} className="w-full md:w-auto" />
        <Button type="button" size="sm" onClick={applyFilters} disabled={pending}>
          {pending ? t("clinical.timeline.filtering") : t("common.filter")}
        </Button>
      </div>

      {error && <p role="alert" className="text-[13px] text-danger">{error}</p>}

      {events.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{t("clinical.timeline.empty")}</p>
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
                  <Badge variant="outline">{clinicalEnumLabel(t, event.type)}</Badge>
                  <time dateTime={event.at} className="text-xs text-muted-foreground">{`${f.dateMedium(event.at)}, ${f.time(event.at)}`}</time>
                  {event.badge && <Badge variant="neutral">{clinicalEnumLabel(t, event.badge)}</Badge>}
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
            {pending ? t("common.loading") : t("clinical.timeline.loadMore")}
          </Button>
        </div>
      )}
    </div>
  );
}
