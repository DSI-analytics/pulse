import Link from "next/link";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { dayRange, formatTime, clinicTodayIso, formatWeekdayDatePt } from "@/lib/datetime";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { StatusPill } from "@/components/status-pill";
import { AgendaActions } from "@/components/agenda-actions";
import { NovaMarcacao } from "@/components/nova-marcacao";
import { EmptyState } from "@/components/ui/empty-state";
import { TYPE_LABEL, STATUS_LABEL, isOverdue } from "@/lib/appointment-status";
import { formatMZN } from "@/lib/money";
import { can } from "@/lib/rbac";
import { ListFilters } from "@/components/list-filters";
import type { AppointmentStatus } from "@prisma/client";

const APPOINTMENT_STATUSES: AppointmentStatus[] = ["MARCADA", "CONFIRMADA", "CHEGOU", "EM_ESPERA", "EM_CONSULTA", "CONCLUIDA", "CANCELADA", "NAO_COMPARECEU"];

function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export default async function AgendaPage({
  searchParams,
}: {
  searchParams: Promise<{ d?: string; q?: string; estado?: string; medico?: string; especialidade?: string }>;
}) {
  const user = await requirePermission("appointment.view");
  const sp = await searchParams;
  const todayIso = clinicTodayIso();
  const dateIso = sp.d ?? todayIso;
  const { start, end } = dayRange(new Date(dateIso + "T12:00:00Z"));
  const isDoctor = user.role === "DOCTOR";
  const query = (sp.q ?? "").trim();
  const status = APPOINTMENT_STATUSES.includes(sp.estado as AppointmentStatus) ? sp.estado as AppointmentStatus : undefined;

  const [appts, doctors, specialties] = await Promise.all([
    prisma.appointment.findMany({
      where: {
        clinicId: user.clinicId,
        startAt: { gte: start, lte: end },
        ...(query ? { patient: { name: { contains: query, mode: "insensitive" } } } : {}),
        ...(status ? { status } : {}),
        ...(sp.especialidade ? { specialtyId: sp.especialidade } : {}),
        // A doctor must only ever receive appointments from their own agenda.
        ...(isDoctor ? { doctorId: user.doctorId ?? "__sem_medico_associado__" } : sp.medico ? { doctorId: sp.medico } : {}),
      },
      orderBy: [{ startAt: "asc" }, { doctor: { name: "asc" } }],
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

  const agendaHref = (date: string) => {
    const params = new URLSearchParams({ d: date });
    if (query) params.set("q", query);
    if (status) params.set("estado", status);
    if (!isDoctor && sp.medico) params.set("medico", sp.medico);
    if (sp.especialidade) params.set("especialidade", sp.especialidade);
    return `/agenda?${params}`;
  };

  // "Hoje" / "Amanhã" / "Ontem" — relative to the day actually being viewed.
  const relativeLabel =
    dateIso === todayIso ? "Hoje"
      : dateIso === addDays(todayIso, 1) ? "Amanhã"
        : dateIso === addDays(todayIso, -1) ? "Ontem"
          : null;

  const counts = {
    total: appts.filter((a) => a.status !== "CANCELADA").length,
    concluidas: appts.filter((a) => a.status === "CONCLUIDA").length,
    espera: appts.filter((a) => ["CHEGOU", "EM_ESPERA", "EM_CONSULTA"].includes(a.status)).length,
    atraso: appts.filter((a) => isOverdue(a.status, a.startAt)).length,
    faltas: appts.filter((a) => a.status === "NAO_COMPARECEU").length,
  };

  return (
    <>
      <PageHeader
        eyebrow="Operação"
        title={isDoctor ? "Minha agenda" : "Agenda"}
        description={formatWeekdayDatePt(new Date(dateIso + "T12:00:00Z"))}
        actions={can(user.role, "appointment.manage") ? <NovaMarcacao /> : undefined}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <Link
            href={agendaHref(addDays(dateIso, -1))}
            className={buttonVariants({ variant: "secondary", size: "icon" })}
            aria-label="Dia anterior"
          >
            <ChevronLeft className="size-4" />
          </Link>

          {/* The label always names the day actually being viewed. */}
          <div className="flex min-w-[13rem] items-center justify-center gap-2 rounded-md border border-border bg-surface px-3 py-1.5">
            <span className="text-sm font-semibold">{formatWeekdayDatePt(new Date(dateIso + "T12:00:00Z"))}</span>
            {relativeLabel && <Badge variant="default">{relativeLabel}</Badge>}
          </div>

          <Link
            href={agendaHref(addDays(dateIso, 1))}
            className={buttonVariants({ variant: "secondary", size: "icon" })}
            aria-label="Dia seguinte"
          >
            <ChevronRight className="size-4" />
          </Link>

          {/* Only offered when you are not already on today. */}
          {dateIso !== todayIso && (
            <Link href="/agenda" className={buttonVariants({ variant: "ghost", size: "sm" })}>
              Ir para hoje
            </Link>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Chip label="Marcações" value={counts.total} />
          <Chip label="Em fila / consulta" value={counts.espera} tone="warning" />
          <Chip label="Em atraso" value={counts.atraso} tone="danger" />
          <Chip label="Concluídas" value={counts.concluidas} tone="success" />
          <Chip label="Faltas" value={counts.faltas} tone="danger" />
        </div>
      </div>

      <ListFilters
        action="/agenda"
        clearHref={`/agenda?d=${dateIso}`}
        hidden={{ d: dateIso }}
        fields={[
          { name: "q", label: "Pesquisar", value: query, type: "search", placeholder: "Nome do paciente…" },
          { name: "estado", label: "Estado", value: status, options: APPOINTMENT_STATUSES.map((value) => ({ value, label: STATUS_LABEL[value] })) },
          ...(!isDoctor ? [{ name: "medico", label: "Médico", value: sp.medico, options: doctors.map((doctor) => ({ value: doctor.id, label: doctor.name })) }] : []),
          { name: "especialidade", label: "Especialidade", value: sp.especialidade, options: specialties.map((specialty) => ({ value: specialty.id, label: specialty.name })) },
        ]}
      />

      <Card>
        {appts.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={CalendarDays}
              title={isDoctor && !user.doctorId ? "Conta sem médico associado" : "Sem marcações neste dia"}
              description={
                isDoctor && !user.doctorId
                  ? "Peça a um administrador para associar esta conta ao respetivo médico nas Configurações."
                  : isDoctor
                    ? "Não existem marcações na sua agenda para este dia."
                    : "Crie uma nova marcação ou navegue para outro dia."
              }
            />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Hora</TableHead>
                <TableHead>Paciente</TableHead>
                <TableHead>Médico</TableHead>
                <TableHead>Especialidade</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Cobertura</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {appts.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-mono text-[13px] font-medium">{formatTime(a.startAt)}</TableCell>
                  <TableCell className="font-medium">{a.patient.name}</TableCell>
                  <TableCell className="text-muted-foreground">{a.doctor.name}</TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1.5 text-[13px]">
                      <span className="size-2 rounded-full" style={{ background: a.specialty.color }} />
                      {a.specialty.name}
                    </span>
                  </TableCell>
                  <TableCell className="text-[13px] text-muted-foreground">
                    {TYPE_LABEL[a.type]}
                    {a.service && <span className="block text-[12px] text-subtle-foreground">{a.service.name}</span>}
                  </TableCell>
                  <TableCell>
                    {a.healthPlan ? (
                      <Badge variant="info">{a.healthPlan.insuranceCompany.name}</Badge>
                    ) : (
                      <Badge variant="neutral">Particular</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-[13px] tabular">{formatMZN(a.priceQuoted)}</TableCell>
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
