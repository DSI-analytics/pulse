import Link from "next/link";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { dayRange, clinicTodayIso } from "@/lib/datetime";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { StatusPill } from "@/components/status-pill";
import { AgendaActions } from "@/components/agenda-actions";
import { NovaMarcacao } from "@/components/nova-marcacao";
import { EmptyState } from "@/components/ui/empty-state";
import { isOverdue } from "@/lib/appointment-status";
import { can } from "@/lib/rbac";
import { ListFilters } from "@/components/list-filters";
import { getFormatters, getTranslator } from "@/i18n/server";
import type { AppointmentStatus } from "@prisma/client";

const APPOINTMENT_STATUSES: AppointmentStatus[] = ["MARCADA", "CONFIRMADA", "CHEGOU", "EM_ESPERA", "EM_CONSULTA", "CONCLUIDA", "CANCELADA", "NAO_COMPARECEU"];
type AgendaMode = "day" | "range" | "all";

function validIsoDate(value: string | undefined, fallback: string): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return fallback;
  const parsed = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value ? fallback : value;
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export async function generateMetadata() {
  const t = await getTranslator();
  return { title: t("agenda.title") };
}

export default async function AgendaPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string; d?: string; de?: string; ate?: string; q?: string; estado?: string; medico?: string; especialidade?: string }>;
}) {
  const user = await requirePermission("appointment.view");
  const t = await getTranslator();
  const f = await getFormatters();
  const sp = await searchParams;
  const todayIso = clinicTodayIso();
  const mode: AgendaMode = sp.periodo === "intervalo" ? "range" : sp.periodo === "todas" ? "all" : "day";
  const dateIso = validIsoDate(sp.d, todayIso);
  const defaultRangeEnd = addDays(todayIso, 6);
  const requestedFrom = validIsoDate(sp.de, todayIso);
  const requestedTo = validIsoDate(sp.ate, defaultRangeEnd);
  const [rangeFrom, rangeTo] = requestedFrom <= requestedTo ? [requestedFrom, requestedTo] : [requestedTo, requestedFrom];
  const dayBounds = dayRange(new Date(`${dateIso}T12:00:00Z`));
  const rangeStart = dayRange(new Date(`${rangeFrom}T12:00:00Z`)).start;
  const rangeEnd = dayRange(new Date(`${rangeTo}T12:00:00Z`)).end;
  const dateConstraint = mode === "day"
    ? { gte: dayBounds.start, lte: dayBounds.end }
    : mode === "range"
      ? { gte: rangeStart, lte: rangeEnd }
      : undefined;
  const isDoctor = user.role === "DOCTOR";
  const query = (sp.q ?? "").trim();
  const status = APPOINTMENT_STATUSES.includes(sp.estado as AppointmentStatus) ? sp.estado as AppointmentStatus : undefined;

  const [appts, doctors, specialties] = await Promise.all([
    prisma.appointment.findMany({
      where: {
        clinicId: user.clinicId,
        ...(dateConstraint ? { startAt: dateConstraint } : {}),
        ...(query ? { patient: { name: { contains: query, mode: "insensitive" } } } : {}),
        ...(status ? { status } : {}),
        ...(sp.especialidade ? { specialtyId: sp.especialidade } : {}),
        // A doctor must only ever receive appointments from their own agenda.
        ...(isDoctor ? { doctorId: user.doctorId ?? "__sem_medico_associado__" } : sp.medico ? { doctorId: sp.medico } : {}),
      },
      orderBy: [{ startAt: mode === "all" ? "desc" : "asc" }, { doctor: { name: "asc" } }],
      select: {
        id: true, startAt: true, status: true, type: true, priceQuoted: true,
        service: { select: { name: true } },
        patient: { select: { name: true } },
        doctor: { select: { name: true } },
        specialty: { select: { name: true, color: true } },
        healthPlan: { select: { insuranceCompany: { select: { name: true } } } },
      },
    }),
    isDoctor ? Promise.resolve([]) : prisma.doctor.findMany({ where: { clinicId: user.clinicId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.specialty.findMany({ where: { clinicId: user.clinicId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  const filteredParams = () => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (status) params.set("estado", status);
    if (!isDoctor && sp.medico) params.set("medico", sp.medico);
    if (sp.especialidade) params.set("especialidade", sp.especialidade);
    return params;
  };

  const agendaHref = (date: string) => {
    const params = filteredParams();
    params.set("periodo", "dia");
    params.set("d", date);
    return `/agenda?${params}`;
  };

  const modeHref = (nextMode: AgendaMode) => {
    const params = filteredParams();
    if (nextMode === "day") {
      params.set("periodo", "dia");
      params.set("d", dateIso);
    } else if (nextMode === "range") {
      params.set("periodo", "intervalo");
      params.set("de", rangeFrom);
      params.set("ate", rangeTo);
    } else {
      params.set("periodo", "todas");
    }
    return `/agenda?${params}`;
  };

  // "Hoje" / "Amanhã" / "Ontem" — relative to the day actually being viewed.
  const relativeLabel =
    dateIso === todayIso ? t("agenda.relative.today")
      : dateIso === addDays(todayIso, 1) ? t("agenda.relative.tomorrow")
        : dateIso === addDays(todayIso, -1) ? t("agenda.relative.yesterday")
          : null;

  const counts = {
    total: appts.filter((a) => a.status !== "CANCELADA").length,
    concluidas: appts.filter((a) => a.status === "CONCLUIDA").length,
    espera: appts.filter((a) => ["CHEGOU", "EM_ESPERA", "EM_CONSULTA"].includes(a.status)).length,
    atraso: appts.filter((a) => isOverdue(a.status, a.startAt)).length,
    faltas: appts.filter((a) => a.status === "NAO_COMPARECEU").length,
  };

  const viewedDay = f.dateLong(new Date(dateIso + "T12:00:00Z"));
  const periodDescription = mode === "day"
    ? viewedDay
    : mode === "range"
      ? `${f.dateMedium(new Date(`${rangeFrom}T12:00:00Z`))} – ${f.dateMedium(new Date(`${rangeTo}T12:00:00Z`))}`
      : t("agenda.period.allDescription");
  const clearHref = mode === "day"
    ? `/agenda?periodo=dia&d=${dateIso}`
    : mode === "range"
      ? `/agenda?periodo=intervalo&de=${rangeFrom}&ate=${rangeTo}`
      : "/agenda?periodo=todas";

  return (
    <>
      <PageHeader
        eyebrow={t("nav.groups.operation")}
        title={isDoctor ? t("agenda.myTitle") : t("agenda.title")}
        description={periodDescription}
        actions={can(user.role, "appointment.manage") ? <NovaMarcacao /> : undefined}
      />

      <nav aria-label={t("agenda.period.label")} className="inline-flex max-w-full flex-wrap gap-1 rounded-full border border-border bg-fill p-1">
        {(["day", "range", "all"] as const).map((item) => (
          <Link
            key={item}
            href={modeHref(item)}
            aria-current={mode === item ? "page" : undefined}
            className={mode === item
              ? "press inline-flex h-8 items-center rounded-full border border-border-strong bg-card px-3.5 text-[13px] font-medium text-foreground shadow-card antialiased"
              : "press inline-flex h-8 items-center rounded-full border border-transparent px-3.5 text-[13px] font-medium text-muted-foreground antialiased hover:text-foreground"}
          >
            {t(`agenda.period.${item}`)}
          </Link>
        ))}
      </nav>

      <div className="flex flex-wrap items-center justify-between gap-3">
        {mode === "day" ? <div className="flex items-center gap-1.5">
          <Link
            href={agendaHref(addDays(dateIso, -1))}
            className={buttonVariants({ variant: "secondary", size: "icon" })}
            aria-label={t("agenda.previousDay")}
          >
            <ChevronLeft className="size-4" />
          </Link>

          {/* The label always names the day actually being viewed. */}
          <div className="flex min-w-[13rem] items-center justify-center gap-2 rounded-md border border-border bg-surface px-3 py-1.5">
            <span className="text-sm font-semibold">{viewedDay}</span>
            {relativeLabel && <Badge variant="default">{relativeLabel}</Badge>}
          </div>

          <Link
            href={agendaHref(addDays(dateIso, 1))}
            className={buttonVariants({ variant: "secondary", size: "icon" })}
            aria-label={t("agenda.nextDay")}
          >
            <ChevronRight className="size-4" />
          </Link>

          {/* Only offered when you are not already on today. */}
          {dateIso !== todayIso && (
            <Link href={agendaHref(todayIso)} className={buttonVariants({ variant: "ghost", size: "sm" })}>
              {t("agenda.goToday")}
            </Link>
          )}
        </div> : <div className="text-sm font-semibold text-foreground">{periodDescription}</div>}
        <div className="flex flex-wrap gap-2">
          <Chip label={t("agenda.chips.appointments")} value={counts.total} />
          <Chip label={t("agenda.chips.queue")} value={counts.espera} tone="warning" />
          <Chip label={t("agenda.chips.overdue")} value={counts.atraso} tone="danger" />
          <Chip label={t("agenda.chips.completed")} value={counts.concluidas} tone="success" />
          <Chip label={t("agenda.chips.noShows")} value={counts.faltas} tone="danger" />
        </div>
      </div>

      <ListFilters
        action="/agenda"
        clearHref={clearHref}
        hidden={{
          periodo: mode === "day" ? "dia" : mode === "range" ? "intervalo" : "todas",
        }}
        fields={[
          ...(mode === "day" ? [{ name: "d", label: t("agenda.filters.date"), value: dateIso, type: "date" as const }] : []),
          ...(mode === "range" ? [
            { name: "de", label: t("agenda.filters.from"), value: rangeFrom, type: "date" as const },
            { name: "ate", label: t("agenda.filters.to"), value: rangeTo, type: "date" as const },
          ] : []),
          { name: "q", label: t("agenda.filters.search"), value: query, type: "search", placeholder: t("agenda.filters.searchPlaceholder") },
          { name: "estado", label: t("agenda.filters.status"), value: status, options: APPOINTMENT_STATUSES.map((value) => ({ value, label: t(`appointmentStatus.${value}`) })) },
          ...(!isDoctor ? [{ name: "medico", label: t("agenda.filters.doctor"), value: sp.medico, options: doctors.map((doctor) => ({ value: doctor.id, label: doctor.name })) }] : []),
          { name: "especialidade", label: t("agenda.filters.specialty"), value: sp.especialidade, options: specialties.map((specialty) => ({ value: specialty.id, label: specialty.name })) },
        ]}
      />

      <Card>
        {appts.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={CalendarDays}
              title={isDoctor && !user.doctorId ? t("agenda.empty.noDoctorTitle") : mode === "day" ? t("agenda.empty.title") : t("agenda.empty.periodTitle")}
              description={
                isDoctor && !user.doctorId
                  ? t("agenda.empty.noDoctorBody")
                  : mode !== "day"
                    ? isDoctor ? t("agenda.empty.periodDoctorBody") : t("agenda.empty.periodBody")
                    : isDoctor ? t("agenda.empty.doctorBody") : t("agenda.empty.body")
              }
            />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t(mode === "day" ? "agenda.columns.time" : "agenda.columns.dateTime")}</TableHead>
                <TableHead>{t("agenda.columns.patient")}</TableHead>
                <TableHead>{t("agenda.columns.doctor")}</TableHead>
                <TableHead>{t("agenda.columns.specialty")}</TableHead>
                <TableHead>{t("agenda.columns.type")}</TableHead>
                <TableHead>{t("agenda.columns.coverage")}</TableHead>
                <TableHead className="text-right">{t("agenda.columns.amount")}</TableHead>
                <TableHead>{t("agenda.columns.status")}</TableHead>
                <TableHead className="text-right">{t("agenda.columns.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {appts.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-mono text-[13px] font-medium">
                    {mode !== "day" && <span className="block font-sans text-xs text-muted-foreground">{f.dateMedium(a.startAt)}</span>}
                    {f.time(a.startAt)}
                  </TableCell>
                  <TableCell className="font-medium">{a.patient.name}</TableCell>
                  <TableCell className="text-muted-foreground">{a.doctor.name}</TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1.5 text-[13px]">
                      <span className="size-2 rounded-full" style={{ background: a.specialty.color }} />
                      {a.specialty.name}
                    </span>
                  </TableCell>
                  <TableCell className="text-[13px] text-muted-foreground">
                    {t(`agenda.types.${a.type}`)}
                    {a.service && <span className="block text-[12px] text-subtle-foreground">{a.service.name}</span>}
                  </TableCell>
                  <TableCell>
                    {a.healthPlan ? (
                      <Badge variant="info">{a.healthPlan.insuranceCompany.name}</Badge>
                    ) : (
                      <Badge variant="neutral">{t("agenda.private")}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-[13px] tabular">{f.money(a.priceQuoted)}</TableCell>
                  <TableCell><StatusPill status={a.status} startAt={a.startAt} /></TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end">
                      <AgendaActions
                        id={a.id}
                        status={a.status}
                        canConduct={can(user.role, "consultation.conduct")}
                        canManage={can(user.role, "appointment.manage")}
                        canCheckIn={can(user.role, "appointment.checkin")}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </>
  );
}

function Chip({ label, value, tone = "neutral" }: { label: string; value: number; tone?: "neutral" | "success" | "warning" | "danger" }) {
  const color = {
    neutral: "text-foreground",
    success: "text-success",
    warning: "text-warning",
    danger: "text-danger",
  }[tone];
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5">
      <span className={`text-base font-semibold tabular ${color}`}>{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}
