import Link from "next/link";
import { Wallet, TrendingDown, TrendingUp, Percent, ArrowDownLeft, ArrowUpRight, Receipt, CheckCircle2, AlertTriangle, ExternalLink } from "lucide-react";
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
import { ListFilters } from "@/components/list-filters";
import type { ExpenseStatus, InvoiceStatus, RevenueSource } from "@prisma/client";
import { reconcileBilling } from "@/lib/domain/billing";
import { InvoicePaymentButton } from "@/components/invoice-payment-button";

const EXPENSE_STATUSES: ExpenseStatus[] = ["PENDENTE", "PAGA", "ANULADA"];
const REVENUE_SOURCES: RevenueSource[] = ["CONSULTA", "PROCEDIMENTO", "EXAME", "PRODUTO", "SEGURADORA", "PRIVADO", "OUTRO"];
const INVOICE_STATUSES: InvoiceStatus[] = ["EMITIDA", "PARCIAL", "PAGA", "ANULADA"];

function filterDate(value: string | undefined, end = false) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T${end ? "23:59:59.999" : "00:00:00"}`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export default async function FinanceiroPage({ searchParams }: { searchParams: Promise<{ q?: string; categoria?: string; estado?: string; origem?: string; de?: string; ate?: string; fatura?: string; seguradora?: string }> }) {
  const user = await requirePermission("finance.view");
  const sp = await searchParams;
  const query = (sp.q ?? "").trim();
  const expenseStatus = EXPENSE_STATUSES.includes(sp.estado as ExpenseStatus) ? sp.estado as ExpenseStatus : undefined;
  const revenueSource = REVENUE_SOURCES.includes(sp.origem as RevenueSource) ? sp.origem as RevenueSource : undefined;
  const invoiceStatus = INVOICE_STATUSES.includes(sp.fatura as InvoiceStatus) ? sp.fatura as InvoiceStatus : undefined;
  const [d, expenseCategories, invoices, insurers, insuredInvoices] = await Promise.all([
    getFinanceData(user.clinicId, {
      query,
      categoryId: sp.categoria,
      expenseStatus,
      revenueSource,
      from: filterDate(sp.de),
      to: filterDate(sp.ate, true),
    }),
    prisma.expenseCategory.findMany({ where: { clinicId: user.clinicId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.invoice.findMany({
      where: {
        clinicId: user.clinicId,
        ...(query ? { OR: [
          { number: { contains: query, mode: "insensitive" } },
          { patient: { name: { contains: query, mode: "insensitive" } } },
        ] } : {}),
        ...(invoiceStatus ? { status: invoiceStatus } : { status: { not: "RASCUNHO" } }),
        ...(sp.seguradora ? { healthPlan: { insuranceCompanyId: sp.seguradora } } : {}),
      },
      orderBy: { issuedAt: "desc" },
      take: 50,
      select: {
        id: true, number: true, status: true, total: true, patientDue: true, insurerDue: true,
        amountPaid: true, issuedAt: true, dueAt: true,
        patient: { select: { name: true, code: true } },
        healthPlan: { select: { name: true, insuranceCompany: { select: { id: true, name: true } } } },
        items: { select: { id: true, description: true, quantity: true, total: true } },
        payments: { orderBy: { receivedAt: "desc" }, select: { id: true, amount: true, fromInsurer: true, receiptNumber: true, receivedAt: true } },
        appointment: { select: { revenue: { select: { amount: true, status: true } } } },
      },
    }),
    prisma.healthInsuranceCompany.findMany({ where: { clinicId: user.clinicId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.invoice.findMany({
      where: { clinicId: user.clinicId, healthPlanId: { not: null }, status: { notIn: ["RASCUNHO", "ANULADA"] } },
      select: {
        insurerDue: true,
        healthPlan: { select: { insuranceCompany: { select: { id: true, name: true } } } },
        payments: { where: { fromInsurer: true }, select: { amount: true } },
      },
    }),
  ]);
  const k = d.kpis;
  const invoiceRows = invoices.map((invoice) => {
    const patientPaid = invoice.payments.filter((payment) => !payment.fromInsurer).reduce((sum, payment) => sum + payment.amount, 0);
    const insurerPaid = invoice.payments.filter((payment) => payment.fromInsurer).reduce((sum, payment) => sum + payment.amount, 0);
    const reconciliation = reconcileBilling({ patientDue: invoice.patientDue, insurerDue: invoice.insurerDue, patientPaid, insurerPaid });
    const revenue = invoice.appointment?.revenue;
    const reconciled = invoice.amountPaid === reconciliation.amountPaid
      && invoice.status === reconciliation.invoiceStatus
      && (!revenue || (revenue.amount === invoice.total && revenue.status === reconciliation.revenueStatus));
    return { invoice, reconciliation, reconciled };
  });
  const insurerAccounts = Array.from(insuredInvoices.reduce((map, invoice) => {
    const insurer = invoice.healthPlan?.insuranceCompany;
    if (!insurer) return map;
    const current = map.get(insurer.id) ?? { id: insurer.id, name: insurer.name, invoices: 0, billed: 0, paid: 0, outstanding: 0 };
    const paid = invoice.payments.reduce((sum, payment) => sum + payment.amount, 0);
    current.invoices += 1;
    current.billed += invoice.insurerDue;
    current.paid += paid;
    current.outstanding += Math.max(0, invoice.insurerDue - paid);
    map.set(insurer.id, current);
    return map;
  }, new Map<string, { id: string; name: string; invoices: number; billed: number; paid: number; outstanding: number }>()).values()).sort((a, b) => b.outstanding - a.outstanding);

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

      <ListFilters action="/financeiro" fields={[
        { name: "q", label: "Pesquisar", value: query, type: "search", placeholder: "Descrição ou paciente…" },
        { name: "categoria", label: "Categoria da despesa", value: sp.categoria, options: expenseCategories.map((category) => ({ value: category.id, label: category.name })) },
        { name: "estado", label: "Estado da despesa", value: expenseStatus, options: EXPENSE_STATUSES.map((value) => ({ value, label: value })) },
        { name: "origem", label: "Origem da receita", value: revenueSource, options: REVENUE_SOURCES.map((value) => ({ value, label: value })) },
        { name: "fatura", label: "Estado da fatura", value: invoiceStatus, options: INVOICE_STATUSES.map((value) => ({ value, label: value })) },
        { name: "seguradora", label: "Seguradora", value: sp.seguradora, options: insurers.map((insurer) => ({ value: insurer.id, label: insurer.name })) },
        { name: "de", label: "Data inicial", value: sp.de, type: "date" },
        { name: "ate", label: "Data final", value: sp.ate, type: "date" },
      ]} />

      <Card>
        <CardHeader><CardTitle>Faturas e contas a receber</CardTitle><CardDescription>{invoiceRows.length} faturas · pagamentos de pacientes e seguradoras</CardDescription></CardHeader>
        <CardContent className="pt-0">
          <Table>
            <TableHeader><TableRow><TableHead>Fatura</TableHead><TableHead>Paciente / item</TableHead><TableHead className="text-right">Paciente</TableHead><TableHead className="text-right">Seguradora</TableHead><TableHead className="text-right">Pago</TableHead><TableHead className="text-right">Saldo</TableHead><TableHead>Estado</TableHead><TableHead>Reconciliação</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader>
            <TableBody>
              {invoiceRows.map(({ invoice, reconciliation, reconciled }) => (
                <TableRow key={invoice.id}>
                  <TableCell><p className="font-mono text-[12px] font-medium">{invoice.number}</p><p className="text-[11px] text-muted-foreground">{formatDateShort(invoice.issuedAt)}</p></TableCell>
                  <TableCell><p className="text-sm font-medium">{invoice.patient.name}</p><p className="max-w-56 truncate text-[12px] text-muted-foreground">{invoice.items.map((item) => item.description).join(" · ") || "Sem itens"}</p>{invoice.healthPlan && <p className="text-[11px] text-info">{invoice.healthPlan.insuranceCompany.name} · {invoice.healthPlan.name}</p>}</TableCell>
                  <TableCell className="text-right text-[13px] tabular"><span>{formatMZN(invoice.patientDue)}</span><span className="block text-[11px] text-muted-foreground">saldo {formatMZN(reconciliation.patientOutstanding)}</span></TableCell>
                  <TableCell className="text-right text-[13px] tabular"><span>{formatMZN(invoice.insurerDue)}</span><span className="block text-[11px] text-muted-foreground">saldo {formatMZN(reconciliation.insurerOutstanding)}</span></TableCell>
                  <TableCell className="text-right font-medium tabular text-success">{formatMZN(reconciliation.amountPaid)}</TableCell>
                  <TableCell className="text-right font-medium tabular text-danger">{formatMZN(reconciliation.outstanding)}</TableCell>
                  <TableCell><Badge variant={invoice.status === "PAGA" ? "success" : invoice.status === "PARCIAL" ? "warning" : invoice.status === "ANULADA" ? "neutral" : "info"}>{invoice.status === "PAGA" ? "Paga" : invoice.status === "PARCIAL" ? "Parcial" : invoice.status === "ANULADA" ? "Anulada" : "Emitida"}</Badge></TableCell>
                  <TableCell>{reconciled ? <span className="inline-flex items-center gap-1 text-xs font-medium text-success"><CheckCircle2 className="size-3.5" /> Conciliada</span> : <span className="inline-flex items-center gap-1 text-xs font-medium text-warning"><AlertTriangle className="size-3.5" /> Divergente</span>}</TableCell>
                  <TableCell><div className="flex justify-end gap-1.5">{invoice.payments[0] && <Link href={`/financeiro/recibos/${invoice.payments[0].id}`} target="_blank" className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-2 hover:text-foreground" title="Abrir último recibo"><ExternalLink className="size-4" /></Link>}{can(user.role, "finance.manage") && reconciliation.outstanding > 0 && invoice.status !== "ANULADA" && <InvoicePaymentButton invoiceId={invoice.id} invoiceNumber={invoice.number} patientOutstanding={reconciliation.patientOutstanding} insurerOutstanding={reconciliation.insurerOutstanding} />}</div></TableCell>
                </TableRow>
              ))}
              {invoiceRows.length === 0 && <TableRow><TableCell colSpan={9} className="py-8 text-center text-sm text-muted-foreground">Nenhuma fatura corresponde aos filtros.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Contas de seguradoras</CardTitle><CardDescription>Responsabilidade, recebimentos e saldo por seguradora</CardDescription></CardHeader>
        <CardContent className="pt-0">
          <Table><TableHeader><TableRow><TableHead>Seguradora</TableHead><TableHead className="text-right">Faturas</TableHead><TableHead className="text-right">Faturado</TableHead><TableHead className="text-right">Recebido</TableHead><TableHead className="text-right">Por receber</TableHead></TableRow></TableHeader><TableBody>
            {insurerAccounts.map((account) => <TableRow key={account.id}><TableCell className="font-medium">{account.name}</TableCell><TableCell className="text-right tabular">{account.invoices}</TableCell><TableCell className="text-right tabular">{formatMZN(account.billed)}</TableCell><TableCell className="text-right tabular text-success">{formatMZN(account.paid)}</TableCell><TableCell className="text-right font-medium tabular text-danger">{formatMZN(account.outstanding)}</TableCell></TableRow>)}
            {insurerAccounts.length === 0 && <TableRow><TableCell colSpan={5} className="py-6 text-center text-sm text-muted-foreground">Sem contas de seguradoras.</TableCell></TableRow>}
          </TableBody></Table>
        </CardContent>
      </Card>

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
                {d.recentRev.length === 0 && <TableRow><TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">Nenhuma receita corresponde aos filtros.</TableCell></TableRow>}
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
              {d.recentExp.length === 0 && <TableRow><TableCell colSpan={can(user.role, "finance.manage") ? 6 : 5} className="py-8 text-center text-sm text-muted-foreground">Nenhuma despesa corresponde aos filtros.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
