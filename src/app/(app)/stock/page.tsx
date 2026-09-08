import { AlertTriangle, PackageX, CalendarClock } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { CadastroButton } from "@/components/cadastro-form";
import { TableRecordCrudCell } from "@/components/table-record-crud-cell";
import { createInventoryItemRecord, deleteInventoryItemRecord, updateInventoryItemRecord } from "@/server/crud-actions";
import { MovimentoStock } from "@/components/movimento-stock";
import { formatDateTimePt } from "@/lib/datetime";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatMZN } from "@/lib/money";
import { formatDateShort } from "@/lib/datetime";
import { ListFilters } from "@/components/list-filters";

function daysUntil(date: Date | null): number | null {
  if (!date) return null;
  return Math.round((date.getTime() - Date.now()) / 86400000);
}

export default async function StockPage({ searchParams }: { searchParams: Promise<{ q?: string; categoria?: string; estado?: string }> }) {
  const user = await requirePermission("inventory.view");
  const sp = await searchParams;
  const query = (sp.q ?? "").trim().toLocaleLowerCase("pt");
  const [allItems, categories, movements] = await Promise.all([
    prisma.inventoryItem.findMany({
      where: { clinicId: user.clinicId },
      orderBy: { name: "asc" },
      include: { category: { select: { name: true } }, supplier: { select: { name: true } } },
    }),
    prisma.inventoryCategory.findMany({ where: { clinicId: user.clinicId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.inventoryMovement.findMany({
      where: { clinicId: user.clinicId },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true, type: true, quantity: true, reason: true, createdAt: true,
        item: { select: { name: true, unit: true } },
      },
    }),
  ]);
  const items = allItems.filter((item) => {
    const expiry = daysUntil(item.expiryDate);
    const status = item.currentStock === 0 ? "esgotado" : item.currentStock < item.minStock ? "baixo" : expiry !== null && expiry <= 30 ? "expira" : "ok";
    return (!query || item.name.toLocaleLowerCase("pt").includes(query) || item.sku.toLocaleLowerCase("pt").includes(query))
      && (!sp.categoria || item.categoryId === sp.categoria)
      && (!sp.estado || status === sp.estado);
  });
  const canManage = can(user.role, "inventory.manage");
  const stockOptions = allItems.map((i) => ({ id: i.id, name: i.name, unit: i.unit, currentStock: i.currentStock }));

  const alerts: { icon: LucideIcon; tone: "danger" | "warning"; text: string }[] = [];
  for (const i of allItems) {
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
      <PageHeader
        eyebrow="Gestão"
        title="Stock"
        description={`${allItems.length} artigos · materiais clínicos e operacionais`}
        actions={
          canManage ? (
            <>
            <MovimentoStock items={stockOptions} />
            <CadastroButton
              label="Novo artigo"
              title="Novo artigo de stock"
              action={createInventoryItemRecord}
              fields={[
                { name: "name", label: "Artigo", required: true, full: true, placeholder: "Ex.: Luvas de nitrilo tam. M" },
                { name: "sku", label: "SKU", required: true, placeholder: "LUV-M" },
                { name: "categoryId", label: "Categoria", type: "select", options: categories.map((c) => ({ value: c.id, label: c.name })) },
                { name: "unit", label: "Unidade", defaultValue: "un", placeholder: "caixa" },
                { name: "currentStock", label: "Stock atual", type: "number", defaultValue: "0" },
                { name: "minStock", label: "Stock mínimo", type: "number", defaultValue: "0" },
                { name: "purchasePrice", label: "Custo unitário", type: "money", suffix: "MZN", placeholder: "850" },
              ]}
            />
            </>
          ) : undefined
        }
      />

      <ListFilters action="/stock" fields={[
        { name: "q", label: "Pesquisar", value: sp.q?.trim(), type: "search", placeholder: "Artigo ou SKU…" },
        { name: "categoria", label: "Categoria", value: sp.categoria, options: categories.map((category) => ({ value: category.id, label: category.name })) },
        { name: "estado", label: "Estado", value: sp.estado, options: [{ value: "ok", label: "OK" }, { value: "baixo", label: "Stock baixo" }, { value: "esgotado", label: "Esgotado" }, { value: "expira", label: "A expirar" }] },
      ]} />

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
                {canManage && <TableHead className="text-right">Ações</TableHead>}
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
                    {canManage && (
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <TableRecordCrudCell
                            id={i.id}
                            title="Editar artigo"
                            description="Atualize o artigo do stock."
                            fields={[
                              { name: "name", label: "Artigo", required: true, defaultValue: i.name },
                              { name: "sku", label: "SKU", required: true, defaultValue: i.sku },
                              { name: "categoryId", label: "Categoria", type: "select", defaultValue: i.categoryId ?? "", options: categories.map((c) => ({ value: c.id, label: c.name })) },
                              { name: "unit", label: "Unidade", defaultValue: i.unit },
                              { name: "currentStock", label: "Stock atual", type: "number", defaultValue: String(i.currentStock) },
                              { name: "minStock", label: "Stock mínimo", type: "number", defaultValue: String(i.minStock) },
                              { name: "purchasePrice", label: "Custo unitário", type: "money", defaultValue: String(i.avgCost), suffix: "MZN" },
                            ]}
                            updateAction={updateInventoryItemRecord}
                            deleteAction={deleteInventoryItemRecord}
                          />
                          <MovimentoStock
                            items={stockOptions}
                            item={{ id: i.id, name: i.name, unit: i.unit, currentStock: i.currentStock }}
                          />
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
              {items.length === 0 && <TableRow><TableCell colSpan={canManage ? 9 : 8} className="py-8 text-center text-sm text-muted-foreground">Nenhum artigo corresponde aos filtros.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle>Movimentos recentes</CardTitle></CardHeader>
        <CardContent className="pt-0">
          {movements.length === 0 ? (
            <p className="py-3 text-sm text-muted-foreground">Ainda não há movimentos registados.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Artigo</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Quantidade</TableHead>
                  <TableHead>Motivo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movements.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="text-[13px] text-muted-foreground">{formatDateTimePt(m.createdAt)}</TableCell>
                    <TableCell className="font-medium">{m.item.name}</TableCell>
                    <TableCell>
                      <Badge variant={m.quantity >= 0 ? "success" : m.type === "PERDA" ? "danger" : "warning"}>
                        {MOVEMENT_LABEL[m.type]}
                      </Badge>
                    </TableCell>
                    <TableCell className={`text-right font-medium tabular ${m.quantity >= 0 ? "text-success" : "text-danger"}`}>
                      {m.quantity > 0 ? "+" : ""}{m.quantity} {m.item.unit}
                    </TableCell>
                    <TableCell className="text-[13px] text-muted-foreground">{m.reason ?? "—"}</TableCell>
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

const MOVEMENT_LABEL: Record<string, string> = {
  ENTRADA: "Entrada",
  SAIDA: "Saída",
  AJUSTE: "Ajuste",
  PERDA: "Perda",
};
