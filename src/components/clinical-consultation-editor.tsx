"use client";

import * as React from "react";
import { Check, ClipboardPlus, FilePenLine, Loader2, Save } from "lucide-react";
import type { AppointmentStatus } from "@prisma/client";
import { useRouter } from "next/navigation";
import { getConsultationEditor, saveConsultation, type ConsultationValues } from "@/server/consultation-actions";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/i18n/client";

const EMPTY: ConsultationValues = {
  subjective: "",
  notes: "",
  diagnosis: "",
  prescription: "",
  recommendations: "",
  followUpDate: "",
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
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [values, setValues] = React.useState<ConsultationValues>(EMPTY);
  const [patientName, setPatientName] = React.useState("");
  const [doctorName, setDoctorName] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  async function show() {
    setOpen(true);
    setLoading(true);
    setError(null);
    const result = await getConsultationEditor(appointmentId);
    setLoading(false);
    if ("error" in result) return setError(result.error);
    setValues(result.values);
    setPatientName(result.patientName);
    setDoctorName(result.doctorName);
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

  const completed = status === "CONCLUIDA";

  return (
    <>
      <Button variant={completed || compact ? "secondary" : "default"} size="sm" onClick={show}>
        {completed ? <FilePenLine /> : <ClipboardPlus />}
        {completed ? t("consultations.editor.editRecord") : compact ? t("consultations.editor.open") : t("consultations.editor.register")}
      </Button>
      {open && (
        <Modal
          open
          onClose={() => !saving && setOpen(false)}
          className="max-w-3xl"
          title={completed ? t("consultations.editor.editTitle") : t("consultations.editor.title")}
          description={patientName ? `${patientName} · ${doctorName}` : t("consultations.editor.loading")}
          footer={!loading ? (
            <>
              <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>{t("common.cancel")}</Button>
              <Button variant="secondary" onClick={() => submit(false)} disabled={saving}>
                {saving ? <Loader2 className="animate-spin" /> : <Save />} {t("consultations.editor.save")}
              </Button>
              {!completed && (
                <Button onClick={() => submit(true)} disabled={saving}>
                  {saving ? <Loader2 className="animate-spin" /> : <Check />} {t("consultations.editor.saveAndComplete")}
                </Button>
              )}
            </>
          ) : undefined}
        >
          {loading ? (
            <div className="flex min-h-52 items-center justify-center"><Loader2 className="size-6 animate-spin text-primary" /></div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              <ClinicalField label={t("consultations.editor.fields.subjective")} name="subjective" value={values.subjective} onChange={(value) => setValues((current) => ({ ...current, subjective: value }))} placeholder={t("consultations.editor.fields.subjectivePlaceholder")} />
              <ClinicalField label={t("consultations.editor.fields.diagnosis")} name="diagnosis" value={values.diagnosis} onChange={(value) => setValues((current) => ({ ...current, diagnosis: value }))} placeholder={t("consultations.editor.fields.diagnosisPlaceholder")} />
              <ClinicalField label={t("consultations.editor.fields.notes")} name="notes" value={values.notes} onChange={(value) => setValues((current) => ({ ...current, notes: value }))} placeholder={t("consultations.editor.fields.notesPlaceholder")} />
              <ClinicalField label={t("consultations.editor.fields.prescription")} name="prescription" value={values.prescription} onChange={(value) => setValues((current) => ({ ...current, prescription: value }))} placeholder={t("consultations.editor.fields.prescriptionPlaceholder")} />
              <div className="md:col-span-2"><ClinicalField label={t("consultations.editor.fields.recommendations")} name="recommendations" value={values.recommendations} onChange={(value) => setValues((current) => ({ ...current, recommendations: value }))} placeholder={t("consultations.editor.fields.recommendationsPlaceholder")} rows={3} /></div>
              <div>
                <Label htmlFor={`follow-up-${appointmentId}`}>{t("consultations.editor.fields.followUpDate")}</Label>
                <Input id={`follow-up-${appointmentId}`} type="date" className="mt-1.5" value={values.followUpDate} onChange={(event) => setValues((current) => ({ ...current, followUpDate: event.target.value }))} />
              </div>
              {error && <p className="md:col-span-2 rounded-md bg-danger-muted px-3 py-2 text-[13px] font-medium text-danger">{error}</p>}
            </div>
          )}
        </Modal>
      )}
    </>
  );
}

function ClinicalField({ label, name, value, onChange, placeholder, rows = 4 }: {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  rows?: number;
}) {
  return (
    <div>
      <Label htmlFor={name}>{label}</Label>
      <Textarea id={name} className="mt-1.5" rows={rows} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </div>
  );
}
