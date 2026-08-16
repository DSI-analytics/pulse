import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Phone, Mail, IdCard, Clock, Gauge, CalendarX2, TrendingUp } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { getDoctorDetail } from "@/server/doctor-analytics";
import { updateDoctorRecord, deleteDoctorRecord } from "@/server/crud-actions";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { KpiCard } from "@/components/kpi-card";
import { CapacityHeatmap } from "@/components/capacity-heatmap";
import { TrendChart } from "@/components/charts/trend-chart";
import { RecordCrudButton } from "@/components/record-crud-button";
import { formatMZN } from "@/lib/money";

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export default async function DoctorDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("doctor.view");
  const { id } = await params;
  const [data, doctor, specialties] = await Promise.all([
    getDoctorDetail(user.clinicId, id),
    prisma.doctor.findUnique({
      where: { id, clinicId: user.clinicId },
      select: { id: true, name: true, specialtyId: true, phone: true, email: true, licenseNumber: true, consultationPrice: true, consultationDuration: true },
    }),
    prisma.specialty.findMany({
      where: { clinicId: user.clinicId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);
  if (!data) notFound();
  const { doctor: doctorData, metrics, receita, blocks, heat, trend } = data;
  const canManage = can(user.role, "doctor.manage");

  return (
    <>
      <Link href="/medicos" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Médicos
      </Link>

      <div className="flex flex-wrap items-center gap-4">
        <Avatar name={doctorData.name} color={doctorData.color} className="size-14 text-lg" />
        <div className="flex-1">
          <h1 className="font-display text-2xl font-semibold">{doctorData.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="default">{doctorData.specialty}</Badge>
            <span>Consulta {formatMZN(doctorData.price)}</span>
            <span>·</span>
            <span>{doctorData.duration} min</span>
            <Badge variant={doctorData.status === "ACTIVO" ? "success" : "neutral"}>{doctorData.status === "ACTIVO" ? "Activo" : "Inactivo"}</Badge>
          </div>
        </div>
        {canManage && doctor && (
          <RecordCrudButton
            id={id}
            title="Editar médico"
            description="Atualize os dados do médico."
            fields={[
              { name: "name", label: "Nome", required: true, defaultValue: doctor.name },
              { name: "specialtyId", label: "Especialidade", type: "select", required: true, defaultValue: doctor.specialtyId ?? "", options: specialties.map((s) => ({ value: s.id, label: s.name })) },
              { name: "consultationPrice", label: "Preço da consulta", type: "money", required: true, defaultValue: String(doctor.consultationPrice), suffix: "MZN" },
              { name: "consultationDuration", label: "Duração", type: "number", defaultValue: String(doctor.consultationDuration) },
              { name: "phone", label: "Telefone", type: "tel", defaultValue: doctor.phone ?? "" },
              { name: "email", label: "Email", type: "email", defaultValue: doctor.email ?? "" },
              { name: "licenseNumber", label: "Cédula (OMM)", defaultValue: doctor.licenseNumber ?? "" },
            ]}
            updateAction={updateDoctorRecord}
            deleteAction={deleteDoctorRecord}
            redirectOnDelete="/medicos"
          />
        )}
      </div>

      {/* Analytics */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="Ocupação (mês)" value={`${Math.round(metrics.scheduleOccupancy * 100)}%`} icon={Gauge} hint="tempo marcado / disponível" />
        <KpiCard label="Consultas concluídas" value={String(metrics.completed)} icon={TrendingUp} hint={`${metrics.patientsPerDay}/dia`} />
        <KpiCard label="Taxa de faltas" value={`${Math.round(metrics.noShowRate * 100)}%`} icon={CalendarX2} invertDelta hint="do total marcado" />
        <KpiCard label="Receita gerada (mês)" value={formatMZN(receita)} icon={Clock} hint="reconhecida" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Mapa de capacidade</CardTitle>
            <CardDescription>Ocupação média por dia e faixa horária (últimas 4 semanas)</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <CapacityHeatmap blocks={blocks} columns={heat} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Capacidade disponível</CardTitle>
            <CardDescription>Este mês, até à data</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 pt-0 text-sm">
            <Line label="Utilização efetiva" value={`${Math.round(metrics.actualUtilisation * 100)}%`} />
            <Line label="Taxa de preenchimento" value={`${Math.round(metrics.fillRate * 100)}%`} />
            <Line label="Duração média" value={`${metrics.avgConsultationMin} min`} />
            <Line label="Receita / hora clínica" value={formatMZN(metrics.revenuePerClinicalHour)} />
            <Line label="Cancelamentos" value={`${Math.round(metrics.cancellationRate * 100)}%`} />
            <Line label="Vagas ainda disponíveis" value={`${metrics.availableSlotsRemaining}`} highlight />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Consultas por mês</CardTitle>
            <CardDescription>Tendência dos últimos 6 meses</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <TrendChart data={trend} kind="int" variant="bar" height={200} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Horário e contactos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5 pt-0 text-sm">
            <div className="flex items-center gap-2.5"><Phone className="size-4 text-subtle-foreground" /><span className="text-muted-foreground">Telefone</span><span className="ml-auto font-medium">{doctorData.phone ?? "—"}</span></div>
            <div className="flex items-center gap-2.5"><Mail className="size-4 text-subtle-foreground" /><span className="text-muted-foreground">Email</span><span className="ml-auto font-medium">{doctorData.email ?? "—"}</span></div>
            <div className="flex items-center gap-2.5"><IdCard className="size-4 text-subtle-foreground" /><span className="text-muted-foreground">Cédula</span><span className="ml-auto font-mono text-[13px]">{doctorData.license ?? "—"}</span></div>
            <div className="border-t border-border pt-2.5">
              <p className="mb-1.5 text-xs text-muted-foreground">Horário de trabalho</p>
              <ul className="space-y-1">
                {doctorData.schedules.map((s) => (
                  <li key={s.id} className="flex justify-between text-[13px]">
                    <span>{WEEKDAYS[s.weekday]}</span>
                    <span className="tabular text-muted-foreground">
                      {s.startTime}–{s.endTime}
                      {s.breakStart ? ` · pausa ${s.breakStart}–${s.breakEnd}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function Line({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-semibold tabular ${highlight ? "text-primary" : ""}`}>{value}</span>
    </div>
  );
}
