"use client";

import * as React from "react";
import { Check, Loader2, Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/toast";

type Patient = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  birthDate: Date | string | null;
  gender: "MASCULINO" | "FEMININO" | "OUTRO" | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
};

type ActionResult = { ok: true; id?: string } | { error: string };

function formatDateInput(value: Date | string | null): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

export function EditPatientButton({
  patient,
  action,
  deleteAction,
}: {
  patient: Patient;
  action: (patientId: string, values: Record<string, string>) => Promise<ActionResult>;
  deleteAction?: (patientId: string) => Promise<ActionResult>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [values, setValues] = React.useState<Record<string, string>>({
    name: patient.name,
    phone: patient.phone ?? "",
    email: patient.email ?? "",
    address: patient.address ?? "",
    birthDate: formatDateInput(patient.birthDate),
    gender: patient.gender ?? "",
    emergencyContactName: patient.emergencyContactName ?? "",
    emergencyContactPhone: patient.emergencyContactPhone ?? "",
  });

  React.useEffect(() => {
    setTimeout(() => setValues({
        name: patient.name,
        phone: patient.phone ?? "",
        email: patient.email ?? "",
        address: patient.address ?? "",
        birthDate: formatDateInput(patient.birthDate),
        gender: patient.gender ?? "",
        emergencyContactName: patient.emergencyContactName ?? "",
        emergencyContactPhone: patient.emergencyContactPhone ?? "",
      }), 0);
  }, [patient]);

  async function submit() {
    setError(null);
    if (!values.name.trim()) return setError("Indique o nome do paciente.");
    setSaving(true);
    const res = await action(patient.id, values);
    setSaving(false);
    if ("error" in res) return setError(res.error);
    toast("Paciente atualizado com sucesso");
    router.refresh();
    setOpen(false);
  }

  async function remove() {
    if (!deleteAction) return;
    const confirmed = window.confirm(`Tem a certeza que pretende apagar o paciente ${patient.name}?`);
    if (!confirmed) return;

    setSaving(true);
    const res = await deleteAction(patient.id);
    setSaving(false);
    if ("error" in res) return setError(res.error);
    toast("Paciente apagado com sucesso");
    setOpen(false);
    router.replace("/pacientes");
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
          title="Editar paciente"
          description="Atualize os dados pessoais e de contacto do paciente."
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
            <div className="col-span-2">
              <Label htmlFor="name">Nome completo</Label>
              <Input id="name" className="mt-1.5" value={values.name} onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="phone">Telefone</Label>
              <Input id="phone" className="mt-1.5" value={values.phone} onChange={(e) => setValues((v) => ({ ...v, phone: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="birthDate">Data de nascimento</Label>
              <Input id="birthDate" type="date" className="mt-1.5" value={values.birthDate} onChange={(e) => setValues((v) => ({ ...v, birthDate: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="gender">Género</Label>
              <Select id="gender" className="mt-1.5" value={values.gender} onChange={(e) => setValues((v) => ({ ...v, gender: e.target.value }))}>
                <option value="">Selecionar…</option>
                <option value="FEMININO">Feminino</option>
                <option value="MASCULINO">Masculino</option>
                <option value="OUTRO">Outro</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" className="mt-1.5" value={values.email} onChange={(e) => setValues((v) => ({ ...v, email: e.target.value }))} />
            </div>
            <div className="col-span-2">
              <Label htmlFor="address">Morada</Label>
              <Input id="address" className="mt-1.5" value={values.address} onChange={(e) => setValues((v) => ({ ...v, address: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="emergencyContactName">Contacto de emergência</Label>
              <Input id="emergencyContactName" className="mt-1.5" value={values.emergencyContactName} onChange={(e) => setValues((v) => ({ ...v, emergencyContactName: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="emergencyContactPhone">Tel. de emergência</Label>
              <Input id="emergencyContactPhone" className="mt-1.5" value={values.emergencyContactPhone} onChange={(e) => setValues((v) => ({ ...v, emergencyContactPhone: e.target.value }))} />
            </div>
          </div>

          {error && <p className="mt-3 rounded-md bg-danger-muted px-3 py-2 text-[13px] font-medium text-danger">{error}</p>}
        </Modal>
      )}
    </>
  );
}
