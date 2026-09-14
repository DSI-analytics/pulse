import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { CadastroButton } from "@/components/cadastro-form";
import { TableRecordCrudCell } from "@/components/table-record-crud-cell";
import { NovaCompra } from "@/components/nova-compra";
import { createSupplierRecord, deleteSupplierRecord, updateSupplierRecord } from "@/server/crud-actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ListFilters } from "@/components/list-filters";
import type { PaymentTermsStatus, PurchaseStatus } from "@prisma/client";
import { getFormatters, getTranslator } from "@/i18n/server";

const PURCHASE_STATUSES = ["ENCOMENDADA", "RECEBIDA", "PARCIAL", "CANCELADA"] as const satisfies readonly PurchaseStatus[];
const PAYMENT_STATUSES = ["PENDENTE", "PARCIAL", "PAGO"] as const satisfies readonly PaymentTermsStatus[];

function pick<T extends string>(list: readonly T[], value: string | undefined): T | undefined {
  return list.includes(value as T) ? (value as T) : undefined;
}

export async function generateMetadata() {
  const t = await getTranslator();
  return { title: t("suppliers.title") };
}

export default async function FornecedoresPage({ searchParams }: { searchParams: Promise<{ q?: string; categoria?: string; divida?: string; compra?: string; pagamento?: string }> }) {
  const user = await requirePermission("supplier.view");
  const [t, f] = await Promise.all([getTranslator(), getFormatters()]);
  const sp = await searchParams;
  const query = (sp.q ?? "").trim();
  const purchaseStatus = pick(PURCHASE_STATUSES, sp.compra);
  const paymentStatus = pick(PAYMENT_STATUSES, sp.pagamento);
  const [suppliers, purchases, categoryRows] = await Promise.all([
    prisma.supplier.findMany({
      where: {
        clinicId: user.clinicId,
        ...(query ? { OR: [
          { name: { contains: query, mode: "insensitive" } },
          { email: { contains: query, mode: "insensitive" } },
          { phone: { contains: query } },
        ] } : {}),
        ...(sp.categoria ? { category: sp.categoria } : {}),
      },
      orderBy: { name: "asc" },
      include: {
        purchases: { select: { total: true, orderedAt: true, paymentStatus: true } },
        _count: { select: { inventoryItems: true } },
      },
    }),
    prisma.purchase.findMany({
      where: {
        clinicId: user.clinicId,
        ...(query ? { OR: [
          { invoiceNumber: { contains: query, mode: "insensitive" } },
          { supplier: { name: { contains: query, mode: "insensitive" } } },
        ] } : {}),
        ...(purchaseStatus ? { status: purchaseStatus } : {}),
        ...(paymentStatus ? { paymentStatus } : {}),
        ...(sp.categoria ? { supplier: { category: sp.categoria } } : {}),
      },
      orderBy: { orderedAt: "desc" },
      take: 10,
      select: {
        id: true, invoiceNumber: true, total: true, status: true, paymentStatus: true, orderedAt: true,
        supplier: { select: { name: true } },
        _count: { select: { items: true } },
      },
    }),
    prisma.supplier.findMany({ where: { clinicId: user.clinicId, category: { not: null } }, distinct: ["category"], orderBy: { category: "asc" }, select: { category: true } }),
  ]);

  const rows = suppliers.map((s) => {
    const totalPurchased = s.purchases.reduce((a, p) => a + p.total, 0);
    const outstanding = s.purchases.filter((p) => p.paymentStatus !== "PAGO").reduce((a, p) => a + p.total, 0);
    const last = s.purchases.map((p) => p.orderedAt).sort((a, b) => b.getTime() - a.getTime())[0];
    return { s, totalPurchased, outstanding, last, orders: s.purchases.length };
  }).filter((row) => sp.divida !== "sim" || row.outstanding > 0);

  return (
    <>
      <PageHeader
        eyebrow={t("suppliers.eyebrow")}
        title={t("suppliers.title")}
        description={t("suppliers.count", { count: rows.length })}
        actions={
          can(user.role, "supplier.manage") ? (
            <>
            <NovaCompra />
            <CadastroButton
              variant="secondary"
              label={t("suppliers.new")}
              title={t("suppliers.new")}
              action={createSupplierRecord}
              fields={[
                { name: "name", label: t("suppliers.fields.name"), required: true, full: true },
                { name: "category", label: t("suppliers.fields.category"), placeholder: t("suppliers.fields.categoryPlaceholder") },
                { name: "contactName", label: t("suppliers.fields.contactName") },
                { name: "phone", label: t("suppliers.fields.phone"), type: "tel" },
                { name: "email", label: t("suppliers.fields.email"), type: "email" },
                { name: "paymentTerms", label: t("suppliers.fields.paymentTerms"), placeholder: t("suppliers.fields.paymentTermsPlaceholder") },
              ]}
            />
            </>
          ) : undefined
        }
      />
      <ListFilters action="/fornecedores" fields={[
        { name: "q", label: t("suppliers.filters.search"), value: query, type: "search", placeholder: t("suppliers.filters.searchPlaceholder") },
        { name: "categoria", label: t("suppliers.filters.category"), value: sp.categoria, options: categoryRows.flatMap(({ category }) => category ? [{ value: category, label: category }] : []) },
        { name: "divida", label: t("suppliers.filters.debt"), value: sp.divida, options: [{ value: "sim", label: t("suppliers.filters.withDebt") }] },
        { name: "compra", label: t("suppliers.filters.purchaseStatus"), value: purchaseStatus, options: PURCHASE_STATUSES.map((value) => ({ value, label: t(`suppliers.filterOptions.purchaseStatus.${value}`) })) },
        { name: "pagamento", label: t("suppliers.filters.payment"), value: paymentStatus, options: PAYMENT_STATUSES.map((value) => ({ value, label: t(`suppliers.filterOptions.paymentStatus.${value}`) })) },
      ]} />
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("suppliers.columns.supplier")}</TableHead>
                <TableHead>{t("suppliers.columns.category")}</TableHead>
                <TableHead>{t("suppliers.columns.contact")}</TableHead>
                <TableHead className="text-right">{t("suppliers.columns.purchases")}</TableHead>
                <TableHead className="text-right">{t("suppliers.columns.totalPurchased")}</TableHead>
                <TableHead className="text-right">{t("suppliers.columns.outstanding")}</TableHead>
                <TableHead>{t("suppliers.columns.lastPurchase")}</TableHead>
                {can(user.role, "supplier.manage") && <TableHead className="text-right">{t("suppliers.actions")}</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ s, totalPurchased, outstanding, last, orders }) => (
                <TableRow key={s.id}>
                  <TableCell>
                    <p className="font-medium">{s.name}</p>
                    <p className="text-[12px] text-muted-foreground">{s.paymentTerms ?? ""}</p>
                  </TableCell>
                  <TableCell><Badge variant="neutral">{s.category ?? "—"}</Badge></TableCell>
                  <TableCell className="text-[13px] text-muted-foreground">{s.phone ?? s.email ?? "—"}</TableCell>
                  <TableCell className="text-right tabular">{orders}</TableCell>
                  <TableCell className="text-right tabular">{f.money(totalPurchased)}</TableCell>
                  <TableCell className="text-right tabular">
                    {outstanding > 0 ? <span className="font-medium text-danger">{f.money(outstanding)}</span> : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-[13px] text-muted-foreground">{last ? f.date(last) : "—"}</TableCell>
                  {can(user.role, "supplier.manage") && (
                    <TableCell className="text-right">
                      <TableRecordCrudCell
                        id={s.id}
                        title={t("suppliers.edit")}
                        description={t("suppliers.editDescription")}
                        fields={[
                          { name: "name", label: t("suppliers.fields.name"), required: true, defaultValue: s.name },
                          { name: "category", label: t("suppliers.fields.category"), defaultValue: s.category ?? "" },
                          { name: "contactName", label: t("suppliers.fields.contactName"), defaultValue: s.contactName ?? "" },
                          { name: "phone", label: t("suppliers.fields.phone"), type: "tel", defaultValue: s.phone ?? "" },
                          { name: "email", label: t("suppliers.fields.email"), type: "email", defaultValue: s.email ?? "" },
                          { name: "paymentTerms", label: t("suppliers.fields.paymentTerms"), defaultValue: s.paymentTerms ?? "" },
                        ]}
                        updateAction={updateSupplierRecord}
                        deleteAction={deleteSupplierRecord}
                      />
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {rows.length === 0 && <TableRow><TableCell colSpan={can(user.role, "supplier.manage") ? 8 : 7} className="py-8 text-center text-sm text-muted-foreground">{t("suppliers.empty")}</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle>{t("suppliers.purchases.title")}</CardTitle></CardHeader>
        <CardContent className="pt-0">
          {purchases.length === 0 ? (
            <p className="py-3 text-sm text-muted-foreground">
              {t("suppliers.purchases.empty")}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("suppliers.purchases.columns.date")}</TableHead>
                  <TableHead>{t("suppliers.purchases.columns.supplier")}</TableHead>
                  <TableHead>{t("suppliers.purchases.columns.invoice")}</TableHead>
                  <TableHead className="text-right">{t("suppliers.purchases.columns.items")}</TableHead>
                  <TableHead>{t("suppliers.purchases.columns.status")}</TableHead>
                  <TableHead>{t("suppliers.purchases.columns.payment")}</TableHead>
                  <TableHead className="text-right">{t("suppliers.purchases.columns.total")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {purchases.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="text-[13px] text-muted-foreground">{f.date(p.orderedAt)}</TableCell>
                    <TableCell className="font-medium">{p.supplier.name}</TableCell>
                    <TableCell className="font-mono text-[12px] text-muted-foreground">{p.invoiceNumber ?? "—"}</TableCell>
                    <TableCell className="text-right tabular">{p._count.items}</TableCell>
                    <TableCell>
                      <Badge variant={p.status === "RECEBIDA" ? "success" : p.status === "CANCELADA" ? "neutral" : "warning"}>
                        {p.status === "RECEBIDA" ? t("suppliers.purchaseStatus.RECEBIDA") : p.status === "ENCOMENDADA" ? t("suppliers.purchaseStatus.ENCOMENDADA") : p.status === "PARCIAL" ? t("suppliers.purchaseStatus.PARCIAL") : t("suppliers.purchaseStatus.CANCELADA")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={p.paymentStatus === "PAGO" ? "success" : "warning"}>
                        {p.paymentStatus === "PAGO" ? t("suppliers.paymentStatus.PAGO") : p.paymentStatus === "PARCIAL" ? t("suppliers.paymentStatus.PARCIAL") : t("suppliers.paymentStatus.PENDENTE")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium tabular">{f.money(p.total)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
