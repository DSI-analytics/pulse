import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatMZN } from "@/lib/money";
import { formatDateShort } from "@/lib/datetime";

export default async function FornecedoresPage() {
  const user = await requirePermission("supplier.view");
  const suppliers = await prisma.supplier.findMany({
    where: { clinicId: user.clinicId },
    orderBy: { name: "asc" },
    include: {
      purchases: { select: { total: true, orderedAt: true, paymentStatus: true } },
      _count: { select: { inventoryItems: true } },
    },
  });

  const rows = suppliers.map((s) => {
    const totalPurchased = s.purchases.reduce((a, p) => a + p.total, 0);
    const outstanding = s.purchases.filter((p) => p.paymentStatus !== "PAGO").reduce((a, p) => a + p.total, 0);
    const last = s.purchases.map((p) => p.orderedAt).sort((a, b) => b.getTime() - a.getTime())[0];
    return { s, totalPurchased, outstanding, last, orders: s.purchases.length };
  });

  return (
    <>
      <PageHeader eyebrow="Gestão" title="Fornecedores" description={`${suppliers.length} fornecedores`} />
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
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
