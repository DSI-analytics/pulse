"use client";

import * as React from "react";
import { Check, Pencil, Trash2 } from "lucide-react";
import { ProcessingPulse } from "@/components/processing-pulse";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/toast";
import { useT } from "@/i18n/client";

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
  const t = useT();
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
    if (!values.name.trim()) return setError(t("patients.editor.nameRequired"));
    setSaving(true);
    const res = await action(patient.id, values);
    setSaving(false);
    if ("error" in res) return setError(res.error);
    toast(t("patients.editor.updated"));
    router.refresh();
    setOpen(false);
  }

  async function remove() {
    if (!deleteAction) return;
    const confirmed = window.confirm(t("patients.editor.confirmDelete", { name: patient.name }));
    if (!confirmed) return;

    setSaving(true);
    const res = await deleteAction(patient.id);
    setSaving(false);
    if ("error" in res) return setError(res.error);
    toast(t("patients.editor.deleted"));
    setOpen(false);
    router.replace("/pacientes");
    router.refresh();
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
          <Pencil className="size-3.5" /> {t("common.edit")}
        </Button>
        {deleteAction && (
          <Button variant="danger" size="sm" onClick={remove} disabled={saving}>
            <Trash2 className="size-3.5" /> {t("common.remove")}
          </Button>
        )}
      </div>

      {open && (
        <Modal
          open
          onClose={() => setOpen(false)}
          title={t("patients.editor.title")}
          description={t("patients.editor.description")}
          footer={
            <>
              <Button variant="ghost" onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
              <Button onClick={submit} disabled={saving}>
                {saving ? <ProcessingPulse /> : <Check className="size-4" />} {t("common.save")}
              </Button>
            </>
          }
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label htmlFor="name">{t("patients.fields.name")}</Label>
              <Input id="name" className="mt-1.5" value={values.name} onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="phone">{t("patients.fields.phone")}</Label>
              <Input id="phone" className="mt-1.5" value={values.phone} onChange={(e) => setValues((v) => ({ ...v, phone: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="birthDate">{t("patients.fields.birthDate")}</Label>
              <Input id="birthDate" type="date" className="mt-1.5" value={values.birthDate} onChange={(e) => setValues((v) => ({ ...v, birthDate: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="gender">{t("patients.fields.gender")}</Label>
              <Select id="gender" className="mt-1.5" value={values.gender} onChange={(e) => setValues((v) => ({ ...v, gender: e.target.value }))}>
                <option value="">{t("common.selectPlaceholder")}</option>
                <option value="FEMININO">{t("patients.gender.FEMININO")}</option>
                <option value="MASCULINO">{t("patients.gender.MASCULINO")}</option>
                <option value="OUTRO">{t("patients.gender.OUTRO")}</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="email">{t("patients.fields.email")}</Label>
              <Input id="email" type="email" className="mt-1.5" value={values.email} onChange={(e) => setValues((v) => ({ ...v, email: e.target.value }))} />
            </div>
            <div className="col-span-2">
              <Label htmlFor="address">{t("patients.fields.address")}</Label>
              <Input id="address" className="mt-1.5" value={values.address} onChange={(e) => setValues((v) => ({ ...v, address: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="emergencyContactName">{t("patients.fields.emergencyContact")}</Label>
              <Input id="emergencyContactName" className="mt-1.5" value={values.emergencyContactName} onChange={(e) => setValues((v) => ({ ...v, emergencyContactName: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="emergencyContactPhone">{t("patients.fields.emergencyPhone")}</Label>
              <Input id="emergencyContactPhone" className="mt-1.5" value={values.emergencyContactPhone} onChange={(e) => setValues((v) => ({ ...v, emergencyContactPhone: e.target.value }))} />
            </div>
          </div>

          {error && <p className="mt-3 rounded-md bg-danger-muted px-3 py-2 text-[13px] font-medium text-danger">{error}</p>}
        </Modal>
      )}
    </>
  );
}
