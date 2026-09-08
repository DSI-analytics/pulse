"use client";

import * as React from "react";
import { Check, Loader2, Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/toast";

export interface CrudField {
  name: string;
  label: string;
  type?: "text" | "tel" | "email" | "number" | "money" | "date" | "select";
  required?: boolean;
  options?: { value: string; label: string }[];
  placeholder?: string;
  defaultValue?: string;
  full?: boolean;
  suffix?: string;
}

export type CrudActionResult = { ok: true; id?: string } | { error: string };

export function RecordCrudButton({
  id,
  title,
  description,
  fields,
  updateAction,
  deleteAction,
  toastSuccess = "Registo atualizado com sucesso",
  redirectOnDelete,
}: {
  id: string;
  title: string;
  description?: string;
  fields: CrudField[];
  updateAction: (id: string, values: Record<string, string>) => Promise<CrudActionResult>;
  deleteAction?: (id: string) => Promise<CrudActionResult>;
  toastSuccess?: string;
  redirectOnDelete?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [values, setValues] = React.useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((f) => [f.name, f.defaultValue ?? ""])),
  );

  React.useEffect(() => {
    setTimeout(() => {
      setValues(Object.fromEntries(fields.map((f) => [f.name, f.defaultValue ?? ""])));
      setError(null);
    }, 0);
  }, [id, fields]);

  async function submit() {
    setError(null);
    for (const f of fields) {
      if (f.required && !values[f.name]?.trim()) {
        return setError(`Preencha o campo “${f.label}”.`);
      }
    }
    setSaving(true);
    const res = await updateAction(id, values);
    setSaving(false);
    if ("error" in res) return setError(res.error);
    toast(toastSuccess);
    router.refresh();
    setOpen(false);
  }

  async function remove() {
    if (!deleteAction) return;
    const confirmed = window.confirm(`Tem a certeza que pretende apagar este registo?`);
    if (!confirmed) return;

    setSaving(true);
    const res = await deleteAction(id);
    setSaving(false);
    if ("error" in res) return setError(res.error);
    toast("Registo apagado com sucesso");
    setOpen(false);
    if (redirectOnDelete) {
      router.replace(redirectOnDelete);
      return;
    }
    router.refresh();
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
          <Pencil className="size-3.5" /> Editar
        </Button>
        {deleteAction && (
          <Button variant="danger" size="sm" onClick={remove} disabled={saving}>
            <Trash2 className="size-3.5" /> Apagar
          </Button>
        )}
      </div>

      {open && (
        <Modal
          open
          onClose={() => setOpen(false)}
          title={title}
          description={description}
          footer={
            <>
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button onClick={submit} disabled={saving}>
                {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Guardar
              </Button>
            </>
          }
        >
          <div className="grid grid-cols-2 gap-3">
            {fields.map((f) => (
              <div key={f.name} className={f.full ? "col-span-2" : ""}>
                <Label htmlFor={f.name}>
                  {f.label}
                  {f.required && <span className="text-danger"> *</span>}
                  {f.suffix && <span className="ml-1 text-subtle-foreground">({f.suffix})</span>}
                </Label>
                {f.type === "select" ? (
                  <Select
                    id={f.name}
                    className="mt-1.5"
                    value={values[f.name] ?? ""}
                    onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                  >
                    <option value="">Selecionar…</option>
                    {f.options?.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </Select>
                ) : (
                  <Input
                    id={f.name}
                    className="mt-1.5"
                    type={f.type === "money" ? "text" : f.type ?? "text"}
                    inputMode={f.type === "money" || f.type === "number" ? "decimal" : undefined}
                    placeholder={f.placeholder}
                    value={values[f.name] ?? ""}
                    onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                  />
                )}
              </div>
            ))}
          </div>
          {error && (
            <p className="mt-3 rounded-md bg-danger-muted px-3 py-2 text-[13px] font-medium text-danger">{error}</p>
          )}
        </Modal>
      )}
    </>
  );
}
