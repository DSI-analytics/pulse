import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Phone, Mail, IdCard, Clock, Gauge, CalendarX2, TrendingUp } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { getDoctorDetail } from "@/server/doctor-analytics";
import { updateDoctorRecord, deleteDoctorRecord } from "@/server/crud-actions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { KpiCard } from "@/components/kpi-card";
import { CapacityHeatmap } from "@/components/capacity-heatmap";
import { TrendChart } from "@/components/charts/trend-chart";
import { RecordCrudButton } from "@/components/record-crud-button";
import { getFormatters, getTranslator } from "@/i18n/server";

const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

export async function generateMetadata() {
  const t = await getTranslator();
  return { title: t("doctors.title") };
}

export default async function DoctorDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("doctor.view");
  const [t, f] = await Promise.all([getTranslator(), getFormatters()]);
  const canViewFinancials = can(user.role, "finance.view");
  const { id } = await params;
  const [data, doctor, specialties] = await Promise.all([
    getDoctorDetail(user.clinicId, id, canViewFinancials),
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
        <ArrowLeft className="size-4" /> {t("doctors.title")}
      </Link>

      <div className="flex flex-wrap items-center gap-4">
        <Avatar name={doctorData.name} color={doctorData.color} className="size-14 text-lg" />
        <div className="flex-1">
          <h1 className="font-display text-2xl font-semibold">{doctorData.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="default">{doctorData.specialty}</Badge>
            <span>{t("doctors.detail.consultationPrice", { price: f.money(doctorData.price) })}</span>
            <span>·</span>
            <span>{t("doctors.detail.durationMinutes", { minutes: doctorData.duration })}</span>
            <Badge variant={doctorData.status === "ACTIVO" ? "success" : "neutral"}>{doctorData.status === "ACTIVO" ? t("common.active") : t("common.inactive")}</Badge>
          </div>
        </div>
        {canManage && doctor && (
          <RecordCrudButton
            id={id}
            title={t("doctors.detail.editTitle")}
            description={t("doctors.detail.editDescription")}
            fields={[
              { name: "name", label: t("doctors.fields.name"), required: true, defaultValue: doctor.name },
              { name: "specialtyId", label: t("doctors.fields.specialty"), type: "select", required: true, defaultValue: doctor.specialtyId ?? "", options: specialties.map((s) => ({ value: s.id, label: s.name })) },
              { name: "consultationPrice", label: t("doctors.fields.consultationPrice"), type: "money", required: true, defaultValue: String(doctor.consultationPrice), suffix: f.currency },
              { name: "consultationDuration", label: t("doctors.fields.duration"), type: "number", defaultValue: String(doctor.consultationDuration) },
              { name: "phone", label: t("doctors.fields.phone"), type: "tel", defaultValue: doctor.phone ?? "" },
              { name: "email", label: t("doctors.fields.email"), type: "email", defaultValue: doctor.email ?? "" },
              { name: "licenseNumber", label: t("doctors.fields.license"), defaultValue: doctor.licenseNumber ?? "" },
            ]}
            updateAction={updateDoctorRecord}
            deleteAction={deleteDoctorRecord}
            redirectOnDelete="/medicos"
          />
        )}
      </div>

      {/* Analytics */}
      <div className={canViewFinancials ? "grid grid-cols-2 gap-4 lg:grid-cols-4" : "grid grid-cols-2 gap-4 lg:grid-cols-3"}>
        <KpiCard label={t("doctors.detail.kpis.occupancy")} value={`${Math.round(metrics.scheduleOccupancy * 100)}%`} icon={Gauge} hint={t("doctors.detail.kpis.occupancyHint")} />
        <KpiCard label={t("doctors.detail.kpis.completed")} value={String(metrics.completed)} icon={TrendingUp} hint={t("doctors.detail.kpis.perDay", { count: metrics.patientsPerDay })} />
        <KpiCard label={t("doctors.detail.kpis.noShowRate")} value={`${Math.round(metrics.noShowRate * 100)}%`} icon={CalendarX2} invertDelta hint={t("doctors.detail.kpis.noShowHint")} />
        {canViewFinancials && <KpiCard label={t("doctors.detail.kpis.revenue")} value={f.money(receita)} icon={Clock} hint={t("doctors.detail.kpis.revenueHint")} />}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>{t("doctors.detail.capacityMap")}</CardTitle>
            <CardDescription>{t("doctors.detail.capacityMapDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <CapacityHeatmap blocks={blocks} columns={heat} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("doctors.detail.availableCapacity")}</CardTitle>
            <CardDescription>{t("doctors.detail.availableCapacityDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 pt-0 text-sm">
            <Line label={t("doctors.detail.actualUtilisation")} value={`${Math.round(metrics.actualUtilisation * 100)}%`} />
            <Line label={t("doctors.detail.fillRate")} value={`${Math.round(metrics.fillRate * 100)}%`} />
            <Line label={t("doctors.detail.avgDuration")} value={t("doctors.detail.durationMinutes", { minutes: metrics.avgConsultationMin })} />
            {canViewFinancials && <Line label={t("doctors.detail.revenuePerHour")} value={f.money(metrics.revenuePerClinicalHour)} />}
            <Line label={t("doctors.detail.cancellations")} value={`${Math.round(metrics.cancellationRate * 100)}%`} />
            <Line label={t("doctors.detail.slotsRemaining")} value={`${metrics.availableSlotsRemaining}`} highlight />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>{t("doctors.detail.consultationsPerMonth")}</CardTitle>
            <CardDescription>{t("doctors.detail.consultationsPerMonthDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <TrendChart data={trend} kind="int" variant="bar" height={200} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("doctors.detail.scheduleAndContacts")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5 pt-0 text-sm">
            <div className="flex items-center gap-2.5"><Phone className="size-4 text-subtle-foreground" /><span className="text-muted-foreground">{t("doctors.detail.phone")}</span><span className="ml-auto font-medium">{doctorData.phone ?? "—"}</span></div>
            <div className="flex items-center gap-2.5"><Mail className="size-4 text-subtle-foreground" /><span className="text-muted-foreground">{t("doctors.detail.email")}</span><span className="ml-auto font-medium">{doctorData.email ?? "—"}</span></div>
            <div className="flex items-center gap-2.5"><IdCard className="size-4 text-subtle-foreground" /><span className="text-muted-foreground">{t("doctors.detail.license")}</span><span className="ml-auto font-mono text-[13px]">{doctorData.license ?? "—"}</span></div>
            <div className="border-t border-border pt-2.5">
              <p className="mb-1.5 text-xs text-muted-foreground">{t("doctors.detail.workingHours")}</p>
              <ul className="space-y-1">
                {doctorData.schedules.map((s) => (
                  <li key={s.id} className="flex justify-between text-[13px]">
                    <span>{WEEKDAYS[s.weekday] ? t(`doctors.weekdays.${WEEKDAYS[s.weekday]}`) : ""}</span>
                    <span className="tabular text-muted-foreground">
                      {s.startTime}–{s.endTime}
                      {s.breakStart ? t("doctors.detail.break", { start: s.breakStart, end: s.breakEnd ?? "" }) : ""}
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
