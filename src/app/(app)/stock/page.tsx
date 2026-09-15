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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ListFilters } from "@/components/list-filters";
import { getFormatters, getTranslator } from "@/i18n/server";
import { DataViewTabs } from "@/components/data-view-tabs";

function daysUntil(date: Date | null): number | null {
  if (!date) return null;
  return Math.round((date.getTime() - Date.now()) / 86400000);
}

export async function generateMetadata() {
  const t = await getTranslator();
  return { title: t("stock.title") };
}

export default async function StockPage({ searchParams }: { searchParams: Promise<{ q?: string; categoria?: string; estado?: string }> }) {
  const user = await requirePermission("inventory.view");
  const [t, f] = await Promise.all([getTranslator(), getFormatters()]);
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
    if (i.currentStock === 0) alerts.push({ icon: PackageX, tone: "danger", text: t("stock.alerts.outOfStock", { name: i.name }) });
    else if (i.currentStock < i.minStock)
      alerts.push({ icon: AlertTriangle, tone: "warning", text: t("stock.alerts.belowMin", { name: i.name, current: i.currentStock, min: i.minStock }) });
    const exp = daysUntil(i.expiryDate);
    if (exp !== null && exp <= 30)
      alerts.push({ icon: CalendarClock, tone: exp <= 15 ? "danger" : "warning", text: t("stock.alerts.expires", { name: i.name, days: exp }) });
    if (dLeft !== null && dLeft <= 8 && i.currentStock > 0)
      alerts.push({ icon: AlertTriangle, tone: "warning", text: t("stock.alerts.runningOut", { name: i.name, days: dLeft }) });
  }

  return (
    <>
      <PageHeader
        eyebrow={t("stock.eyebrow")}
        title={t("stock.title")}
        description={t("stock.description", { count: allItems.length })}
        actions={
          canManage ? (
            <>
            <MovimentoStock items={stockOptions} />
            <CadastroButton
              label={t("stock.newItem")}
              title={t("stock.newItemTitle")}
              action={createInventoryItemRecord}
              fields={[
                { name: "name", label: t("stock.fields.name"), required: true, full: true, placeholder: t("stock.fields.namePlaceholder") },
                { name: "sku", label: t("stock.fields.sku"), required: true, placeholder: "LUV-M" },
                { name: "categoryId", label: t("stock.fields.category"), type: "select", options: categories.map((c) => ({ value: c.id, label: c.name })) },
                { name: "unit", label: t("stock.fields.unit"), defaultValue: "un", placeholder: t("stock.fields.unitPlaceholder") },
                { name: "currentStock", label: t("stock.fields.currentStock"), type: "number", defaultValue: "0" },
                { name: "minStock", label: t("stock.fields.minStock"), type: "number", defaultValue: "0" },
                { name: "purchasePrice", label: t("stock.fields.unitCost"), type: "money", suffix: f.currency, placeholder: "850" },
              ]}
            />
            </>
          ) : undefined
        }
      />

      <ListFilters action="/stock" fields={[
        { name: "q", label: t("stock.filters.search"), value: sp.q?.trim(), type: "search", placeholder: t("stock.filters.searchPlaceholder") },
        { name: "categoria", label: t("stock.filters.category"), value: sp.categoria, options: categories.map((category) => ({ value: category.id, label: category.name })) },
        { name: "estado", label: t("stock.filters.status"), value: sp.estado, options: [{ value: "ok", label: t("stock.filters.ok") }, { value: "baixo", label: t("stock.filters.low") }, { value: "esgotado", label: t("stock.filters.out") }, { value: "expira", label: t("stock.filters.expiring") }] },
      ]} />

      {alerts.length > 0 && (
        <Card className="bg-warning-muted [--card-border:var(--warning-edge)]">
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-warning"><AlertTriangle className="size-4" /> {t("stock.alerts.title", { count: alerts.length })}</CardTitle></CardHeader>
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

      <DataViewTabs
        ariaLabel={t("stock.title")}
        tabs={[
          { id: "items", label: t("stock.title") },
          { id: "movements", label: t("stock.movements.title") },
        ]}
      >
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("stock.columns.item")}</TableHead>
                <TableHead>{t("stock.columns.sku")}</TableHead>
                <TableHead>{t("stock.columns.category")}</TableHead>
                <TableHead className="text-right">{t("stock.columns.stock")}</TableHead>
                <TableHead className="text-right">{t("stock.columns.min")}</TableHead>
                <TableHead className="text-right">{t("stock.columns.unitCost")}</TableHead>
                <TableHead>{t("stock.columns.expiry")}</TableHead>
                <TableHead>{t("stock.columns.status")}</TableHead>
                {canManage && <TableHead className="text-right">{t("stock.actions")}</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((i) => {
                const exp = daysUntil(i.expiryDate);
                const status =
                  i.currentStock === 0
                    ? { label: t("stock.status.out"), variant: "danger" as const }
                    : i.currentStock < i.minStock
                      ? { label: t("stock.status.low"), variant: "warning" as const }
                      : exp !== null && exp <= 30
                        ? { label: t("stock.status.expiring"), variant: "warning" as const }
                        : { label: t("stock.status.ok"), variant: "success" as const };
                return (
                  <TableRow key={i.id}>
                    <TableCell className="font-medium">{i.name}</TableCell>
                    <TableCell className="font-mono text-[12px] text-muted-foreground">{i.sku}</TableCell>
                    <TableCell className="text-[13px] text-muted-foreground">{i.category?.name ?? "—"}</TableCell>
                    <TableCell className="text-right tabular">{i.currentStock} {i.unit}</TableCell>
                    <TableCell className="text-right tabular text-muted-foreground">{i.minStock}</TableCell>
                    <TableCell className="text-right tabular">{f.money(i.avgCost)}</TableCell>
                    <TableCell className="text-[13px] text-muted-foreground">{i.expiryDate ? f.date(i.expiryDate) : "—"}</TableCell>
                    <TableCell><Badge variant={status.variant}>{status.label}</Badge></TableCell>
                    {canManage && (
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <TableRecordCrudCell
                            id={i.id}
                            title={t("stock.editItem")}
                            description={t("stock.editItemDescription")}
                            fields={[
                              { name: "name", label: t("stock.fields.name"), required: true, defaultValue: i.name },
                              { name: "sku", label: t("stock.fields.sku"), required: true, defaultValue: i.sku },
                              { name: "categoryId", label: t("stock.fields.category"), type: "select", defaultValue: i.categoryId ?? "", options: categories.map((c) => ({ value: c.id, label: c.name })) },
                              { name: "unit", label: t("stock.fields.unit"), defaultValue: i.unit },
                              { name: "currentStock", label: t("stock.fields.currentStock"), type: "number", defaultValue: String(i.currentStock) },
                              { name: "minStock", label: t("stock.fields.minStock"), type: "number", defaultValue: String(i.minStock) },
                              { name: "purchasePrice", label: t("stock.fields.unitCost"), type: "money", defaultValue: String(i.avgCost), suffix: f.currency },
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
              {items.length === 0 && <TableRow><TableCell colSpan={canManage ? 9 : 8} className="py-8 text-center text-sm text-muted-foreground">{t("stock.empty")}</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle>{t("stock.movements.title")}</CardTitle></CardHeader>
        <CardContent className="pt-0">
          {movements.length === 0 ? (
            <p className="py-3 text-sm text-muted-foreground">{t("stock.movements.empty")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("stock.movements.columns.date")}</TableHead>
                  <TableHead>{t("stock.movements.columns.item")}</TableHead>
                  <TableHead>{t("stock.movements.columns.type")}</TableHead>
                  <TableHead className="text-right">{t("stock.movements.columns.quantity")}</TableHead>
                  <TableHead>{t("stock.movements.columns.reason")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movements.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="text-[13px] text-muted-foreground">{f.dateTime(m.createdAt)}</TableCell>
                    <TableCell className="font-medium">{m.item.name}</TableCell>
                    <TableCell>
                      <Badge variant={m.quantity >= 0 ? "success" : m.type === "PERDA" ? "danger" : "warning"}>
                        {t(`stock.movementType.${m.type}`)}
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
      </DataViewTabs>
    </>
  );
}
