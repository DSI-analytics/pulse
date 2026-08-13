import Link from "next/link";
import { CalendarCheck, Users, Wallet, Gauge, Clock3, TrendingUp } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { getDashboardData } from "@/server/analytics";
import { getInsights } from "@/server/insights";
import { PageHeader } from "@/components/page-header";
import { KpiCard } from "@/components/kpi-card";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { StatusPill } from "@/components/status-pill";
import { BarList } from "@/components/bar-list";
import { TrendChart } from "@/components/charts/trend-chart";
import { InsightsFeed, InsightsHeading } from "@/components/insights-feed";
import { buttonVariants } from "@/components/ui/button";
import { formatMZN } from "@/lib/money";
import { formatTime, monthLabel } from "@/lib/datetime";
import { TYPE_LABEL } from "@/lib/appointment-status";

export default async function DashboardPage() {
  const user = await requirePermission("dashboard.view");
  const [d, insights] = await Promise.all([getDashboardData(user.clinicId), getInsights(user.clinicId)]);
  const k = d.kpis;

  return (
    <>
      <PageHeader
        eyebrow={`Sinais vitais · ${monthLabel(new Date())}`}
        title="Como está a clínica hoje"
        description="Uma leitura em tempo real da operação, das finanças e da capacidade médica."
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard label="Consultas Hoje" value={String(k.consultasHoje)} icon={CalendarCheck} hint="marcações de hoje" />
        <KpiCard label="Pacientes Hoje" value={String(k.pacientesHoje)} icon={Users} hint="atendidos / em fila" />
        <KpiCard label="Receita do Mês" value={formatMZN(k.revenueMonth)} icon={Wallet} deltaPct={k.deltaRevenue} />
        <KpiCard label="Ocupação Médica" value={`${k.occupancy}%`} icon={Gauge} hint="média da clínica" />
        <KpiCard label="Contas a Receber" value={formatMZN(k.receivables)} icon={Clock3} hint="seguradoras + pacientes" />
        <KpiCard
          label="Resultado do Mês"
          value={formatMZN(k.resultMonth)}
          icon={TrendingUp}
          hint="receita − despesas"
        />
      </div>

      {/* Today + occupancy */}
      <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>Consultas de Hoje</CardTitle>
              <CardDescription>{k.consultasHoje} marcações</CardDescription>
            </div>
            <Link href="/agenda" className={buttonVariants({ variant: "secondary", size: "sm" })}>
              Ver agenda
            </Link>
          </CardHeader>
          <CardContent className="pt-0">
            {d.todaysAppointments.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Sem marcações para hoje.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Hora</TableHead>
                    <TableHead>Paciente</TableHead>
                    <TableHead>Médico</TableHead>
                    <TableHead>Especialidade</TableHead>
                    <TableHead>Cobertura</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {d.todaysAppointments.slice(0, 8).map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="font-mono text-[13px]">{formatTime(a.startAt)}</TableCell>
                      <TableCell className="font-medium">{a.patient.name}</TableCell>
                      <TableCell className="text-muted-foreground">{a.doctor.name}</TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1.5 text-[13px]">
                          <span className="size-2 rounded-full" style={{ background: a.specialty.color }} />
                          {a.specialty.name}
                        </span>
                      </TableCell>
                      <TableCell className="text-[13px]">
                        {a.healthPlan ? (
                          <Badge variant="info">{a.healthPlan.insuranceCompany.name}</Badge>
                        ) : (
                          <Badge variant="neutral">Particular</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <StatusPill status={a.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ocupação Médica</CardTitle>
            <CardDescription>Este mês · ocupação, consultas e receita</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            {d.doctorOccupancy.slice(0, 6).map((doc) => (
              <div key={doc.id} className="space-y-1.5">
                <div className="flex items-center justify-between gap-2 text-[13px]">
                  <span className="truncate font-medium">{doc.name}</span>
                  <span className="shrink-0 text-muted-foreground tabular">
                    {doc.consultas} cons. · {formatMZN(doc.receita)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Progress
                    value={doc.occupancy}
                    indicatorClassName={
                      doc.occupancy >= 75 ? "bg-success" : doc.occupancy >= 55 ? "bg-warning" : "bg-danger"
                    }
                  />
                  <span className="w-9 shrink-0 text-right text-[13px] font-semibold tabular">{doc.occupancy}%</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Trends */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Receita Mensal</CardTitle>
            <CardDescription>Últimos 6 meses</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <TrendChart data={d.revenueTrend} kind="mzn" variant="area" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Consultas por Mês</CardTitle>
            <CardDescription>Volume de marcações</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <TrendChart data={d.appointmentTrend} kind="int" variant="bar" />
          </CardContent>
        </Card>
      </div>

      {/* Breakdown + insights */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Receita por Especialidade</CardTitle>
            <CardDescription>Este mês</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <BarList data={d.bySpecialty.map((s) => ({ label: s.label, value: s.value, color: s.color }))} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Receita por Plano</CardTitle>
            <CardDescription>Este mês</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <BarList data={d.byPlan.slice(0, 6)} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>
              <InsightsHeading />
            </CardTitle>
            <CardDescription>Análise automática dos seus dados</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <InsightsFeed insights={insights.slice(0, 4)} compact />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
