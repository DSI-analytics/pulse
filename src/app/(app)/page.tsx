import {
  Activity, Banknote, CalendarCheck, CalendarX2, ChartNoAxesCombined, ClipboardCheck,
  Clock3, Gauge, HandCoins, Percent, Receipt, ShieldCheck, Stethoscope, TestTube2,
  Timer, TrendingUp, UserRoundCheck, Users, WalletCards,
} from "lucide-react";
import { endOfDay, format, startOfDay, startOfMonth } from "date-fns";
import type { AppointmentType } from "@prisma/client";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { getDashboardFilterOptions, getGroupedDashboardData } from "@/server/analytics";
import { PageHeader } from "@/components/page-header";
import { KpiCard } from "@/components/kpi-card";
import { DashboardSection, DataGap } from "@/components/dashboard-section";
import { DashboardTabs, type DashboardTab } from "@/components/dashboard-tabs";
import { ListFilters } from "@/components/list-filters";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarList } from "@/components/bar-list";
import { getFormatters, getTranslator } from "@/i18n/server";

const APPOINTMENT_TYPES: AppointmentType[] = ["CONSULTA", "RETORNO", "EXAME", "PROCEDIMENTO"];

type DashboardSearchParams = {
  de?: string; ate?: string; medico?: string; especialidade?: string; tipo?: string; pagador?: string;
};

function parseDate(value: string | undefined, fallback: Date, end = false) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return fallback;
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return fallback;
  return end ? endOfDay(parsed) : startOfDay(parsed);
}

export async function generateMetadata() {
  const t = await getTranslator();
  return { title: t("dashboard.title") };
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<DashboardSearchParams> }) {
  const user = await requirePermission("dashboard.view");
  const canViewFinancials = can(user.role, "finance.view");
  const [t, f] = await Promise.all([getTranslator(), getFormatters()]);
  const sp = await searchParams;
  const now = new Date();
  let from = parseDate(sp.de, startOfMonth(now));
  let to = parseDate(sp.ate, endOfDay(now), true);
  if (from > to) [from, to] = [startOfDay(to), endOfDay(from)];
  const appointmentType = APPOINTMENT_TYPES.includes(sp.tipo as AppointmentType) ? sp.tipo as AppointmentType : undefined;
  const payer = sp.pagador === "private" || sp.pagador === "insured" ? sp.pagador : undefined;
  const na = t("dashboard.notAvailable");
  const min = (value: string | number) => t("dashboard.minutes", { value });
  const typeOptions = APPOINTMENT_TYPES.map((value) => ({ value, label: t(`dashboard.types.${value}`) }));

  const [d, options] = await Promise.all([
    getGroupedDashboardData(user.clinicId, {
      from, to, doctorId: sp.medico, specialtyId: sp.especialidade, appointmentType, payer,
    }, { includeFinancials: canViewFinancials }),
    getDashboardFilterOptions(user.clinicId),
  ]);
  const dashboardTabs: DashboardTab[] = [
    { id: "resumo", label: t("dashboard.tabs.summary") },
    { id: "assistencia", label: t("dashboard.tabs.care") },
    { id: "operacao", label: t("dashboard.tabs.operations") },
    ...(canViewFinancials ? [{ id: "financas" as const, label: t("dashboard.tabs.finance") }] : []),
    { id: "qualidade", label: t("dashboard.tabs.quality") },
  ];

  return (
    <>
      <PageHeader
        title={t("dashboard.title")}
      />

      <ListFilters action="/" clearHref="/" fields={[
        { name: "de", label: t("dashboard.filters.from"), type: "date", value: format(from, "yyyy-MM-dd") },
        { name: "ate", label: t("dashboard.filters.to"), type: "date", value: format(to, "yyyy-MM-dd") },
        { name: "medico", label: t("dashboard.filters.doctor"), value: sp.medico, options: options.doctors.map((item) => ({ value: item.id, label: item.name })) },
        { name: "especialidade", label: t("dashboard.filters.specialty"), value: sp.especialidade, options: options.specialties.map((item) => ({ value: item.id, label: item.name })) },
        { name: "tipo", label: t("dashboard.filters.serviceType"), value: appointmentType, options: typeOptions },
        { name: "pagador", label: t("dashboard.filters.payer"), value: payer, options: [{ value: "private", label: t("dashboard.filters.private") }, { value: "insured", label: t("dashboard.filters.insured") }] },
      ]} />

      <DashboardTabs tabs={dashboardTabs}>
      <DashboardSection title={t("dashboard.base.title")} description={t("dashboard.base.description")} icon={ChartNoAxesCombined}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard label={t("dashboard.base.scheduled")} value={String(d.base.scheduled)} icon={CalendarCheck} hint={t("dashboard.base.scheduledHint")} />
          <KpiCard label={t("dashboard.base.completed")} value={String(d.base.completed)} icon={UserRoundCheck} deltaPct={d.base.completedDeltaPct ?? undefined} hint={t("dashboard.vsPrevious", { value: `${d.base.completedDelta >= 0 ? "+" : ""}${d.base.completedDelta}` })} />
          <KpiCard label={t("dashboard.base.uniquePatients")} value={String(d.base.uniquePatients)} icon={Users} hint={t("dashboard.base.uniquePatientsHint")} />
          <KpiCard label={t("dashboard.base.completionRate")} value={`${d.base.completionRate}%`} icon={Percent} hint={t("dashboard.base.completionRateHint", { completed: d.base.completed, scheduled: d.base.scheduled })} />
          <KpiCard label={t("dashboard.base.waitMeanMode")} value={min(`${d.base.wait.mean} / ${d.base.wait.mode ?? "—"}`)} icon={Activity} hint={t("dashboard.base.waitMeanModeHint")} description={t("dashboard.base.waitMeanModeDescription")} />
          <KpiCard label={t("dashboard.base.waitPercentiles")} value={min(`${d.base.wait.p90} / ${d.base.wait.p95}`)} icon={Timer} hint={t("dashboard.base.waitPercentilesHint")} />
          <KpiCard label={t("dashboard.base.movingAverage")} value={t("dashboard.base.movingAverageValue", { value: d.base.movingAverage7d })} icon={TrendingUp} hint={t("dashboard.base.movingAverageHint")} />
          <KpiCard label={t("dashboard.base.yoy")} value={d.base.completedYoYPct === null ? na : `${d.base.completedYoYPct}%`} icon={TrendingUp} hint={t("dashboard.base.yoyHint")} />
        </div>
        <div className="grid gap-3 lg:grid-cols-3">
          <BreakdownCard title={t("dashboard.base.byType")} description={t("dashboard.base.byTypeDescription", { count: d.base.scheduled })} data={d.base.byType} emptyText={t("dashboard.noData")} />
          <BreakdownCard title={t("dashboard.base.byGender")} description={t("dashboard.base.byGenderDescription", { count: d.base.uniquePatients })} data={d.base.byGender} emptyText={t("dashboard.noData")} />
          <BreakdownCard title={t("dashboard.base.byAge")} description={t("dashboard.base.byAgeDescription")} data={d.base.byAge} emptyText={t("dashboard.noData")} />
        </div>
      </DashboardSection>

      <DashboardSection title={t("dashboard.care.title")} description={t("dashboard.care.description")} icon={Stethoscope}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard label={t("dashboard.care.firstConsultations")} value={String(d.care.firstConsultations)} icon={CalendarCheck} hint={t("dashboard.care.firstConsultationsHint")} />
          <KpiCard label={t("dashboard.care.followUps")} value={String(d.care.followUps)} icon={UserRoundCheck} hint={t("dashboard.care.followUpsHint")} />
          <KpiCard label={t("dashboard.care.returnRate")} value={`${d.care.returnRate}%`} icon={TrendingUp} hint={t("dashboard.care.returnRateHint", { followUps: d.care.followUps, total: d.care.firstConsultations + d.care.followUps })} />
          <KpiCard label={t("dashboard.care.abandonment")} value={`${d.care.followUpAbandonmentRate}%`} icon={CalendarX2} invertDelta hint={t("dashboard.care.abandonmentHint", { noShows: d.care.followUpNoShows, followUps: d.care.followUps })} />
          <KpiCard label={t("dashboard.care.examCoverage")} value={`${d.care.examCoverage}%`} icon={TestTube2} hint={t("dashboard.care.examCoverageHint", { completed: d.care.examsCompleted, requested: d.care.examsRequested })} />
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          <BreakdownCard title={t("dashboard.care.bySpecialty")} description={t("dashboard.care.bySpecialtyDescription")} data={d.care.bySpecialty} emptyText={t("dashboard.noData")} />
          <BreakdownCard title={t("dashboard.care.diagnoses")} description={t("dashboard.care.diagnosesDescription")} data={d.care.diagnoses} emptyText={t("dashboard.noData")} />
        </div>
        <DataGap labels={[t("dashboard.care.gapIcd"), t("dashboard.care.gapReferrals"), t("dashboard.care.gapReadmissions"), t("dashboard.care.gapInfections")]} />
      </DashboardSection>

      <DashboardSection title={t("dashboard.operations.title")} description={t("dashboard.operations.description")} icon={Gauge}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard label={t("dashboard.operations.waitMean")} value={min(d.operations.wait.mean)} icon={Clock3} hint={t("dashboard.operations.waitMeanHint")} description={t("dashboard.operations.waitMeanDescription")} />
          <KpiCard label={t("dashboard.operations.duration")} value={min(d.operations.consultationDuration.mean)} icon={Timer} hint={t("dashboard.operations.durationHint", { count: d.operations.consultationDuration.count })} description={t("dashboard.operations.durationDescription")} />
          <KpiCard label={t("dashboard.operations.noShowRate")} value={`${d.operations.noShowRate}%`} icon={CalendarX2} invertDelta hint={t("dashboard.operations.noShowRateHint", { noShows: d.operations.noShows, total: d.operations.noShowDenominator })} />
          <KpiCard label={t("dashboard.operations.noShowCi")} value={`${d.operations.noShowCi.low}%–${d.operations.noShowCi.high}%`} icon={ShieldCheck} hint={t("dashboard.operations.noShowCiHint")} />
          <KpiCard label={t("dashboard.operations.occupancy")} value={`${d.operations.occupancyRate}%`} icon={Gauge} hint={t("dashboard.operations.occupancyHint", { occupied: d.operations.occupied, available: d.operations.availableSlots })} />
          <KpiCard label={t("dashboard.operations.perDay")} value={String(d.operations.completedPerDay)} icon={Activity} hint={t("dashboard.operations.perDayHint")} />
          <KpiCard label={t("dashboard.operations.perHour")} value={String(d.operations.completedPerClinicalHour)} icon={UserRoundCheck} hint={t("dashboard.operations.perHourHint")} />
        </div>
        <DataGap labels={[t("dashboard.operations.gapLab"), t("dashboard.operations.gapBeds")]} />
      </DashboardSection>

      {canViewFinancials && <DashboardSection title={t("dashboard.finance.title")} description={t("dashboard.finance.description")} icon={WalletCards}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard label={t("dashboard.finance.perConsultation")} value={f.money(d.finance.revenuePerConsultation)} icon={Receipt} hint={t("dashboard.finance.perConsultationHint", { revenue: f.money(d.finance.consultationRevenue), count: d.finance.completedConsultations })} />
          <KpiCard label={t("dashboard.finance.perPatient")} value={f.money(d.finance.revenuePerPatient)} icon={HandCoins} hint={t("dashboard.finance.perPatientHint", { revenue: f.money(d.finance.revenue), count: d.base.uniquePatients })} />
          <KpiCard label={t("dashboard.finance.costPerAttendance")} value={d.finance.costPerAttendance === null ? na : f.money(d.finance.costPerAttendance)} icon={Banknote} hint={d.finance.costsScoped ? t("dashboard.finance.costPerAttendanceHint", { expenses: f.money(d.finance.expenses), count: d.base.completed }) : t("dashboard.finance.costsUnscoped")} />
          <KpiCard label={t("dashboard.finance.margin")} value={d.finance.margin === null ? na : `${d.finance.margin}%`} icon={TrendingUp} hint={d.finance.costsScoped ? t("dashboard.finance.marginHint", { revenue: f.money(d.finance.revenue), expenses: f.money(d.finance.expenses) }) : t("dashboard.finance.costsUnscoped")} />
          <KpiCard label={t("dashboard.finance.delinquency")} value={`${d.finance.delinquencyRate}%`} icon={CalendarX2} invertDelta hint={t("dashboard.finance.delinquencyHint", { overdue: d.finance.overdueInvoices, outstanding: d.finance.outstandingInvoices })} />
          <KpiCard label={t("dashboard.finance.receiptTime")} value={t("dashboard.finance.receiptTimeValue", { value: d.finance.receiptTime.mean })} icon={Clock3} hint={t("dashboard.finance.receiptTimeHint")} description={t("dashboard.finance.receiptTimeDescription")} />
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          <MoneyBreakdownCard title={t("dashboard.finance.payerMix")} description={t("dashboard.finance.recognisedRevenue")} data={d.finance.payerMix} labels={{ group: t("dashboard.group"), revenue: t("dashboard.revenue"), empty: t("dashboard.noRevenue") }} money={f.money} />
          <MoneyBreakdownCard title={t("dashboard.finance.bySpecialty")} description={t("dashboard.finance.recognisedRevenue")} data={d.finance.bySpecialty} labels={{ group: t("dashboard.group"), revenue: t("dashboard.revenue"), empty: t("dashboard.noRevenue") }} money={f.money} />
        </div>
        <DataGap labels={[t("dashboard.finance.gapCosts"), t("dashboard.finance.gapDenials")]} />
      </DashboardSection>}

      <DashboardSection title={t("dashboard.quality.title")} description={t("dashboard.quality.description")} icon={ShieldCheck}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard label={t("dashboard.quality.completeness")} value={`${d.quality.completenessRate}%`} icon={ClipboardCheck} hint={t("dashboard.quality.completenessHint", { complete: d.quality.completeRecords, total: d.quality.clinicalRecords })} />
        </div>
        <DataGap labels={[t("dashboard.quality.gapNps"), t("dashboard.quality.gapComplaints")]} />
      </DashboardSection>
      </DashboardTabs>
    </>
  );
}

function BreakdownCard({ title, description, data, emptyText }: { title: string; description: string; data: { label: string; value: number; color?: string }[]; emptyText: string }) {
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle><CardDescription>{description}</CardDescription></CardHeader>
      <CardContent className="pt-0">
        {data.length ? <BarList data={data} format="int" /> : <p className="py-6 text-center text-sm text-muted-foreground">{emptyText}</p>}
      </CardContent>
    </Card>
  );
}

function MoneyBreakdownCard({ title, description, data, labels, money }: {
  title: string;
  description: string;
  data: { label: string; value: number; color?: string }[];
  labels: { group: string; revenue: string; empty: string };
  money: (cents: number) => string;
}) {
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle><CardDescription>{description}</CardDescription></CardHeader>
      <CardContent className="pt-0">
        {data.length ? (
          <Table>
            <TableHeader><TableRow><TableHead>{labels.group}</TableHead><TableHead className="text-right">{labels.revenue}</TableHead></TableRow></TableHeader>
            <TableBody>{data.map((item) => <TableRow key={item.label}><TableCell className="font-medium">{item.label}</TableCell><TableCell className="text-right tabular">{money(item.value)}</TableCell></TableRow>)}</TableBody>
          </Table>
        ) : <p className="py-6 text-center text-sm text-muted-foreground">{labels.empty}</p>}
      </CardContent>
    </Card>
  );
}
