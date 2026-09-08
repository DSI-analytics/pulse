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
import { formatMZN } from "@/lib/money";

const APPOINTMENT_TYPES: AppointmentType[] = ["CONSULTA", "RETORNO", "EXAME", "PROCEDIMENTO"];
const TYPE_OPTIONS = [
  { value: "CONSULTA", label: "Primeira consulta" },
  { value: "RETORNO", label: "Seguimento" },
  { value: "EXAME", label: "Exame" },
  { value: "PROCEDIMENTO", label: "Procedimento" },
];

type DashboardSearchParams = {
  de?: string; ate?: string; medico?: string; especialidade?: string; tipo?: string; pagador?: string;
};

function parseDate(value: string | undefined, fallback: Date, end = false) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return fallback;
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return fallback;
  return end ? endOfDay(parsed) : startOfDay(parsed);
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<DashboardSearchParams> }) {
  const user = await requirePermission("dashboard.view");
  const canViewFinancials = can(user.role, "finance.view");
  const sp = await searchParams;
  const now = new Date();
  let from = parseDate(sp.de, startOfMonth(now));
  let to = parseDate(sp.ate, endOfDay(now), true);
  if (from > to) [from, to] = [startOfDay(to), endOfDay(from)];
  const appointmentType = APPOINTMENT_TYPES.includes(sp.tipo as AppointmentType) ? sp.tipo as AppointmentType : undefined;
  const payer = sp.pagador === "private" || sp.pagador === "insured" ? sp.pagador : undefined;

  const [d, options] = await Promise.all([
    getGroupedDashboardData(user.clinicId, {
      from, to, doctorId: sp.medico, specialtyId: sp.especialidade, appointmentType, payer,
    }, { includeFinancials: canViewFinancials }),
    getDashboardFilterOptions(user.clinicId),
  ]);
  const dashboardTabs: DashboardTab[] = [
    { id: "resumo", label: "Resumo" },
    { id: "assistencia", label: "Assistência" },
    { id: "operacao", label: "Operação" },
    ...(canViewFinancials ? [{ id: "financas" as const, label: "Finanças" }] : []),
    { id: "qualidade", label: "Qualidade" },
  ];

  return (
    <>
      <PageHeader
        title="Indicadores da clínica"
      />

      <ListFilters action="/" clearHref="/" fields={[
        { name: "de", label: "Data inicial", type: "date", value: format(from, "yyyy-MM-dd") },
        { name: "ate", label: "Data final", type: "date", value: format(to, "yyyy-MM-dd") },
        { name: "medico", label: "Médico", value: sp.medico, options: options.doctors.map((item) => ({ value: item.id, label: item.name })) },
        { name: "especialidade", label: "Especialidade", value: sp.especialidade, options: options.specialties.map((item) => ({ value: item.id, label: item.name })) },
        { name: "tipo", label: "Tipo de serviço", value: appointmentType, options: TYPE_OPTIONS },
        { name: "pagador", label: "Pagador", value: payer, options: [{ value: "private", label: "Particular" }, { value: "insured", label: "Seguradora / convénio" }] },
      ]} />

      <DashboardTabs tabs={dashboardTabs}>
      <DashboardSection title="Medidas estatísticas base" description="Volume, distribuição, médias, percentis e variação no período filtrado." icon={ChartNoAxesCombined}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard label="Atendimentos marcados" value={String(d.base.scheduled)} icon={CalendarCheck} hint="exclui cancelados" />
          <KpiCard label="Consultas concluídas" value={String(d.base.completed)} icon={UserRoundCheck} deltaPct={d.base.completedDeltaPct ?? undefined} hint={`${d.base.completedDelta >= 0 ? "+" : ""}${d.base.completedDelta} vs. período anterior`} />
          <KpiCard label="Pacientes distintos" value={String(d.base.uniquePatients)} icon={Users} hint="no período selecionado" />
          <KpiCard label="Taxa de conclusão" value={`${d.base.completionRate}%`} icon={Percent} hint={`${d.base.completed} concluídas ÷ ${d.base.scheduled} marcadas`} />
          <KpiCard label="Espera média / moda" value={`${d.base.wait.mean} / ${d.base.wait.mode ?? "—"} min`} icon={Activity} hint="moda apenas quando é única" description="Tempo médio entre a chegada do paciente e o início da consulta; a moda representa o tempo de espera mais frequente." />
          <KpiCard label="Espera P90 / P95" value={`${d.base.wait.p90} / ${d.base.wait.p95} min`} icon={Timer} hint="90% / 95% esperaram até este tempo" />
          <KpiCard label="Média móvel (7 dias)" value={`${d.base.movingAverage7d} / dia`} icon={TrendingUp} hint="consultas concluídas" />
          <KpiCard label="Variação homóloga" value={d.base.completedYoYPct === null ? "N/D" : `${d.base.completedYoYPct}%`} icon={TrendingUp} hint="vs. mesmo período há 1 ano" />
        </div>
        <div className="grid gap-3 lg:grid-cols-3">
          <BreakdownCard title="Por tipo de serviço" description={`${d.base.scheduled} marcações`} data={d.base.byType} />
          <BreakdownCard title="Distribuição por sexo" description={`${d.base.uniquePatients} pacientes distintos`} data={d.base.byGender} />
          <BreakdownCard title="Distribuição por faixa etária" description="Idade na data final do período" data={d.base.byAge} />
        </div>
      </DashboardSection>

      <DashboardSection title="Indicadores assistenciais" description="Continuidade do cuidado, perfil dos atendimentos e cobertura de exames." icon={Stethoscope}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard label="Primeiras consultas" value={String(d.care.firstConsultations)} icon={CalendarCheck} hint="tipo: consulta" />
          <KpiCard label="Seguimentos" value={String(d.care.followUps)} icon={UserRoundCheck} hint="tipo: retorno" />
          <KpiCard label="Taxa de retorno" value={`${d.care.returnRate}%`} icon={TrendingUp} hint={`${d.care.followUps} retornos ÷ ${d.care.firstConsultations + d.care.followUps} consultas`} />
          <KpiCard label="Abandono do seguimento" value={`${d.care.followUpAbandonmentRate}%`} icon={CalendarX2} invertDelta hint={`${d.care.followUpNoShows} faltas ÷ ${d.care.followUps} retornos`} />
          <KpiCard label="Cobertura de exames" value={`${d.care.examCoverage}%`} icon={TestTube2} hint={`${d.care.examsCompleted} realizados ÷ ${d.care.examsRequested} solicitados`} />
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          <BreakdownCard title="Atendimentos por especialidade" description="Marcações não canceladas" data={d.care.bySpecialty} />
          <BreakdownCard title="Diagnósticos mais frequentes" description="Texto clínico registado · não codificado em CID-10" data={d.care.diagnoses} />
        </div>
        <DataGap labels={["CID-10 estruturado", "referências e transferências", "readmissões em 30 dias", "infeções associadas aos cuidados"]} />
      </DashboardSection>

      <DashboardSection title="Indicadores operacionais" description="Espera, duração, faltas, capacidade e produtividade clínica." icon={Gauge}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard label="Espera média" value={`${d.operations.wait.mean} min`} icon={Clock3} hint="chegada → início da consulta" description="Média de minutos decorridos entre o registo de chegada e o início efetivo das consultas no período." />
          <KpiCard label="Duração média" value={`${d.operations.consultationDuration.mean} min`} icon={Timer} hint={`n = ${d.operations.consultationDuration.count}`} description="Duração média das consultas concluídas que possuem hora de início e de fim registadas." />
          <KpiCard label="Taxa de faltas" value={`${d.operations.noShowRate}%`} icon={CalendarX2} invertDelta hint={`${d.operations.noShows} faltas ÷ ${d.operations.noShowDenominator} marcações já ocorridas`} />
          <KpiCard label="IC 95% das faltas" value={`${d.operations.noShowCi.low}%–${d.operations.noShowCi.high}%`} icon={ShieldCheck} hint="intervalo de Wilson" />
          <KpiCard label="Taxa de ocupação" value={`${d.operations.occupancyRate}%`} icon={Gauge} hint={`${d.operations.occupied} ocupadas ÷ ${d.operations.availableSlots} disponíveis`} />
          <KpiCard label="Consultas por dia" value={String(d.operations.completedPerDay)} icon={Activity} hint="concluídas ÷ dias do período" />
          <KpiCard label="Consultas por hora" value={String(d.operations.completedPerClinicalHour)} icon={UserRoundCheck} hint="concluídas ÷ horas clínicas disponíveis" />
        </div>
        <DataGap labels={["tempo de resposta laboratorial", "ocupação de camas e salas (não modeladas)"]} />
      </DashboardSection>

      {canViewFinancials && <DashboardSection title="Indicadores financeiros" description="Receita unitária, custos, margem, pagadores, recebimento e inadimplência." icon={WalletCards}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard label="Receita por consulta" value={formatMZN(d.finance.revenuePerConsultation)} icon={Receipt} hint={`${formatMZN(d.finance.consultationRevenue)} ÷ ${d.finance.completedConsultations} consultas`} />
          <KpiCard label="Receita por paciente" value={formatMZN(d.finance.revenuePerPatient)} icon={HandCoins} hint={`${formatMZN(d.finance.revenue)} ÷ ${d.base.uniquePatients} pacientes`} />
          <KpiCard label="Custo médio por atendimento" value={d.finance.costPerAttendance === null ? "N/D" : formatMZN(d.finance.costPerAttendance)} icon={Banknote} hint={d.finance.costsScoped ? `${formatMZN(d.finance.expenses)} ÷ ${d.base.completed} concluídas` : "custos sem alocação ao filtro clínico"} />
          <KpiCard label="Margem operacional" value={d.finance.margin === null ? "N/D" : `${d.finance.margin}%`} icon={TrendingUp} hint={d.finance.costsScoped ? `(${formatMZN(d.finance.revenue)} − ${formatMZN(d.finance.expenses)}) ÷ receita` : "custos sem alocação ao filtro clínico"} />
          <KpiCard label="Inadimplência" value={`${d.finance.delinquencyRate}%`} icon={CalendarX2} invertDelta hint={`${d.finance.overdueInvoices} vencidas ÷ ${d.finance.outstandingInvoices} em aberto`} />
          <KpiCard label="Prazo médio de recebimento" value={`${d.finance.receiptTime.mean} dias`} icon={Clock3} hint="em pagamentos de seguradoras" description="Número médio de dias entre a emissão da fatura e o recebimento registado da seguradora." />
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          <MoneyBreakdownCard title="Mix de pagadores" description="Receita reconhecida no período" data={d.finance.payerMix} />
          <MoneyBreakdownCard title="Receita por especialidade" description="Receita reconhecida no período" data={d.finance.bySpecialty} />
        </div>
        <DataGap labels={["custos alocados por linha de serviço", "glosas ou recusas de seguradoras"]} />
      </DashboardSection>}

      <DashboardSection title="Qualidade e experiência" description="Qualidade documental e disponibilidade dos indicadores de experiência." icon={ShieldCheck}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard label="Completude do registo" value={`${d.quality.completenessRate}%`} icon={ClipboardCheck} hint={`${d.quality.completeRecords} completos ÷ ${d.quality.clinicalRecords} registos`} />
        </div>
        <DataGap labels={["NPS ou satisfação", "reclamações por 1.000 atendimentos"]} />
      </DashboardSection>
      </DashboardTabs>
    </>
  );
}

function BreakdownCard({ title, description, data }: { title: string; description: string; data: { label: string; value: number; color?: string }[] }) {
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle><CardDescription>{description}</CardDescription></CardHeader>
      <CardContent className="pt-0">
        {data.length ? <BarList data={data} format="int" /> : <p className="py-6 text-center text-sm text-muted-foreground">Sem dados no período.</p>}
      </CardContent>
    </Card>
  );
}

function MoneyBreakdownCard({ title, description, data }: { title: string; description: string; data: { label: string; value: number; color?: string }[] }) {
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle><CardDescription>{description}</CardDescription></CardHeader>
      <CardContent className="pt-0">
        {data.length ? (
          <Table>
            <TableHeader><TableRow><TableHead>Grupo</TableHead><TableHead className="text-right">Receita</TableHead></TableRow></TableHeader>
            <TableBody>{data.map((item) => <TableRow key={item.label}><TableCell className="font-medium">{item.label}</TableCell><TableCell className="text-right tabular">{formatMZN(item.value)}</TableCell></TableRow>)}</TableBody>
          </Table>
        ) : <p className="py-6 text-center text-sm text-muted-foreground">Sem receita no período.</p>}
      </CardContent>
    </Card>
  );
}
