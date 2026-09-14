"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftRight, Check, Minus } from "lucide-react";
import { ProcessingPulse } from "@/components/processing-pulse";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/toast";
import { registerStockMovement } from "@/server/inventory-actions";
import { useT } from "@/i18n/client";

export interface StockItemOption {
  id: string;
  name: string;
  unit: string;
  currentStock: number;
}

const TYPES = ["SAIDA", "ENTRADA", "AJUSTE", "PERDA"] as const;

/**
 * Registers a stock movement. Renders either the page-level button ("Registar
 * movimento") or a compact per-row button when `item` is given.
 */
export function MovimentoStock({
  items,
  item,
}: {
  items: StockItemOption[];
  item?: StockItemOption;
}) {
  const t = useT();
  const [open, setOpen] = React.useState(false);
  return (
    <>
      {item ? (
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1 rounded-md border border-border-strong px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary"
          title={t("stock.movement.rowTitle", { name: item.name })}
        >
          <Minus className="size-3" /> {t("stock.movement.rowButton")}
        </button>
      ) : (
        <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
          <ArrowLeftRight className="size-4" /> {t("stock.movement.button")}
        </Button>
      )}
      {open && <MovimentoDialog items={items} preset={item} onClose={() => setOpen(false)} />}
    </>
  );
}

function MovimentoDialog({
  items,
  preset,
  onClose,
}: {
  items: StockItemOption[];
  preset?: StockItemOption;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const t = useT();
  const [itemId, setItemId] = React.useState(preset?.id ?? "");
  const [type, setType] = React.useState<(typeof TYPES)[number]>("SAIDA");
  const [quantity, setQuantity] = React.useState("1");
  const [reason, setReason] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const chosen = items.find((i) => i.id === itemId);
  const qty = Number.parseInt(quantity || "0", 10) || 0;
  const projected =
    !chosen ? null
      : type === "ENTRADA" ? chosen.currentStock + qty
        : type === "AJUSTE" ? qty
          : chosen.currentStock - qty;

  async function submit() {
    setError(null);
    if (!itemId) return setError(t("stock.movement.errors.itemRequired"));
    if (qty <= 0) return setError(t("stock.movement.errors.quantityPositive"));

    setSaving(true);
    const res = await registerStockMovement({ itemId, type, quantity: qty, reason });
    setSaving(false);
    if ("error" in res && res.error) return setError(res.error);
    toast(t("stock.movement.toast"));
    router.refresh();
    onClose();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t("stock.movement.title")}
      description={t("stock.movement.description")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t("common.cancel")}</Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? <ProcessingPulse /> : <Check className="size-4" />} {t("stock.movement.submit")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <Label>{t("stock.movement.item")} <span className="text-danger">*</span></Label>
          <Select className="mt-1.5" value={itemId} onChange={(e) => setItemId(e.target.value)}>
            <option value="">{t("stock.movement.select")}</option>
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name} — {i.currentStock} {i.unit}
              </option>
            ))}
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>{t("stock.movement.type")}</Label>
            <Select className="mt-1.5" value={type} onChange={(e) => setType(e.target.value as (typeof TYPES)[number])}>
              {TYPES.map((value) => (
                <option key={value} value={value}>{t(`stock.movement.types.${value}`)}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label>{type === "AJUSTE" ? t("stock.movement.countedStock") : t("stock.movement.quantity")}</Label>
            <Input className="mt-1.5" inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </div>
        </div>

        <div>
          <Label>{t("stock.movement.reason")}</Label>
          <Input
            className="mt-1.5"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={type === "SAIDA" ? t("stock.movement.reasonPlaceholderOut") : t("stock.movement.reasonPlaceholderOther")}
          />
        </div>

        {chosen && (
          <div className="flex items-center justify-between rounded-md bg-surface-2 px-3 py-2 text-sm">
            <span className="text-muted-foreground">{t("stock.movement.projected")}</span>
            <span className={`font-semibold tabular ${projected! < 0 ? "text-danger" : ""}`}>
              {chosen.currentStock} → {projected} {chosen.unit}
            </span>
          </div>
        )}

        {error && <p className="rounded-md bg-danger-muted px-3 py-2 text-[13px] font-medium text-danger">{error}</p>}
      </div>
    </Modal>
  );
}
