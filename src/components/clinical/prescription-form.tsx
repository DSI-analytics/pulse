"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Pill, Plus, ShieldAlert, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/toast";
import { checkPrescriptionAllergies, createPrescription } from "@/server/clinical-actions";
import type { AllergyWarning } from "@/lib/domain/allergy-check";

/**
 * Emissão de receita.
 *
 * Antes de gravar, os medicamentos são confrontados com as alergias activas do
 * paciente. Um conflito grave ou fatal exige confirmação explícita — o servidor
 * recusa a gravação sem ela, pelo que esta caixa de verificação não é a
 * protecção, é apenas onde o profissional a exerce.
 */

interface ItemDraft {
  key: string;
  medicationId: string;
  medicationName: string;
  activeIngredient: string;
  dose: string;
  doseUnit: string;
  route: string;
  frequency: string;
  durationDays: string;
  quantity: string;
  instructions: string;
}

const ROUTES = [
  "ORAL", "INTRAVENOSA", "INTRAMUSCULAR", "SUBCUTANEA", "TOPICA",
  "INALATORIA", "RECTAL", "OFTALMICA", "OTOLOGICA", "NASAL", "OUTRA",
];

const ROUTE_LABEL: Record<string, string> = {
  ORAL: "Oral", INTRAVENOSA: "Intravenosa", INTRAMUSCULAR: "Intramuscular",
  SUBCUTANEA: "Subcutânea", TOPICA: "Tópica", INALATORIA: "Inalatória",
  RECTAL: "Rectal", OFTALMICA: "Oftálmica", OTOLOGICA: "Otológica",
  NASAL: "Nasal", OUTRA: "Outra",
};

let counter = 0;
const emptyItem = (): ItemDraft => ({
  key: `i${(counter += 1)}`,
  medicationId: "", medicationName: "", activeIngredient: "", dose: "", doseUnit: "",
  route: "ORAL", frequency: "", durationDays: "", quantity: "", instructions: "",
});

export interface MedicationOption {
  id: string;
  name: string;
  activeIngredient: string | null;
}

export function PrescriptionButton({
  patientId,
  medications,
}: {
  patientId: string;
  medications: MedicationOption[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = React.useState(false);
  const [items, setItems] = React.useState<ItemDraft[]>([emptyItem()]);
  const [notes, setNotes] = React.useState("");
  const [validUntil, setValidUntil] = React.useState("");
  const [warnings, setWarnings] = React.useState<Record<string, AllergyWarning[]>>({});
  const [acknowledge, setAcknowledge] = React.useState(false);
  const [checking, setChecking] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const byId = React.useMemo(() => new Map(medications.map((m) => [m.id, m])), [medications]);

  const update = (key: string, patch: Partial<ItemDraft>) =>
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, ...patch } : i)));

  function reset() {
    setItems([emptyItem()]);
    setNotes("");
    setValidUntil("");
    setWarnings({});
    setAcknowledge(false);
    setError(null);
  }

  const named = items.filter((i) => i.medicationName.trim());
  const allWarnings = Object.values(warnings).flat();
  const blocking = allWarnings.filter((w) => w.severity === "GRAVE" || w.severity === "FATAL");

  // Verifica alergias sempre que a lista de medicamentos estabiliza.
  React.useEffect(() => {
    if (!open) return;
    const payload = named.map((i) => ({ medicationName: i.medicationName.trim(), activeIngredient: i.activeIngredient.trim() }));
    const timer = setTimeout(async () => {
      if (!payload.length) {
        setWarnings({});
        return;
      }
      setChecking(true);
      const result = await checkPrescriptionAllergies(patientId, payload);
      setChecking(false);
      setWarnings("error" in result ? {} : result.warnings);
      setAcknowledge(false);
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, patientId, named.map((i) => `${i.medicationName}|${i.activeIngredient}`).join("~")]);

  async function submit() {
    setError(null);
    if (!named.length) return setError("Adicione pelo menos um medicamento.");
    if (blocking.length && !acknowledge) {
      return setError("Confirme explicitamente que reviu os alertas de alergia antes de emitir.");
    }
    setSaving(true);
    const result = await createPrescription({
      patientId,
      validUntil,
      notes,
      acknowledgeAllergyWarnings: acknowledge,
      items: named.map((i) => ({
        medicationId: i.medicationId,
        medicationName: i.medicationName.trim(),
        activeIngredient: i.activeIngredient.trim(),
        dose: i.dose,
        doseUnit: i.doseUnit,
        route: (i.route || undefined) as never,
        frequency: i.frequency,
        durationDays: i.durationDays ? Number(i.durationDays) : undefined,
        quantity: i.quantity,
        instructions: i.instructions,
      })),
    });
    setSaving(false);
    if ("error" in result) return setError(result.error);
    toast(`Receita ${result.number} emitida`);
    router.refresh();
    setOpen(false);
    reset();
  }

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <Pill className="size-4" /> Nova receita
      </Button>

      {open && (
        <Modal
          open
          onClose={() => setOpen(false)}
          title="Emitir receita"
          description="Os medicamentos são confrontados com as alergias activas do paciente."
          className="max-w-3xl"
          footer={
            <>
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button onClick={submit} disabled={saving || checking}>
                {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Emitir
              </Button>
            </>
          }
        >
          <div className="space-y-3">
            {items.map((item, index) => (
              <div key={item.key} className="rounded-lg border border-border bg-surface-2/40 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-[13px] font-medium text-muted-foreground">Medicamento {index + 1}</p>
                  {items.length > 1 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Remover medicamento ${index + 1}`}
                      onClick={() => setItems((prev) => prev.filter((i) => i.key !== item.key))}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <Label htmlFor={`${item.key}-cat`}>Do catálogo</Label>
                    <Select
                      id={`${item.key}-cat`}
                      className="mt-1.5"
                      value={item.medicationId}
                      onChange={(e) => {
                        const med = byId.get(e.target.value);
                        update(item.key, {
                          medicationId: e.target.value,
                          medicationName: med?.name ?? item.medicationName,
                          activeIngredient: med?.activeIngredient ?? item.activeIngredient,
                        });
                      }}
                    >
                      <option value="">Escrever manualmente…</option>
                      {medications.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor={`${item.key}-name`}>Medicamento <span className="text-danger">*</span></Label>
                    <Input id={`${item.key}-name`} className="mt-1.5" value={item.medicationName}
                      onChange={(e) => update(item.key, { medicationName: e.target.value })} placeholder="Ex.: Amoxicilina 500 mg" />
                  </div>
                  <div>
                    <Label htmlFor={`${item.key}-ai`}>Princípio activo</Label>
                    <Input id={`${item.key}-ai`} className="mt-1.5" value={item.activeIngredient}
                      onChange={(e) => update(item.key, { activeIngredient: e.target.value })} placeholder="Ex.: Amoxicilina" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label htmlFor={`${item.key}-dose`}>Dose</Label>
                      <Input id={`${item.key}-dose`} className="mt-1.5" value={item.dose}
                        onChange={(e) => update(item.key, { dose: e.target.value })} placeholder="500" />
                    </div>
                    <div>
                      <Label htmlFor={`${item.key}-unit`}>Unidade</Label>
                      <Input id={`${item.key}-unit`} className="mt-1.5" value={item.doseUnit}
                        onChange={(e) => update(item.key, { doseUnit: e.target.value })} placeholder="mg" />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor={`${item.key}-route`}>Via</Label>
                    <Select id={`${item.key}-route`} className="mt-1.5" value={item.route}
                      onChange={(e) => update(item.key, { route: e.target.value })}>
                      {ROUTES.map((r) => <option key={r} value={r}>{ROUTE_LABEL[r]}</option>)}
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor={`${item.key}-freq`}>Frequência</Label>
                    <Input id={`${item.key}-freq`} className="mt-1.5" value={item.frequency}
                      onChange={(e) => update(item.key, { frequency: e.target.value })} placeholder="8/8h" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label htmlFor={`${item.key}-dur`}>Duração (dias)</Label>
                      <Input id={`${item.key}-dur`} className="mt-1.5" type="number" min={0} value={item.durationDays}
                        onChange={(e) => update(item.key, { durationDays: e.target.value })} placeholder="7" />
                    </div>
                    <div>
                      <Label htmlFor={`${item.key}-qty`}>Quantidade</Label>
                      <Input id={`${item.key}-qty`} className="mt-1.5" value={item.quantity}
                        onChange={(e) => update(item.key, { quantity: e.target.value })} placeholder="21 comp." />
                    </div>
                  </div>
                  <div className="sm:col-span-2">
                    <Label htmlFor={`${item.key}-instr`}>Instruções</Label>
                    <Input id={`${item.key}-instr`} className="mt-1.5" value={item.instructions}
                      onChange={(e) => update(item.key, { instructions: e.target.value })} placeholder="Após as refeições" />
                  </div>
                </div>

                {warnings[item.medicationName.trim()]?.length ? (
                  <ul className="mt-2 space-y-1">
                    {warnings[item.medicationName.trim()]!.map((w) => (
                      <li
                        key={w.allergyId}
                        className={
                          w.severity === "GRAVE" || w.severity === "FATAL"
                            ? "flex items-start gap-1.5 rounded-md bg-danger-muted px-2.5 py-1.5 text-xs text-danger"
                            : "flex items-start gap-1.5 rounded-md bg-warning-muted px-2.5 py-1.5 text-xs text-warning"
                        }
                      >
                        <ShieldAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                        {w.message}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ))}

            <Button variant="ghost" size="sm" onClick={() => setItems((prev) => [...prev, emptyItem()])}>
              <Plus className="size-4" /> Adicionar medicamento
            </Button>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="rx-valid">Válida até</Label>
                <Input id="rx-valid" className="mt-1.5" type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
              </div>
            </div>
            <div>
              <Label htmlFor="rx-notes">Notas</Label>
              <Textarea id="rx-notes" className="mt-1.5" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>

            {checking && <p className="text-xs text-muted-foreground">A verificar alergias…</p>}

            {blocking.length > 0 && (
              <label className="flex items-start gap-2 rounded-md border border-danger/50 bg-danger-muted/50 p-3 text-[13px] text-danger">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={acknowledge}
                  onChange={(e) => setAcknowledge(e.target.checked)}
                />
                <span>
                  Revi os {blocking.length} alerta(s) de alergia grave e assumo a responsabilidade clínica por emitir
                  esta receita.
                </span>
              </label>
            )}

            {error && <p role="alert" className="rounded-md bg-danger-muted px-3 py-2 text-[13px] font-medium text-danger">{error}</p>}
          </div>
        </Modal>
      )}
    </>
  );
}
