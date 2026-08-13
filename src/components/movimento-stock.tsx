"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftRight, Check, Loader2, Minus } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/toast";
import { registerStockMovement } from "@/server/inventory-actions";

export interface StockItemOption {
  id: string;
  name: string;
  unit: string;
  currentStock: number;
}

const TYPES = [
  { value: "SAIDA", label: "Saída (consumo)" },
  { value: "ENTRADA", label: "Entrada manual" },
  { value: "AJUSTE", label: "Ajuste de inventário" },
  { value: "PERDA", label: "Perda / quebra" },
] as const;

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
  const [open, setOpen] = React.useState(false);
  return (
    <>
      {item ? (
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1 rounded-md border border-border-strong px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary"
          title={`Movimentar ${item.name}`}
        >
          <Minus className="size-3" /> Movimentar
        </button>
      ) : (
        <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
          <ArrowLeftRight className="size-4" /> Registar movimento
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
  const [itemId, setItemId] = React.useState(preset?.id ?? "");
  const [type, setType] = React.useState<string>("SAIDA");
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
    if (!itemId) return setError("Selecione o artigo.");
    if (qty <= 0) return setError("Indique uma quantidade maior que zero.");

    setSaving(true);
    const res = await registerStockMovement({ itemId, type: type as "SAIDA", quantity: qty, reason });
    setSaving(false);
    if ("error" in res && res.error) return setError(res.error);
    toast("Movimento de stock registado");
    router.refresh();
    onClose();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Movimento de stock"
      description="Registe consumos, entradas manuais, ajustes de inventário ou perdas."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Registar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <Label>Artigo <span className="text-danger">*</span></Label>
          <Select className="mt-1.5" value={itemId} onChange={(e) => setItemId(e.target.value)}>
            <option value="">Selecionar…</option>
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name} — {i.currentStock} {i.unit}
              </option>
            ))}
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Tipo</Label>
            <Select className="mt-1.5" value={type} onChange={(e) => setType(e.target.value)}>
              {TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label>{type === "AJUSTE" ? "Stock contado" : "Quantidade"}</Label>
            <Input className="mt-1.5" inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </div>
        </div>

        <div>
          <Label>Motivo</Label>
          <Input
            className="mt-1.5"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={type === "SAIDA" ? "Ex.: consumo em consultas" : "Ex.: contagem mensal"}
          />
        </div>

        {chosen && (
          <div className="flex items-center justify-between rounded-md bg-surface-2 px-3 py-2 text-sm">
            <span className="text-muted-foreground">Stock após o movimento</span>
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
