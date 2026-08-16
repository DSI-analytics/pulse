import { Wallet, TrendingDown, TrendingUp, Percent, ArrowDownLeft, ArrowUpRight, Receipt } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { getFinanceData } from "@/server/finance-analytics";
import { createExpenseRecord, deleteExpenseRecord, updateExpenseRecord } from "@/server/crud-actions";
import { PageHeader } from "@/components/page-header";
import { CadastroButton } from "@/components/cadastro-form";
import { TableRecordCrudCell } from "@/components/table-record-crud-cell";
import { KpiCard } from "@/components/kpi-card";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { BarList } from "@/components/bar-list";
import { TrendChart } from "@/components/charts/trend-chart";
import { formatMZN } from "@/lib/money";
import { formatDateShort } from "@/lib/datetime";

export default async function FinanceiroPage() {
  const user = await requirePermission("finance.view");
  const [d, expenseCategories] = await Promise.all([
    getFinanceData(user.clinicId),
    prisma.expenseCategory.findMany({ where: { clinicId: user.clinicId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const k = d.kpis;

  return (
    <>
      <PageHeader
        eyebrow="Gestão"
        title="Financeiro"
        description="Receitas, despesas, recebimentos e fluxo de caixa."
        actions={
          can(user.role, "finance.manage") ? (
            <CadastroButton
              label="Nova despesa"
              title="Nova despesa"
              action={createExpenseRecord}
              fields={[
                { name: "description", label: "Descrição", required: true, full: true, placeholder: "Ex.: Renda de Agosto" },
                { name: "categoryId", label: "Categoria", type: "select", options: expenseCategories.map((c) => ({ value: c.id, label: c.name })) },
                { name: "amount", label: "Valor", type: "money", required: true, suffix: "MZN", placeholder: "145000" },
                { name: "status", label: "Estado", type: "select", defaultValue: "PAGA", options: [
                  { value: "PAGA", label: "Paga" }, { value: "PENDENTE", label: "Pendente" },
                ] },
                { name: "method", label: "Método", type: "select", options: [
                  { value: "DINHEIRO", label: "Dinheiro" }, { value: "MPESA", label: "M-Pesa" }, { value: "EMOLA", label: "e-Mola" },
                  { value: "CARTAO", label: "Cartão" }, { value: "TRANSFERENCIA", label: "Transferência" },
                ] },
                { name: "incurredAt", label: "Data", type: "date" },
              ]}
            />
          ) : undefined
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="Receita do mês" value={formatMZN(k.revenue)} icon={Wallet} hint="reconhecida" />
        <KpiCard label="Despesas do mês" value={formatMZN(k.expenses)} icon={TrendingDown} hint="até à data" />
        <KpiCard label="Resultado" value={formatMZN(k.result)} icon={TrendingUp} hint={`margem ${k.margin}%`} />
        <KpiCard label="Ticket médio" value={formatMZN(k.ticket)} icon={Receipt} hint="por consulta" />
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="Contas a receber" value={formatMZN(k.receivable)} icon={ArrowDownLeft} hint="seguradoras + pacientes" />
        <KpiCard label="Contas a pagar" value={formatMZN(k.payable)} icon={ArrowUpRight} hint="despesas + compras" />
        <KpiCard label="Margem" value={`${k.margin}%`} icon={Percent} hint="resultado / receita" />
        <KpiCard label="Posição líquida" value={formatMZN(k.receivable - k.payable)} icon={Wallet} hint="a receber − a pagar" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>Receita mensal</CardTitle><CardDescription>6 meses</CardDescription></CardHeader>
          <CardContent className="pt-0"><TrendChart data={d.revenueTrend} kind="mzn" variant="area" height={200} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Despesas mensais</CardTitle><CardDescription>6 meses</CardDescription></CardHeader>
          <CardContent className="pt-0"><TrendChart data={d.expenseTrend} kind="mzn" variant="bar" height={200} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Resultado mensal</CardTitle><CardDescription>Receita − despesas</CardDescription></CardHeader>
          <CardContent className="pt-0"><TrendChart data={d.resultTrend} kind="mzn" variant="area" height={200} /></CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <Card>
          <CardHeader><CardTitle>Recebimentos por método</CardTitle><CardDescription>Este mês</CardDescription></CardHeader>
          <CardContent className="pt-0">
            {d.byPaymentMethod.length ? <BarList data={d.byPaymentMethod} /> : <p className="text-sm text-muted-foreground">Sem recebimentos.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Receitas recentes</CardTitle></CardHeader>
          <CardContent className="pt-0">
            <Table>
              <TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Descrição</TableHead><TableHead>Paciente</TableHead><TableHead className="text-right">Valor</TableHead></TableRow></TableHeader>
              <TableBody>
                {d.recentRev.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-[13px] text-muted-foreground">{formatDateShort(r.recognisedAt)}</TableCell>
                    <TableCell className="text-[13px]">{r.description}</TableCell>
                    <TableCell className="text-[13px] text-muted-foreground">{r.patient?.name ?? "—"}</TableCell>
                    <TableCell className="text-right font-medium tabular text-success">{formatMZN(r.amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Despesas recentes</CardTitle></CardHeader>
        <CardContent className="pt-0">
          <Table>
            <TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Categoria</TableHead><TableHead>Descrição</TableHead><TableHead>Estado</TableHead><TableHead className="text-right">Valor</TableHead>{can(user.role, "finance.manage") && <TableHead className="text-right">Ações</TableHead>}</TableRow></TableHeader>
            <TableBody>
              {d.recentExp.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="text-[13px] text-muted-foreground">{formatDateShort(e.incurredAt)}</TableCell>
                  <TableCell className="text-[13px]">{e.category?.name ?? "—"}</TableCell>
                  <TableCell className="text-[13px] text-muted-foreground">{e.description}</TableCell>
                  <TableCell><Badge variant={e.status === "PAGA" ? "success" : e.status === "PENDENTE" ? "warning" : "neutral"}>{e.status === "PAGA" ? "Paga" : e.status === "PENDENTE" ? "Pendente" : "Anulada"}</Badge></TableCell>
                  <TableCell className="text-right font-medium tabular text-danger">{formatMZN(e.amount)}</TableCell>
                  {can(user.role, "finance.manage") && (
                    <TableCell className="text-right">
                      <TableRecordCrudCell
                        id={e.id}
                        title="Editar despesa"
                        description="Atualize os dados da despesa."
                        fields={[
                          { name: "description", label: "Descrição", required: true, defaultValue: e.description },
                          { name: "categoryId", label: "Categoria", type: "select", defaultValue: e.categoryId ?? "", options: expenseCategories.map((c) => ({ value: c.id, label: c.name })) },
                          { name: "amount", label: "Valor", type: "money", required: true, defaultValue: String(e.amount), suffix: "MZN" },
                          { name: "status", label: "Estado", type: "select", defaultValue: e.status, options: [
                            { value: "PAGA", label: "Paga" },
                            { value: "PENDENTE", label: "Pendente" },
                          ] },
                          { name: "method", label: "Método", type: "select", defaultValue: e.method ?? "", options: [
                            { value: "DINHEIRO", label: "Dinheiro" },
                            { value: "MPESA", label: "M-Pesa" },
                            { value: "EMOLA", label: "e-Mola" },
                            { value: "CARTAO", label: "Cartão" },
                            { value: "TRANSFERENCIA", label: "Transferência" },
                          ] },
                          { name: "incurredAt", label: "Data", type: "date", defaultValue: e.incurredAt ? new Date(e.incurredAt).toISOString().slice(0, 10) : "" },
                        ]}
                        updateAction={updateExpenseRecord}
                        deleteAction={deleteExpenseRecord}
                      />
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
