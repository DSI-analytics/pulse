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

export default async function FornecedoresPage() {
  const user = await requirePermission("supplier.view");
  const [suppliers, purchases] = await Promise.all([
    prisma.supplier.findMany({
      where: { clinicId: user.clinicId },
      orderBy: { name: "asc" },
      include: {
        purchases: { select: { total: true, orderedAt: true, paymentStatus: true } },
        _count: { select: { inventoryItems: true } },
      },
    }),
    prisma.purchase.findMany({
      where: { clinicId: user.clinicId },
      orderBy: { orderedAt: "desc" },
      take: 10,
      select: {
        id: true, invoiceNumber: true, total: true, status: true, paymentStatus: true, orderedAt: true,
        supplier: { select: { name: true } },
        _count: { select: { items: true } },
      },
    }),
  ]);

  const rows = suppliers.map((s) => {
    const totalPurchased = s.purchases.reduce((a, p) => a + p.total, 0);
    const outstanding = s.purchases.filter((p) => p.paymentStatus !== "PAGO").reduce((a, p) => a + p.total, 0);
    const last = s.purchases.map((p) => p.orderedAt).sort((a, b) => b.getTime() - a.getTime())[0];
    return { s, totalPurchased, outstanding, last, orders: s.purchases.length };
  });

  return (
    <>
      <PageHeader
        eyebrow="Gestão"
        title="Fornecedores"
        description={`${suppliers.length} fornecedores`}
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
