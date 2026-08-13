import { AlertTriangle, PackageX, CalendarClock, Package } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatMZN } from "@/lib/money";
import { formatDateShort } from "@/lib/datetime";

function daysUntil(date: Date | null): number | null {
  if (!date) return null;
  return Math.round((date.getTime() - Date.now()) / 86400000);
}

export default async function StockPage() {
  const user = await requirePermission("inventory.view");
  const items = await prisma.inventoryItem.findMany({
    where: { clinicId: user.clinicId },
    orderBy: { name: "asc" },
    include: { category: { select: { name: true } }, supplier: { select: { name: true } } },
  });

  const alerts: { icon: any; tone: "danger" | "warning"; text: string }[] = [];
  for (const i of items) {
    const dLeft = i.avgDailyConsumption > 0 ? Math.round(i.currentStock / i.avgDailyConsumption) : null;
    if (i.currentStock === 0) alerts.push({ icon: PackageX, tone: "danger", text: `${i.name} esgotado.` });
    else if (i.currentStock < i.minStock)
      alerts.push({ icon: AlertTriangle, tone: "warning", text: `${i.name} abaixo do stock mínimo (${i.currentStock}/${i.minStock}).` });
    const exp = daysUntil(i.expiryDate);
    if (exp !== null && exp <= 30)
      alerts.push({ icon: CalendarClock, tone: exp <= 15 ? "danger" : "warning", text: `${i.name} expira em ${exp} dias.` });
    if (dLeft !== null && dLeft <= 8 && i.currentStock > 0)
      alerts.push({ icon: AlertTriangle, tone: "warning", text: `Stock de ${i.name} deverá terminar em ~${dLeft} dias ao ritmo atual.` });
  }

  return (
    <>
      <PageHeader eyebrow="Gestão" title="Stock" description={`${items.length} artigos · materiais clínicos e operacionais`} />

      {alerts.length > 0 && (
        <Card className="border-warning/30 bg-warning-muted/30">
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-warning"><AlertTriangle className="size-4" /> Alertas de stock ({alerts.length})</CardTitle></CardHeader>
          <CardContent className="pt-0">
            <ul className="grid gap-1.5 sm:grid-cols-2">
              {alerts.slice(0, 8).map((a, i) => (
                <li key={i} className="flex items-center gap-2 text-[13px]">
                  <a.icon className={a.tone === "danger" ? "size-3.5 text-danger" : "size-3.5 text-warning"} />
                  <span>{a.text}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Artigo</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead className="text-right">Stock</TableHead>
                <TableHead className="text-right">Mínimo</TableHead>
                <TableHead className="text-right">Custo unit.</TableHead>
                <TableHead>Validade</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((i) => {
                const exp = daysUntil(i.expiryDate);
                const status =
                  i.currentStock === 0
                    ? { label: "Esgotado", variant: "danger" as const }
                    : i.currentStock < i.minStock
                      ? { label: "Baixo", variant: "warning" as const }
                      : exp !== null && exp <= 30
                        ? { label: "Expira", variant: "warning" as const }
                        : { label: "OK", variant: "success" as const };
                return (
                  <TableRow key={i.id}>
                    <TableCell className="font-medium">{i.name}</TableCell>
                    <TableCell className="font-mono text-[12px] text-muted-foreground">{i.sku}</TableCell>
                    <TableCell className="text-[13px] text-muted-foreground">{i.category?.name ?? "—"}</TableCell>
                    <TableCell className="text-right tabular">{i.currentStock} {i.unit}</TableCell>
                    <TableCell className="text-right tabular text-muted-foreground">{i.minStock}</TableCell>
                    <TableCell className="text-right tabular">{formatMZN(i.avgCost)}</TableCell>
                    <TableCell className="text-[13px] text-muted-foreground">{i.expiryDate ? formatDateShort(i.expiryDate) : "—"}</TableCell>
                    <TableCell><Badge variant={status.variant}>{status.label}</Badge></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
