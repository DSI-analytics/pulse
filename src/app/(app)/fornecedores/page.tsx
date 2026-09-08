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
import { formatMZN } from "@/lib/money";
import { formatDateShort } from "@/lib/datetime";
import { ListFilters } from "@/components/list-filters";
import type { PaymentTermsStatus, PurchaseStatus } from "@prisma/client";

const PURCHASE_STATUSES: PurchaseStatus[] = ["ENCOMENDADA", "RECEBIDA", "PARCIAL", "CANCELADA"];
const PAYMENT_STATUSES: PaymentTermsStatus[] = ["PENDENTE", "PARCIAL", "PAGO"];

export default async function FornecedoresPage({ searchParams }: { searchParams: Promise<{ q?: string; categoria?: string; divida?: string; compra?: string; pagamento?: string }> }) {
  const user = await requirePermission("supplier.view");
  const sp = await searchParams;
  const query = (sp.q ?? "").trim();
  const purchaseStatus = PURCHASE_STATUSES.includes(sp.compra as PurchaseStatus) ? sp.compra as PurchaseStatus : undefined;
  const paymentStatus = PAYMENT_STATUSES.includes(sp.pagamento as PaymentTermsStatus) ? sp.pagamento as PaymentTermsStatus : undefined;
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
        eyebrow="Gestão"
        title="Fornecedores"
        description={`${rows.length} fornecedores`}
        actions={
          can(user.role, "supplier.manage") ? (
            <>
            <NovaCompra />
            <CadastroButton
              variant="secondary"
              label="Novo fornecedor"
              title="Novo fornecedor"
              action={createSupplierRecord}
              fields={[
                { name: "name", label: "Nome", required: true, full: true },
                { name: "category", label: "Categoria", placeholder: "Ex.: Medicamentos" },
                { name: "contactName", label: "Pessoa de contacto" },
                { name: "phone", label: "Telefone", type: "tel" },
                { name: "email", label: "Email", type: "email" },
                { name: "paymentTerms", label: "Condições de pagamento", placeholder: "30 dias" },
              ]}
            />
            </>
          ) : undefined
        }
      />
      <ListFilters action="/fornecedores" fields={[
        { name: "q", label: "Pesquisar", value: query, type: "search", placeholder: "Fornecedor, contacto ou factura…" },
        { name: "categoria", label: "Categoria", value: sp.categoria, options: categoryRows.flatMap(({ category }) => category ? [{ value: category, label: category }] : []) },
        { name: "divida", label: "Dívida", value: sp.divida, options: [{ value: "sim", label: "Com dívida" }] },
        { name: "compra", label: "Estado da compra", value: purchaseStatus, options: PURCHASE_STATUSES.map((value) => ({ value, label: value.replaceAll("_", " ") })) },
        { name: "pagamento", label: "Pagamento", value: paymentStatus, options: PAYMENT_STATUSES.map((value) => ({ value, label: value })) },
      ]} />
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fornecedor</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Contacto</TableHead>
                <TableHead className="text-right">Compras</TableHead>
                <TableHead className="text-right">Total comprado</TableHead>
                <TableHead className="text-right">Em dívida</TableHead>
                <TableHead>Última compra</TableHead>
                {can(user.role, "supplier.manage") && <TableHead className="text-right">Ações</TableHead>}
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
                  <TableCell className="text-right tabular">{formatMZN(totalPurchased)}</TableCell>
                  <TableCell className="text-right tabular">
                    {outstanding > 0 ? <span className="font-medium text-danger">{formatMZN(outstanding)}</span> : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-[13px] text-muted-foreground">{last ? formatDateShort(last) : "—"}</TableCell>
                  {can(user.role, "supplier.manage") && (
                    <TableCell className="text-right">
                      <TableRecordCrudCell
                        id={s.id}
                        title="Editar fornecedor"
                        description="Atualize os dados do fornecedor."
                        fields={[
                          { name: "name", label: "Nome", required: true, defaultValue: s.name },
                          { name: "category", label: "Categoria", defaultValue: s.category ?? "" },
                          { name: "contactName", label: "Pessoa de contacto", defaultValue: s.contactName ?? "" },
                          { name: "phone", label: "Telefone", type: "tel", defaultValue: s.phone ?? "" },
                          { name: "email", label: "Email", type: "email", defaultValue: s.email ?? "" },
                          { name: "paymentTerms", label: "Condições de pagamento", defaultValue: s.paymentTerms ?? "" },
                        ]}
                        updateAction={updateSupplierRecord}
                        deleteAction={deleteSupplierRecord}
                      />
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {rows.length === 0 && <TableRow><TableCell colSpan={can(user.role, "supplier.manage") ? 8 : 7} className="py-8 text-center text-sm text-muted-foreground">Nenhum fornecedor corresponde aos filtros.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle>Compras recentes</CardTitle></CardHeader>
        <CardContent className="pt-0">
          {purchases.length === 0 ? (
            <p className="py-3 text-sm text-muted-foreground">
              Ainda não há compras registadas. Use “Registar compra” para dar entrada de material no stock.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Fornecedor</TableHead>
                  <TableHead>Factura</TableHead>
                  <TableHead className="text-right">Artigos</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Pagamento</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {purchases.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="text-[13px] text-muted-foreground">{formatDateShort(p.orderedAt)}</TableCell>
                    <TableCell className="font-medium">{p.supplier.name}</TableCell>
                    <TableCell className="font-mono text-[12px] text-muted-foreground">{p.invoiceNumber ?? "—"}</TableCell>
                    <TableCell className="text-right tabular">{p._count.items}</TableCell>
                    <TableCell>
                      <Badge variant={p.status === "RECEBIDA" ? "success" : p.status === "CANCELADA" ? "neutral" : "warning"}>
                        {p.status === "RECEBIDA" ? "Recebida" : p.status === "ENCOMENDADA" ? "Encomendada" : p.status === "PARCIAL" ? "Parcial" : "Cancelada"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={p.paymentStatus === "PAGO" ? "success" : "warning"}>
                        {p.paymentStatus === "PAGO" ? "Pago" : p.paymentStatus === "PARCIAL" ? "Parcial" : "Pendente"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium tabular">{formatMZN(p.total)}</TableCell>
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
