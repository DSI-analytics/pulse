"use client";

import * as React from "react";
import { Check, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/toast";
import { ConfirmDialog } from "@/components/settings/confirm-dialog";
import { FormStatus } from "@/components/settings/form-status";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { createSpecialtyRecord, deleteSpecialtyRecord, updateSpecialtyRecord } from "@/server/crud-actions";

export interface SpecialtyView {
  id: string;
  name: string;
  color: string;
  doctors: number;
}

/**
 * Paleta de especialidades em OKLCH, com luminosidade ~50–60% para que o ponto
 * de cor se destaque em ambos os temas (o Avatar mistura-a com o primeiro
 * plano para o texto manter contraste AA).
 */
const PALETTE = [
  { key: "teal", value: "oklch(55% 0.11 182)" },
  { key: "blue", value: "oklch(54% 0.15 250)" },
  { key: "indigo", value: "oklch(50% 0.16 275)" },
  { key: "violet", value: "oklch(54% 0.18 305)" },
  { key: "pink", value: "oklch(58% 0.2 350)" },
  { key: "red", value: "oklch(56% 0.2 28)" },
  { key: "amber", value: "oklch(68% 0.16 65)" },
  { key: "green", value: "oklch(56% 0.14 150)" },
] as const;

export function SpecialtyManager({ specialties }: { specialties: SpecialtyView[] }) {
  const t = useT();
  const toast = useToast();
  const [editing, setEditing] = React.useState<SpecialtyView | "new" | null>(null);
  const [removing, setRemoving] = React.useState<SpecialtyView | null>(null);
  const [color, setColor] = React.useState<string>(PALETTE[0].value);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  const current = editing === "new" ? null : editing;

  function open(target: SpecialtyView | "new") {
    setError(null);
    setColor(target === "new" ? PALETTE[0].value : target.color);
    setEditing(target);
  }

  function submit(formData: FormData) {
    const values = { name: String(formData.get("name") ?? ""), color };
    startTransition(async () => {
      const result = current ? await updateSpecialtyRecord(current.id, values) : await createSpecialtyRecord(values);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      toast(t("settings.specialties.saved"));
      setEditing(null);
    });
  }

  function remove(target: SpecialtyView) {
    startTransition(async () => {
      const result = await deleteSpecialtyRecord(target.id);
      if ("error" in result) toast(result.error, "error");
      else toast(t("settings.specialties.deleted"));
      setRemoving(null);
    });
  }

  // Cores antigas (HEX) continuam válidas e aparecem como opção extra.
  const options = PALETTE.some((option) => option.value === color)
    ? PALETTE
    : [...PALETTE, { key: "current" as const, value: color }];

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle>{t("settings.sections.specialties.title")}</CardTitle>
        <Button type="button" size="sm" variant="secondary" onClick={() => open("new")}>
          <Plus /> {t("settings.specialties.add")}
        </Button>
      </CardHeader>
      <CardContent className="pt-0">
        {specialties.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border-strong px-4 py-6 text-center text-sm text-muted-foreground">
            {t("settings.specialties.empty")}
          </p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {specialties.map((specialty) => (
              <li key={specialty.id} className="flex items-center gap-3 rounded-lg border border-border bg-fill-subtle py-2 pl-3 pr-1.5">
                <span
                  className="size-3 shrink-0 rounded-full ring-1 ring-inset ring-border-strong"
                  style={{ background: specialty.color }}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{specialty.name}</p>
                  <p className="text-[12px] text-muted-foreground">{t("settings.specialties.doctors", { count: specialty.doctors })}</p>
                </div>
                <Button type="button" size="icon" variant="ghost" aria-label={`${t("common.edit")}: ${specialty.name}`} onClick={() => open(specialty)}>
                  <Pencil />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={`${t("common.delete")}: ${specialty.name}`}
                  title={specialty.doctors > 0 ? t("settings.specialties.inUse") : undefined}
                  disabled={specialty.doctors > 0}
                  onClick={() => setRemoving(specialty)}
                >
                  <Trash2 className={specialty.doctors > 0 ? undefined : "text-danger"} />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={current ? t("settings.specialties.editTitle") : t("settings.specialties.add")}
      >
        <form key={current?.id ?? "new"} action={submit} className="space-y-4">
          <div>
            <Label htmlFor="specialty-name">{t("settings.specialties.name")}</Label>
            <Input id="specialty-name" name="name" className="mt-1.5" defaultValue={current?.name ?? ""} required minLength={2} autoFocus />
          </div>
          <fieldset>
            <legend className="text-sm font-medium text-foreground">{t("settings.specialties.color")}</legend>
            <div role="radiogroup" className="mt-2 flex flex-wrap gap-2">
              {options.map((option) => {
                const selected = option.value === color;
                const label = option.key === "current" ? option.value : t(`settings.specialties.colors.${option.key}`);
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-label={label}
                    title={label}
                    onClick={() => setColor(option.value)}
                    className={cn(
                      "press flex size-9 items-center justify-center rounded-full border outline-none focus-visible:shadow-[0_0_0_3px_var(--primary-muted)]",
                      selected ? "border-foreground" : "border-border-strong",
                    )}
                  >
                    <span className="flex size-7 items-center justify-center rounded-full" style={{ background: option.value }}>
                      {selected && <Check className="size-4 text-[oklch(100%_0_0)]" aria-hidden />}
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>
          {error && <FormStatus state={{ ok: false, message: error }} />}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={() => setEditing(null)}>{t("common.cancel")}</Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}
              {t("common.save")}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={removing !== null}
        title={t("common.delete")}
        message={t("settings.specialties.confirmDelete", { name: removing?.name ?? "" })}
        confirmLabel={t("common.delete")}
        pending={pending}
        onClose={() => setRemoving(null)}
        onConfirm={() => removing && remove(removing)}
      />
    </Card>
  );
}
