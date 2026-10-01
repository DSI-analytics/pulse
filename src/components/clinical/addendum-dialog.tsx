"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Ban, Check, MessageSquarePlus } from "lucide-react";
import type { ClinicalAddendumKind, ClinicalRecordType } from "@prisma/client";
import type { ClinicalAddendumView } from "@/server/clinical-record";
import { ProcessingPulse } from "@/components/processing-pulse";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/toast";
import { addClinicalAddendum, refuteDiagnosis } from "@/server/clinical-actions";
import { useFormat, useT } from "@/i18n/client";

/**
 * Adendas ao prontuário.
 *
 * Um registo clínico não se altera nem se apaga (a base de dados impede-o por
 * gatilho). Quando é preciso corrigir, esclarecer, comentar ou anular, junta-se
 * uma adenda ao registo original — que continua visível, com autor e data.
 * Por isso este ficheiro não tem qualquer acção de editar ou eliminar.
 */

export const ADDENDUM_KINDS = ["ADENDA", "CORRECCAO", "ANULACAO", "COMENTARIO"] as const;

/** Adenda tal como chega do servidor (linha temporal e editor de consulta). */
export type { ClinicalAddendumView };

const KIND_VARIANT: Record<string, "neutral" | "info" | "warning" | "danger"> = {
  ADENDA: "info",
  CORRECCAO: "warning",
  ANULACAO: "danger",
  COMENTARIO: "neutral",
};

/** Lista de adendas de um registo, por ordem de chegada. */
export function AddendumList({ addenda }: { addenda: ClinicalAddendumView[] }) {
  const t = useT();
  const f = useFormat();
  if (!addenda.length) return null;

  return (
    <ul className="mt-2 space-y-1.5 border-l border-border-strong pl-3">
      {addenda.map((addendum) => (
        <li key={addendum.id} className="rounded-md border border-border bg-surface px-2.5 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={KIND_VARIANT[addendum.kind] ?? "neutral"}>
              {t(`clinical.addendum.kinds.${addendum.kind}`)}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {addendum.authorName ?? t("clinical.addendum.authorUnknown")}
              {" · "}
              <time dateTime={addendum.createdAt}>
                {t("clinical.addendum.createdAt", {
                  date: `${f.dateMedium(addendum.createdAt)}, ${f.time(addendum.createdAt)}`,
                })}
              </time>
            </span>
          </div>
          <p className="mt-1 whitespace-pre-wrap text-[13px] text-foreground">{addendum.body}</p>
        </li>
      ))}
    </ul>
  );
}

/**
 * Botão + folha para acrescentar uma adenda/comentário a um registo clínico.
 *
 * `onSaved` recebe a adenda acabada de gravar para que a lista aberta no
 * cliente a mostre sem recarregar a página inteira.
 */
export function AddendumButton({
  patientId,
  targetType,
  targetId,
  defaultKind = "ADENDA",
  label,
  variant = "ghost",
  size = "sm",
  onSaved,
}: {
  patientId: string;
  targetType: ClinicalRecordType;
  targetId: string;
  defaultKind?: ClinicalAddendumKind;
  label?: string;
  variant?: "ghost" | "secondary" | "outline";
  size?: "sm" | "default";
  onSaved?: (addendum: ClinicalAddendumView) => void;
}) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const fieldId = React.useId();
  const [open, setOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [kind, setKind] = React.useState<ClinicalAddendumKind>(defaultKind);
  const [body, setBody] = React.useState("");

  async function submit() {
    if (!body.trim()) return setError(t("common.requiredField", { field: t("clinical.addendum.body") }));
    setError(null);
    setSaving(true);
    const result = await addClinicalAddendum({ patientId, targetType, targetId, kind, body });
    setSaving(false);
    if ("error" in result) return setError(result.error);
    toast(t("clinical.addendum.saved"));
    onSaved?.({
      id: result.id,
      kind,
      body: body.trim(),
      authorName: null,
      createdAt: new Date().toISOString(),
    });
    setBody("");
    setKind(defaultKind);
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button type="button" variant={variant} size={size} onClick={() => setOpen(true)}>
        <MessageSquarePlus className="size-4" /> {label ?? t("clinical.addendum.label")}
      </Button>
      {open && (
        <Modal
          open
          onClose={() => !saving && setOpen(false)}
          className="max-w-xl"
          title={t("clinical.addendum.title")}
          description={t("clinical.addendum.description")}
          footer={
            <>
              <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
                {t("common.cancel")}
              </Button>
              <Button onClick={submit} disabled={saving}>
                {saving ? <ProcessingPulse /> : <Check className="size-4" />} {t("clinical.addendum.submit")}
              </Button>
            </>
          }
        >
          <div className="space-y-3">
            <p className="rounded-[10px] border border-border bg-fill-subtle px-3 py-2 text-[13px] text-muted-foreground">
              {t("clinical.immutable.addendumHint")}
            </p>
            <div>
              <Label htmlFor={`${fieldId}-kind`}>{t("clinical.addendum.kindLabel")}</Label>
              <Select
                id={`${fieldId}-kind`}
                className="mt-1.5"
                value={kind}
                onChange={(event) => setKind(event.target.value as ClinicalAddendumKind)}
              >
                {ADDENDUM_KINDS.map((value) => (
                  <option key={value} value={value}>
                    {t(`clinical.addendum.kinds.${value}`)}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor={`${fieldId}-body`}>
                {t("clinical.addendum.body")}
                <span className="text-danger"> *</span>
              </Label>
              <Textarea
                id={`${fieldId}-body`}
                className="mt-1.5"
                rows={5}
                value={body}
                onChange={(event) => setBody(event.target.value)}
                placeholder={t("clinical.addendum.bodyPlaceholder")}
              />
            </div>
            {error && (
              <p role="alert" className="rounded-md bg-danger-muted px-3 py-2 text-[13px] font-medium text-danger">
                {error}
              </p>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}

/**
 * Anulação de um diagnóstico.
 *
 * O diagnóstico não é apagado: fica marcado como refutado e a razão passa a ser
 * uma adenda de anulação, visível no histórico.
 */
export function RefuteDiagnosisButton({
  diagnosisId,
  disabled = false,
}: {
  diagnosisId: string;
  disabled?: boolean;
}) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const fieldId = React.useId();
  const [open, setOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [reason, setReason] = React.useState("");

  async function submit() {
    if (!reason.trim()) return setError(t("common.requiredField", { field: t("clinical.addendum.body") }));
    setError(null);
    setSaving(true);
    const result = await refuteDiagnosis(diagnosisId, reason);
    setSaving(false);
    if ("error" in result) return setError(result.error);
    toast(t("clinical.addendum.refuted"));
    setReason("");
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => setOpen(true)}>
        <Ban className="size-4" /> {t("clinical.addendum.refuteTitle")}
      </Button>
      {open && (
        <Modal
          open
          onClose={() => !saving && setOpen(false)}
          className="max-w-md"
          title={t("clinical.addendum.refuteTitle")}
          description={t("clinical.addendum.refuteDescription")}
          footer={
            <>
              <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
                {t("common.cancel")}
              </Button>
              <Button variant="danger" onClick={submit} disabled={saving}>
                {saving ? <ProcessingPulse /> : <Ban className="size-4" />} {t("clinical.addendum.refuteSubmit")}
              </Button>
            </>
          }
        >
          <div className="space-y-3">
            <Label htmlFor={`${fieldId}-reason`}>
              {t("clinical.addendum.body")}
              <span className="text-danger"> *</span>
            </Label>
            <Textarea
              id={`${fieldId}-reason`}
              rows={4}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder={t("clinical.addendum.bodyPlaceholder")}
            />
            {error && (
              <p role="alert" className="rounded-md bg-danger-muted px-3 py-2 text-[13px] font-medium text-danger">
                {error}
              </p>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
