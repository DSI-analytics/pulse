"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Check, Loader2, PackagePlus } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/toast";
import { getInventoryContext, createPurchase, type InventoryContext } from "@/server/inventory-actions";
import { parseMoneyInput } from "@/lib/format";
import { useFormat, useT } from "@/i18n/client";

interface Line {
  itemId: string;
  quantity: string;
  unitCost: string;
}

const emptyLine = (): Line => ({ itemId: "", quantity: "1", unitCost: "" });

export function NovaCompra() {
  const t = useT();
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <PackagePlus className="size-4" /> {t("suppliers.newPurchase.button")}
      </Button>
      {open && <NovaCompraDialog onClose={() => setOpen(false)} />}
    </>
  );
}

function NovaCompraDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const t = useT();
  const f = useFormat();
  const [ctx, setCtx] = React.useState<InventoryContext | null>(null);
  const [supplierId, setSupplierId] = React.useState("");
  const [invoiceNumber, setInvoiceNumber] = React.useState("");
  const [dueAt, setDueAt] = React.useState("");
  const [received, setReceived] = React.useState(true);
  const [paid, setPaid] = React.useState(false);
  const [lines, setLines] = React.useState<Line[]>([emptyLine()]);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    getInventoryContext().then(setCtx);
  }, []);

  function updateLine(i: number, patch: Partial<Line>) {
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  const total = lines.reduce(
    (sum, l) => sum + (Number.parseInt(l.quantity || "0", 10) || 0) * (parseMoneyInput(l.unitCost || "0") ?? 0),
    0,
  );

  async function submit() {
    setError(null);
    if (!supplierId) return setError(t("suppliers.newPurchase.errors.supplierRequired"));
    const chosen = lines.filter((l) => l.itemId);
    if (chosen.some((l) => parseMoneyInput(l.unitCost || "0") === null)) {
      return setError(t("suppliers.newPurchase.errors.invalidUnitCost"));
    }
    const items = chosen.map((l) => ({
      itemId: l.itemId,
      quantity: Number.parseInt(l.quantity || "0", 10) || 0,
      unitCost: parseMoneyInput(l.unitCost || "0") ?? 0,
    }));
    if (items.length === 0) return setError(t("suppliers.newPurchase.errors.itemsRequired"));
    if (items.some((i) => i.quantity <= 0)) return setError(t("suppliers.newPurchase.errors.quantitiesPositive"));

    setSaving(true);
    const res = await createPurchase({ supplierId, invoiceNumber, dueAt: dueAt || undefined, received, paid, items });
    setSaving(false);
    if ("error" in res && res.error) return setError(res.error);
    toast(received ? t("suppliers.newPurchase.toastReceived") : t("suppliers.newPurchase.toastOrdered"));
    router.refresh();
    onClose();
  }

  return (
    <Modal
      open
      onClose={onClose}
      className="max-w-2xl"
      title={t("suppliers.newPurchase.title")}
      description={t("suppliers.newPurchase.description")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t("common.cancel")}</Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} {t("suppliers.newPurchase.save")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>{t("suppliers.newPurchase.supplier")} <span className="text-danger">*</span></Label>
            <Select className="mt-1.5" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">{t("suppliers.newPurchase.select")}</option>
              {ctx?.suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label>{t("suppliers.newPurchase.invoiceNumber")}</Label>
            <Input className="mt-1.5" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="FT-1234" />
          </div>
        </div>

        {/* Lines */}
        <div>
          <Label>{t("suppliers.newPurchase.items")}</Label>
          <div className="mt-1.5 space-y-2">
            {lines.map((l, i) => {
              const item = ctx?.items.find((x) => x.id === l.itemId);
              return (
                <div key={i} className="grid grid-cols-[1fr_5rem_7rem_auto] items-center gap-2">
                  <Select value={l.itemId} onChange={(e) => {
                    const chosen = ctx?.items.find((x) => x.id === e.target.value);
                    updateLine(i, {
                      itemId: e.target.value,
                      unitCost: l.unitCost || (chosen ? String(chosen.lastCost / 100) : ""),
                    });
                  }}>
                    <option value="">{t("suppliers.newPurchase.selectItem")}</option>
                    {ctx?.items.map((it) => (
                      <option key={it.id} value={it.id}>{it.name} ({it.sku})</option>
                    ))}
                  </Select>
                  <Input
                    inputMode="numeric"
                    value={l.quantity}
                    onChange={(e) => updateLine(i, { quantity: e.target.value })}
                    placeholder={t("suppliers.newPurchase.quantityPlaceholder")}
                    title={item ? t("suppliers.newPurchase.currentStock", { stock: item.currentStock, unit: item.unit }) : t("suppliers.newPurchase.quantity")}
                  />
                  <Input
                    inputMode="decimal"
                    value={l.unitCost}
                    onChange={(e) => updateLine(i, { unitCost: e.target.value })}
                    placeholder={t("suppliers.newPurchase.unitCostPlaceholder")}
                  />
                  <button
                    type="button"
                    onClick={() => setLines((ls) => (ls.length === 1 ? [emptyLine()] : ls.filter((_, idx) => idx !== i)))}
                    className="rounded-md p-2 text-muted-foreground hover:bg-surface-2 hover:text-danger"
                    aria-label={t("suppliers.newPurchase.removeItem")}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              );
            })}
          </div>
          <Button variant="ghost" size="sm" className="mt-2" onClick={() => setLines((ls) => [...ls, emptyLine()])}>
            <Plus className="size-4" /> {t("suppliers.newPurchase.addItem")}
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>{t("suppliers.newPurchase.dueDate")}</Label>
            <Input type="date" className="mt-1.5" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
          </div>
          <div className="flex items-end gap-4 pb-1.5">
            <label className="flex items-center gap-2 text-[13px] font-medium">
              <input type="checkbox" checked={received} onChange={(e) => setReceived(e.target.checked)} className="size-4 accent-[var(--primary)]" />
              {t("suppliers.newPurchase.received")}
            </label>
            <label className="flex items-center gap-2 text-[13px] font-medium">
              <input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} className="size-4 accent-[var(--primary)]" />
              {t("suppliers.newPurchase.paid")}
            </label>
          </div>
        </div>

        <div className="flex items-center justify-between rounded-md bg-surface-2 px-3 py-2">
          <span className="text-sm text-muted-foreground">{t("suppliers.newPurchase.total")}</span>
          <span className="font-display text-lg font-semibold tabular">{f.money(total)}</span>
        </div>

        {error && <p className="rounded-md bg-danger-muted px-3 py-2 text-[13px] font-medium text-danger">{error}</p>}
      </div>
    </Modal>
  );
}
