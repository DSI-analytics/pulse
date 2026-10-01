"use client";

import * as React from "react";
import { Check, ClipboardPlus, FlaskConical, Lock, Plus, Save, Trash2, X } from "lucide-react";
import { ProcessingPulse } from "@/components/processing-pulse";
import type { AppointmentStatus } from "@prisma/client";
import { useRouter } from "next/navigation";
import {
  addConsultationCharge,
  getConsultationEditor,
  removeConsultationCharge,
  saveConsultation,
  type ConsultationBillableService,
  type ConsultationChargeView,
  type ConsultationValues,
} from "@/server/consultation-actions";
import { useToast } from "@/components/toast";
import { AddendumButton, AddendumList, type ClinicalAddendumView } from "@/components/clinical/addendum-dialog";
import { IcdPicker, type IcdSelection } from "@/components/clinical/icd-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useFormat, useT } from "@/i18n/client";

/**
 * Registo clínico da consulta.
 *
 * Duas regras mandam nesta folha:
 *  - uma consulta concluída não se altera — abre em leitura, com aviso, e a
 *    única acção possível é acrescentar uma adenda ao registo;
 *  - o diagnóstico não é texto livre: escolhe-se na CID-11 da OMS (podem ser
 *    vários), e só as notas clínicas aceitam texto escrito pelo médico.
 */

/** Diagnóstico codificado tal como viaja para `saveConsultation`. */
interface ConsultationDiagnosis {
  code: string;
  title: string;
  uri?: string;
  release?: string;
  kind?: string;
  certainty?: string;
}

/**
 * Campos que o servidor acrescenta ao resultado do editor. Opcionais para que
 * o componente continue a compilar enquanto a acção não os envia.
 */
type EditorExtras = {
  locked?: boolean;
  addenda?: ClinicalAddendumView[];
  patientId?: string;
  consultationId?: string | null;
  charges?: ConsultationChargeView[];
  billableServices?: ConsultationBillableService[];
};

/**
 * `diagnosis` (texto livre) fica opcional: o campo desaparece do contrato do
 * servidor assim que a lista codificada entra, e o editor tem de compilar nos
 * dois momentos.
 */
type EditorValues = ConsultationValues & { diagnosis?: string; diagnoses: ConsultationDiagnosis[] };

const EMPTY: EditorValues = {
  subjective: "",
  notes: "",
  diagnosis: "",
  prescription: "",
  recommendations: "",
  followUpDate: "",
  diagnoses: [],
};

export function ClinicalConsultationEditor({
  appointmentId,
  status,
  compact = false,
}: {
  appointmentId: string;
  status: AppointmentStatus;
  compact?: boolean;
}) {
  const toast = useToast();
  const router = useRouter();
  const t = useT();
  const f = useFormat();
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [values, setValues] = React.useState<EditorValues>(EMPTY);
  const [patientName, setPatientName] = React.useState("");
  const [doctorName, setDoctorName] = React.useState("");
  const [locked, setLocked] = React.useState(false);
  const [addenda, setAddenda] = React.useState<ClinicalAddendumView[]>([]);
  const [patientId, setPatientId] = React.useState("");
  const [consultationId, setConsultationId] = React.useState("");
  const [charges, setCharges] = React.useState<ConsultationChargeView[]>([]);
  const [billableServices, setBillableServices] = React.useState<ConsultationBillableService[]>([]);
  const [selectedServiceId, setSelectedServiceId] = React.useState("");
  const [chargeQuantity, setChargeQuantity] = React.useState("1");
  const [chargeSaving, setChargeSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function show() {
    setOpen(true);
    setLoading(true);
    setError(null);
    const result = await getConsultationEditor(appointmentId);
    setLoading(false);
    if ("error" in result) return setError(result.error);
    const extras = result as typeof result & EditorExtras;
    const loaded = result.values as ConsultationValues & { diagnoses?: ConsultationDiagnosis[] };
    setValues({ ...loaded, diagnoses: loaded.diagnoses ?? [] });
    setPatientName(result.patientName);
    setDoctorName(result.doctorName);
    setLocked(Boolean(extras.locked));
    setAddenda(extras.addenda ?? []);
    setPatientId(extras.patientId ?? "");
    setConsultationId(extras.consultationId ?? "");
    setCharges(extras.charges ?? []);
    setBillableServices(extras.billableServices ?? []);
    setSelectedServiceId("");
    setChargeQuantity("1");
  }

  async function submit(complete: boolean) {
    setSaving(true);
    setError(null);
    const result = await saveConsultation(appointmentId, values, complete);
    setSaving(false);
    if ("error" in result) return setError(result.error);
    toast(complete ? t("consultations.editor.completedToast") : t("consultations.editor.savedToast"));
    setOpen(false);
    router.refresh();
  }

  function addDiagnosis(selection: IcdSelection | null) {
    if (!selection) return;
    setValues((current) =>
      current.diagnoses.some((d) => d.code === selection.code)
        ? current
        : {
            ...current,
            diagnoses: [
              ...current.diagnoses,
              { code: selection.code, title: selection.title, uri: selection.uri, release: selection.release },
            ],
          },
    );
  }

  function removeDiagnosis(code: string) {
    setValues((current) => ({ ...current, diagnoses: current.diagnoses.filter((d) => d.code !== code) }));
  }

  async function addCharge() {
    const quantity = Number(chargeQuantity);
    if (!selectedServiceId || !Number.isInteger(quantity) || quantity < 1) {
      return setError(t("consultations.charges.errors.invalid"));
    }
    setChargeSaving(true);
    setError(null);
    const result = await addConsultationCharge(appointmentId, { serviceId: selectedServiceId, quantity });
    setChargeSaving(false);
    if ("error" in result) return setError(result.error);
    setCharges((current) => [...current, result.charge]);
    setSelectedServiceId("");
    setChargeQuantity("1");
    toast(t("consultations.charges.added"));
  }

  async function removeCharge(chargeId: string) {
    setChargeSaving(true);
    setError(null);
    const result = await removeConsultationCharge(appointmentId, chargeId);
    setChargeSaving(false);
    if ("error" in result) return setError(result.error);
    setCharges((current) => current.filter((charge) => charge.id !== chargeId));
    toast(t("consultations.charges.removed"));
  }

  const completed = status === "CONCLUIDA";
  const readOnly = locked;

  return (
    <>
      <Button variant={completed || compact ? "secondary" : "default"} size="sm" onClick={show}>
        {completed ? <Lock /> : <ClipboardPlus />}
        {completed ? t("consultations.editor.open") : compact ? t("consultations.editor.open") : t("consultations.editor.register")}
      </Button>
      {open && (
        <Modal
          open
          onClose={() => !saving && setOpen(false)}
          className="max-w-3xl"
          title={t("consultations.editor.title")}
          description={patientName ? `${patientName} · ${doctorName}` : t("consultations.editor.loading")}
          footer={!loading ? (
            <>
              <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
                {readOnly ? t("common.close") : t("common.cancel")}
              </Button>
              {readOnly ? (
                patientId && consultationId ? (
                  <AddendumButton
                    patientId={patientId}
                    targetType="CONSULTATION"
                    targetId={consultationId}
                    variant="secondary"
                    onSaved={(addendum) => setAddenda((current) => [...current, addendum])}
                  />
                ) : null
              ) : (
                <>
                  <Button variant="secondary" onClick={() => submit(false)} disabled={saving}>
                    {saving ? <ProcessingPulse /> : <Save />} {t("consultations.editor.save")}
                  </Button>
                  <Button onClick={() => submit(true)} disabled={saving}>
                    {saving ? <ProcessingPulse /> : <Check />} {t("consultations.editor.saveAndComplete")}
                  </Button>
                </>
              )}
            </>
          ) : undefined}
        >
          {loading ? (
            <div className="flex min-h-52 items-center justify-center"><ProcessingPulse className="h-6 w-12 text-primary" /></div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {readOnly && (
                <p className="md:col-span-2 flex items-start gap-2 rounded-[10px] border border-warning-edge bg-warning-muted px-3 py-2 text-[13px] font-medium text-warning">
                  <Lock className="mt-px size-4 shrink-0" aria-hidden />
                  <span>
                    {t("clinical.immutable.consultationClosed")}{" "}
                    <span className="font-normal">{t("clinical.immutable.addendumHint")}</span>
                  </span>
                </p>
              )}

              <div className="md:col-span-2">
                <Label htmlFor={`diagnoses-${appointmentId}`}>{t("clinical.icd.label")}</Label>
                {values.diagnoses.length > 0 && (
                  <ul className="mt-1.5 space-y-1.5">
                    {values.diagnoses.map((diagnosis) => (
                      <li
                        key={diagnosis.code}
                        className="flex items-start gap-2 rounded-[12px] border border-primary-edge bg-primary-muted px-3 py-2"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block font-mono text-[13px] font-semibold text-primary">{diagnosis.code}</span>
                          <span className="block text-sm font-medium text-foreground">{diagnosis.title}</span>
                        </span>
                        {!readOnly && (
                          <button
                            type="button"
                            onClick={() => removeDiagnosis(diagnosis.code)}
                            aria-label={t("clinical.icd.clear")}
                            className="press flex size-7 shrink-0 items-center justify-center rounded-full bg-fill-strong text-muted-foreground hover:text-foreground"
                          >
                            <X className="size-3.5" aria-hidden />
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {!readOnly && (
                  <div className="mt-1.5">
                    <IcdPicker id={`diagnoses-${appointmentId}`} clearOnSelect onChange={addDiagnosis} />
                  </div>
                )}
                {readOnly && values.diagnoses.length === 0 && (
                  <p className="mt-1.5 text-sm text-muted-foreground">—</p>
                )}
              </div>

              <div className="md:col-span-2 rounded-[14px] border border-border bg-surface-2 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <Label>{t("consultations.charges.title")}</Label>
                    <p className="mt-0.5 text-xs text-muted-foreground">{t("consultations.charges.description")}</p>
                  </div>
                  <span className="text-sm font-semibold tabular text-foreground">
                    {t("consultations.charges.total", { amount: f.moneyExact(charges.reduce((sum, charge) => sum + charge.total, 0)) })}
                  </span>
                </div>

                {charges.length > 0 && (
                  <ul className="mt-3 divide-y divide-border rounded-[10px] border border-border bg-background">
                    {charges.map((charge) => (
                      <li key={charge.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                        <FlaskConical className="size-4 shrink-0 text-primary" aria-hidden />
                        <span className="min-w-0 flex-1"><span className="block font-medium text-foreground">{charge.description}</span><span className="block text-xs text-muted-foreground">{charge.quantity} × {f.moneyExact(charge.unitPrice)}</span></span>
                        <span className="font-semibold tabular text-foreground">{f.moneyExact(charge.total)}</span>
                        {!readOnly && (
                          <button type="button" onClick={() => removeCharge(charge.id)} disabled={chargeSaving} className="press flex size-7 items-center justify-center rounded-full text-muted-foreground hover:bg-danger-muted hover:text-danger" aria-label={t("consultations.charges.remove")}>
                            <Trash2 className="size-3.5" aria-hidden />
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}

                {!readOnly && (
                  <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_90px_auto]">
                    <Select value={selectedServiceId} onChange={(event) => setSelectedServiceId(event.target.value)} disabled={chargeSaving} aria-label={t("consultations.charges.service")}>
                      <option value="">{t("consultations.charges.selectService")}</option>
                      {billableServices.map((service) => <option key={service.id} value={service.id}>{service.category} · {service.name} — {f.moneyExact(service.basePrice)}</option>)}
                    </Select>
                    <Input type="number" min={1} max={99} value={chargeQuantity} onChange={(event) => setChargeQuantity(event.target.value)} disabled={chargeSaving} aria-label={t("consultations.charges.quantity")} />
                    <Button type="button" variant="secondary" onClick={addCharge} disabled={chargeSaving || !selectedServiceId}>
                      {chargeSaving ? <ProcessingPulse /> : <Plus />} {t("consultations.charges.add")}
                    </Button>
                  </div>
                )}
                {!readOnly && billableServices.length === 0 && <p className="mt-3 text-xs text-muted-foreground">{t("consultations.charges.noServices")}</p>}
              </div>

              <ClinicalField
                label={t("consultations.editor.fields.subjective")}
                name="subjective"
                value={values.subjective}
                readOnly={readOnly}
                onChange={(value) => setValues((current) => ({ ...current, subjective: value }))}
                placeholder={t("consultations.editor.fields.subjectivePlaceholder")}
              />
              <ClinicalField
                label={t("consultations.editor.fields.notes")}
                name="notes"
                value={values.notes}
                readOnly={readOnly}
                onChange={(value) => setValues((current) => ({ ...current, notes: value }))}
                placeholder={t("consultations.editor.fields.notesPlaceholder")}
              />
              <ClinicalField
                label={t("consultations.editor.fields.prescription")}
                name="prescription"
                value={values.prescription}
                readOnly={readOnly}
                onChange={(value) => setValues((current) => ({ ...current, prescription: value }))}
                placeholder={t("consultations.editor.fields.prescriptionPlaceholder")}
              />
              <div className="md:col-span-2">
                <ClinicalField
                  label={t("consultations.editor.fields.recommendations")}
                  name="recommendations"
                  value={values.recommendations}
                  readOnly={readOnly}
                  onChange={(value) => setValues((current) => ({ ...current, recommendations: value }))}
                  placeholder={t("consultations.editor.fields.recommendationsPlaceholder")}
                  rows={3}
                />
              </div>
              <div>
                <Label htmlFor={`follow-up-${appointmentId}`}>{t("consultations.editor.fields.followUpDate")}</Label>
                {readOnly ? (
                  <p className="mt-1.5 text-sm text-foreground">{values.followUpDate || "—"}</p>
                ) : (
                  <Input
                    id={`follow-up-${appointmentId}`}
                    type="date"
                    className="mt-1.5"
                    value={values.followUpDate}
                    onChange={(event) => setValues((current) => ({ ...current, followUpDate: event.target.value }))}
                  />
                )}
              </div>

              {readOnly && (
                <div className="md:col-span-2 border-t border-border pt-3">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-subtle-foreground">
                    {t("clinical.addendum.title")}
                  </p>
                  {addenda.length === 0 ? (
                    <p className="mt-1 text-[13px] text-muted-foreground">{t("clinical.addendum.empty")}</p>
                  ) : (
                    <AddendumList addenda={addenda} />
                  )}
                </div>
              )}

              {error && <p role="alert" className="md:col-span-2 rounded-md bg-danger-muted px-3 py-2 text-[13px] font-medium text-danger">{error}</p>}
            </div>
          )}
        </Modal>
      )}
    </>
  );
}

function ClinicalField({ label, name, value, onChange, placeholder, rows = 4, readOnly = false }: {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  rows?: number;
  readOnly?: boolean;
}) {
  return (
    <div>
      <Label htmlFor={readOnly ? undefined : name}>{label}</Label>
      {readOnly ? (
        <p className="mt-1.5 whitespace-pre-wrap text-sm text-foreground">{value || "—"}</p>
      ) : (
        <Textarea
          id={name}
          className="mt-1.5"
          rows={rows}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
        />
      )}
    </div>
  );
}
