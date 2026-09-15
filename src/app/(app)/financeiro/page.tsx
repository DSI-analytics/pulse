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
import { ListFilters } from "@/components/list-filters";
import type { ExpenseStatus, InvoiceStatus, RevenueSource } from "@prisma/client";
import { reconcileBilling } from "@/lib/domain/billing";
import { InvoicePaymentButton } from "@/components/invoice-payment-button";
import { getFormatters, getTranslator } from "@/i18n/server";
import { DataViewTabs } from "@/components/data-view-tabs";

const EXPENSE_STATUSES = ["PENDENTE", "PAGA", "ANULADA"] as const satisfies readonly ExpenseStatus[];
const REVENUE_SOURCES = ["CONSULTA", "PROCEDIMENTO", "EXAME", "PRODUTO", "SEGURADORA", "PRIVADO", "OUTRO"] as const satisfies readonly RevenueSource[];
const INVOICE_STATUSES = ["EMITIDA", "PARCIAL", "PAGA", "ANULADA"] as const satisfies readonly InvoiceStatus[];
const EXPENSE_METHODS = ["DINHEIRO", "MPESA", "EMOLA", "CARTAO", "TRANSFERENCIA"] as const;

function pick<T extends string>(list: readonly T[], value: string | undefined): T | undefined {
  return list.includes(value as T) ? (value as T) : undefined;
}

function filterDate(value: string | undefined, end = false) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T${end ? "23:59:59.999" : "00:00:00"}`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export async function generateMetadata() {
  const t = await getTranslator();
  return { title: t("finance.title") };
}

export default async function FinanceiroPage({ searchParams }: { searchParams: Promise<{ q?: string; categoria?: string; estado?: string; origem?: string; de?: string; ate?: string; fatura?: string; seguradora?: string }> }) {
  const user = await requirePermission("finance.view");
  const [t, f] = await Promise.all([getTranslator(), getFormatters()]);
  const sp = await searchParams;
  const query = (sp.q ?? "").trim();
  const expenseStatus = pick(EXPENSE_STATUSES, sp.estado);
  const revenueSource = pick(REVENUE_SOURCES, sp.origem);
  const invoiceStatus = pick(INVOICE_STATUSES, sp.fatura);
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

  const methodOptions = EXPENSE_METHODS.map((value) => ({ value, label: t(`finance.methods.${value}`) }));
  const expenseStatusOptions = [
    { value: "PAGA", label: t("finance.expenseStatus.PAGA") },
    { value: "PENDENTE", label: t("finance.expenseStatus.PENDENTE") },
  ];
  const invoiceStatusLabel = (status: InvoiceStatus) =>
    status === "PAGA" ? t("finance.invoiceStatus.PAGA") : status === "PARCIAL" ? t("finance.invoiceStatus.PARCIAL") : status === "ANULADA" ? t("finance.invoiceStatus.ANULADA") : t("finance.invoiceStatus.EMITIDA");
  const expenseStatusLabel = (status: ExpenseStatus) =>
    status === "PAGA" ? t("finance.expenseStatus.PAGA") : status === "PENDENTE" ? t("finance.expenseStatus.PENDENTE") : t("finance.expenseStatus.ANULADA");

  return (
    <>
      <PageHeader
        eyebrow={t("finance.eyebrow")}
        title={t("finance.title")}
        description={t("finance.description")}
        actions={
          can(user.role, "finance.manage") ? (
            <CadastroButton
              label={t("finance.expense.new")}
              title={t("finance.expense.new")}
              action={createExpenseRecord}
              fields={[
                { name: "description", label: t("finance.expense.fields.description"), required: true, full: true, placeholder: t("finance.expense.fields.descriptionPlaceholder") },
                { name: "categoryId", label: t("finance.expense.fields.category"), type: "select", options: expenseCategories.map((c) => ({ value: c.id, label: c.name })) },
                { name: "amount", label: t("finance.expense.fields.amount"), type: "money", required: true, suffix: f.currency, placeholder: "145000" },
                { name: "status", label: t("finance.expense.fields.status"), type: "select", defaultValue: "PAGA", options: expenseStatusOptions },
                { name: "method", label: t("finance.expense.fields.method"), type: "select", options: methodOptions },
                { name: "incurredAt", label: t("finance.expense.fields.date"), type: "date" },
              ]}
            />
          ) : undefined
        }
      />

      <div className="relative grid grid-cols-2 gap-4 hover:z-20 focus-within:z-20 lg:grid-cols-4">
        <KpiCard label={t("finance.kpis.revenue")} value={f.money(k.revenue)} icon={Wallet} hint={t("finance.kpis.revenueHint")} />
        <KpiCard label={t("finance.kpis.expenses")} value={f.money(k.expenses)} icon={TrendingDown} hint={t("finance.kpis.expensesHint")} />
        <KpiCard label={t("finance.kpis.result")} value={f.money(k.result)} icon={TrendingUp} hint={t("finance.kpis.resultHint", { margin: k.margin })} />
        <KpiCard label={t("finance.kpis.ticket")} value={f.money(k.ticket)} icon={Receipt} hint={t("finance.kpis.ticketHint")} />
      </div>
      <div className="relative grid grid-cols-2 gap-4 hover:z-20 focus-within:z-20 lg:grid-cols-4">
        <KpiCard label={t("finance.kpis.receivable")} value={f.money(k.receivable)} icon={ArrowDownLeft} hint={t("finance.kpis.receivableHint")} />
        <KpiCard label={t("finance.kpis.payable")} value={f.money(k.payable)} icon={ArrowUpRight} hint={t("finance.kpis.payableHint")} />
        <KpiCard label={t("finance.kpis.margin")} value={`${k.margin}%`} icon={Percent} hint={t("finance.kpis.marginHint")} />
        <KpiCard label={t("finance.kpis.net")} value={f.money(k.receivable - k.payable)} icon={Wallet} hint={t("finance.kpis.netHint")} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>{t("finance.charts.revenue")}</CardTitle><CardDescription>{t("finance.charts.sixMonths")}</CardDescription></CardHeader>
          <CardContent className="pt-0"><TrendChart data={d.revenueTrend} kind="mzn" variant="area" height={200} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>{t("finance.charts.expenses")}</CardTitle><CardDescription>{t("finance.charts.sixMonths")}</CardDescription></CardHeader>
          <CardContent className="pt-0"><TrendChart data={d.expenseTrend} kind="mzn" variant="bar" height={200} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>{t("finance.charts.result")}</CardTitle><CardDescription>{t("finance.charts.resultDescription")}</CardDescription></CardHeader>
          <CardContent className="pt-0"><TrendChart data={d.resultTrend} kind="mzn" variant="area" height={200} /></CardContent>
        </Card>
      </div>

      <ListFilters action="/financeiro" fields={[
        { name: "q", label: t("finance.filters.search"), value: query, type: "search", placeholder: t("finance.filters.searchPlaceholder") },
        { name: "categoria", label: t("finance.filters.expenseCategory"), value: sp.categoria, options: expenseCategories.map((category) => ({ value: category.id, label: category.name })) },
        { name: "estado", label: t("finance.filters.expenseStatus"), value: expenseStatus, options: EXPENSE_STATUSES.map((value) => ({ value, label: t(`finance.filterOptions.expenseStatus.${value}`) })) },
        { name: "origem", label: t("finance.filters.revenueSource"), value: revenueSource, options: REVENUE_SOURCES.map((value) => ({ value, label: t(`finance.filterOptions.revenueSource.${value}`) })) },
        { name: "fatura", label: t("finance.filters.invoiceStatus"), value: invoiceStatus, options: INVOICE_STATUSES.map((value) => ({ value, label: t(`finance.filterOptions.invoiceStatus.${value}`) })) },
        { name: "seguradora", label: t("finance.filters.insurer"), value: sp.seguradora, options: insurers.map((insurer) => ({ value: insurer.id, label: insurer.name })) },
        { name: "de", label: t("finance.filters.from"), value: sp.de, type: "date" },
        { name: "ate", label: t("finance.filters.to"), value: sp.ate, type: "date" },
      ]} />

      <DataViewTabs
        ariaLabel={t("finance.title")}
        tabs={[
          { id: "invoices", label: t("finance.invoices.title") },
          { id: "insurers", label: t("finance.insurers.title") },
          { id: "revenue", label: t("finance.recentRevenue.title") },
          { id: "expenses", label: t("finance.recentExpenses.title") },
        ]}
      >
      <Card>
        <CardHeader><CardTitle>{t("finance.invoices.title")}</CardTitle><CardDescription>{t("finance.invoices.description", { count: invoiceRows.length })}</CardDescription></CardHeader>
        <CardContent className="pt-0">
          <Table>
            <TableHeader><TableRow><TableHead>{t("finance.invoices.columns.invoice")}</TableHead><TableHead>{t("finance.invoices.columns.patientItem")}</TableHead><TableHead className="text-right">{t("finance.invoices.columns.patient")}</TableHead><TableHead className="text-right">{t("finance.invoices.columns.insurer")}</TableHead><TableHead className="text-right">{t("finance.invoices.columns.paid")}</TableHead><TableHead className="text-right">{t("finance.invoices.columns.balance")}</TableHead><TableHead>{t("finance.invoices.columns.status")}</TableHead><TableHead>{t("finance.invoices.columns.reconciliation")}</TableHead><TableHead className="text-right">{t("finance.actions")}</TableHead></TableRow></TableHeader>
            <TableBody>
              {invoiceRows.map(({ invoice, reconciliation, reconciled }) => (
                <TableRow key={invoice.id}>
                  <TableCell><p className="font-mono text-[12px] font-medium">{invoice.number}</p><p className="text-[11px] text-muted-foreground">{f.date(invoice.issuedAt)}</p></TableCell>
                  <TableCell><p className="text-sm font-medium">{invoice.patient.name}</p><p className="max-w-56 truncate text-[12px] text-muted-foreground">{invoice.items.map((item) => item.description).join(" · ") || t("finance.invoices.noItems")}</p>{invoice.healthPlan && <p className="text-[11px] text-info">{invoice.healthPlan.insuranceCompany.name} · {invoice.healthPlan.name}</p>}</TableCell>
                  <TableCell className="text-right text-[13px] tabular"><span>{f.money(invoice.patientDue)}</span><span className="block text-[11px] text-muted-foreground">{t("finance.invoices.balance", { amount: f.money(reconciliation.patientOutstanding) })}</span></TableCell>
                  <TableCell className="text-right text-[13px] tabular"><span>{f.money(invoice.insurerDue)}</span><span className="block text-[11px] text-muted-foreground">{t("finance.invoices.balance", { amount: f.money(reconciliation.insurerOutstanding) })}</span></TableCell>
                  <TableCell className="text-right font-medium tabular text-success">{f.money(reconciliation.amountPaid)}</TableCell>
                  <TableCell className="text-right font-medium tabular text-danger">{f.money(reconciliation.outstanding)}</TableCell>
                  <TableCell><Badge variant={invoice.status === "PAGA" ? "success" : invoice.status === "PARCIAL" ? "warning" : invoice.status === "ANULADA" ? "neutral" : "info"}>{invoiceStatusLabel(invoice.status)}</Badge></TableCell>
                  <TableCell>{reconciled ? <span className="inline-flex items-center gap-1 text-xs font-medium text-success"><CheckCircle2 className="size-3.5" /> {t("finance.invoices.reconciled")}</span> : <span className="inline-flex items-center gap-1 text-xs font-medium text-warning"><AlertTriangle className="size-3.5" /> {t("finance.invoices.divergent")}</span>}</TableCell>
                  <TableCell><div className="flex justify-end gap-1.5">{invoice.payments[0] && <Link href={`/financeiro/recibos/${invoice.payments[0].id}`} target="_blank" className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-2 hover:text-foreground" title={t("finance.invoices.openLastReceipt")}><ExternalLink className="size-4" /></Link>}{can(user.role, "finance.manage") && reconciliation.outstanding > 0 && invoice.status !== "ANULADA" && <InvoicePaymentButton invoiceId={invoice.id} invoiceNumber={invoice.number} patientOutstanding={reconciliation.patientOutstanding} insurerOutstanding={reconciliation.insurerOutstanding} />}</div></TableCell>
                </TableRow>
              ))}
              {invoiceRows.length === 0 && <TableRow><TableCell colSpan={9} className="py-8 text-center text-sm text-muted-foreground">{t("finance.invoices.empty")}</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{t("finance.insurers.title")}</CardTitle><CardDescription>{t("finance.insurers.description")}</CardDescription></CardHeader>
        <CardContent className="pt-0">
          <Table><TableHeader><TableRow><TableHead>{t("finance.insurers.columns.insurer")}</TableHead><TableHead className="text-right">{t("finance.insurers.columns.invoices")}</TableHead><TableHead className="text-right">{t("finance.insurers.columns.billed")}</TableHead><TableHead className="text-right">{t("finance.insurers.columns.received")}</TableHead><TableHead className="text-right">{t("finance.insurers.columns.outstanding")}</TableHead></TableRow></TableHeader><TableBody>
            {insurerAccounts.map((account) => <TableRow key={account.id}><TableCell className="font-medium">{account.name}</TableCell><TableCell className="text-right tabular">{account.invoices}</TableCell><TableCell className="text-right tabular">{f.money(account.billed)}</TableCell><TableCell className="text-right tabular text-success">{f.money(account.paid)}</TableCell><TableCell className="text-right font-medium tabular text-danger">{f.money(account.outstanding)}</TableCell></TableRow>)}
            {insurerAccounts.length === 0 && <TableRow><TableCell colSpan={5} className="py-6 text-center text-sm text-muted-foreground">{t("finance.insurers.empty")}</TableCell></TableRow>}
          </TableBody></Table>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <Card>
          <CardHeader><CardTitle>{t("finance.byMethod.title")}</CardTitle><CardDescription>{t("finance.byMethod.description")}</CardDescription></CardHeader>
          <CardContent className="pt-0">
            {d.byPaymentMethod.length ? <BarList data={d.byPaymentMethod} /> : <p className="text-sm text-muted-foreground">{t("finance.byMethod.empty")}</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>{t("finance.recentRevenue.title")}</CardTitle></CardHeader>
          <CardContent className="pt-0">
            <Table>
              <TableHeader><TableRow><TableHead>{t("finance.columns.date")}</TableHead><TableHead>{t("finance.columns.description")}</TableHead><TableHead>{t("finance.columns.patient")}</TableHead><TableHead className="text-right">{t("finance.columns.amount")}</TableHead></TableRow></TableHeader>
              <TableBody>
                {d.recentRev.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-[13px] text-muted-foreground">{f.date(r.recognisedAt)}</TableCell>
                    <TableCell className="text-[13px]">{r.description}</TableCell>
                    <TableCell className="text-[13px] text-muted-foreground">{r.patient?.name ?? "—"}</TableCell>
                    <TableCell className="text-right font-medium tabular text-success">{f.money(r.amount)}</TableCell>
                  </TableRow>
                ))}
                {d.recentRev.length === 0 && <TableRow><TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">{t("finance.recentRevenue.empty")}</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>{t("finance.recentExpenses.title")}</CardTitle></CardHeader>
        <CardContent className="pt-0">
          <Table>
            <TableHeader><TableRow><TableHead>{t("finance.columns.date")}</TableHead><TableHead>{t("finance.columns.category")}</TableHead><TableHead>{t("finance.columns.description")}</TableHead><TableHead>{t("finance.columns.status")}</TableHead><TableHead className="text-right">{t("finance.columns.amount")}</TableHead>{can(user.role, "finance.manage") && <TableHead className="text-right">{t("finance.actions")}</TableHead>}</TableRow></TableHeader>
            <TableBody>
              {d.recentExp.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="text-[13px] text-muted-foreground">{f.date(e.incurredAt)}</TableCell>
                  <TableCell className="text-[13px]">{e.category?.name ?? "—"}</TableCell>
                  <TableCell className="text-[13px] text-muted-foreground">{e.description}</TableCell>
                  <TableCell><Badge variant={e.status === "PAGA" ? "success" : e.status === "PENDENTE" ? "warning" : "neutral"}>{expenseStatusLabel(e.status)}</Badge></TableCell>
                  <TableCell className="text-right font-medium tabular text-danger">{f.money(e.amount)}</TableCell>
                  {can(user.role, "finance.manage") && (
                    <TableCell className="text-right">
                      <TableRecordCrudCell
                        id={e.id}
                        title={t("finance.expense.edit")}
                        description={t("finance.expense.editDescription")}
                        fields={[
                          { name: "description", label: t("finance.expense.fields.description"), required: true, defaultValue: e.description },
                          { name: "categoryId", label: t("finance.expense.fields.category"), type: "select", defaultValue: e.categoryId ?? "", options: expenseCategories.map((c) => ({ value: c.id, label: c.name })) },
                          { name: "amount", label: t("finance.expense.fields.amount"), type: "money", required: true, defaultValue: String(e.amount), suffix: f.currency },
                          { name: "status", label: t("finance.expense.fields.status"), type: "select", defaultValue: e.status, options: expenseStatusOptions },
                          { name: "method", label: t("finance.expense.fields.method"), type: "select", defaultValue: e.method ?? "", options: methodOptions },
                          { name: "incurredAt", label: t("finance.expense.fields.date"), type: "date", defaultValue: e.incurredAt ? new Date(e.incurredAt).toISOString().slice(0, 10) : "" },
                        ]}
                        updateAction={updateExpenseRecord}
                        deleteAction={deleteExpenseRecord}
                      />
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {d.recentExp.length === 0 && <TableRow><TableCell colSpan={can(user.role, "finance.manage") ? 6 : 5} className="py-8 text-center text-sm text-muted-foreground">{t("finance.recentExpenses.empty")}</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      </DataViewTabs>
    </>
  );
}
