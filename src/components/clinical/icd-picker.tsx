"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, CloudOff, Plus, Search, Stethoscope, X } from "lucide-react";
import { ProcessingPulse } from "@/components/processing-pulse";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/toast";
import { addDiagnosis } from "@/server/clinical-actions";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";

/**
 * Selecção de diagnóstico pela CID-11 (ICD-11) da OMS.
 *
 * O texto do diagnóstico nunca é escrito à mão: o título é exactamente o que a
 * classificação devolve e só o campo de notas aceita texto livre. A pesquisa é
 * atrasada (300 ms), tem mínimo de 2 caracteres e cancela o pedido anterior,
 * pelo que escrever depressa não gera uma fila de chamadas à OMS.
 *
 * A lista abre em linha (não flutua): dentro de uma folha modal com deslocação
 * própria, uma camada absoluta seria cortada pelo contentor.
 */

/** Resultado devolvido por `GET /api/icd11/search`. */
export interface IcdHit {
  code: string;
  title: string;
  uri: string | null;
  chapter: string | null;
  release: string;
  source: "who" | "cache";
}

/** Diagnóstico escolhido, tal como viaja para o servidor. */
export interface IcdSelection {
  code: string;
  title: string;
  uri?: string;
  release?: string;
  chapter?: string;
}

const MIN_CHARS = 2;
const DEBOUNCE_MS = 300;

type SearchState = "idle" | "searching" | "ok" | "error";

function toSelection(hit: IcdHit): IcdSelection {
  return {
    code: hit.code,
    title: hit.title,
    uri: hit.uri ?? undefined,
    release: hit.release || undefined,
    chapter: hit.chapter ?? undefined,
  };
}

/**
 * Campo de pesquisa/selecção CID-11.
 *
 * - `value` + `onChange` para escolha única (mostra a escolha em cápsula);
 * - `clearOnSelect` para listas múltiplas: devolve a escolha ao pai, limpa-se e
 *   fica pronto para a seguinte (o pai desenha a lista).
 */
export function IcdPicker({
  id,
  value = null,
  onChange,
  disabled = false,
  clearOnSelect = false,
  invalid = false,
}: {
  id?: string;
  value?: IcdSelection | null;
  onChange: (value: IcdSelection | null) => void;
  disabled?: boolean;
  clearOnSelect?: boolean;
  invalid?: boolean;
}) {
  const t = useT();
  const generatedId = React.useId();
  const fieldId = id ?? `icd-${generatedId}`;
  const listId = `${fieldId}-listbox`;
  const helpId = `${fieldId}-help`;

  const [query, setQuery] = React.useState("");
  const [hits, setHits] = React.useState<IcdHit[]>([]);
  const [state, setState] = React.useState<SearchState>("idle");
  const [errorText, setErrorText] = React.useState<string | null>(null);
  const [degraded, setDegraded] = React.useState(false);
  const [active, setActive] = React.useState(0);
  const [open, setOpen] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // A pesquisa só arranca depois de 300 ms parados; o pedido anterior é
  // cancelado. O estado "a pesquisar" é marcado no próprio `onChange` — dentro
  // do efeito provocaria uma cascata de renderizações.
  React.useEffect(() => {
    const term = query.trim();
    if (term.length < MIN_CHARS) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/icd11/search?q=${encodeURIComponent(term)}`, {
          signal: controller.signal,
          headers: { accept: "application/json" },
        });
        if (!response.ok) {
          // O servidor já devolve a mensagem traduzida (integração por
          // configurar, limite de pedidos…); sem corpo, fica a mensagem geral.
          const body = (await response.json().catch(() => null)) as { error?: string } | null;
          setHits([]);
          setDegraded(false);
          setErrorText(body?.error || null);
          setState("error");
          return;
        }
        const data = (await response.json()) as { hits?: IcdHit[]; degraded?: boolean };
        setHits(Array.isArray(data.hits) ? data.hits : []);
        setDegraded(Boolean(data.degraded));
        setActive(0);
        setErrorText(null);
        setState("ok");
      } catch (error) {
        if ((error as Error | null)?.name === "AbortError") return;
        setHits([]);
        setDegraded(false);
        setErrorText(null);
        setState("error");
      }
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const choose = React.useCallback(
    (hit: IcdHit) => {
      onChange(toSelection(hit));
      setQuery("");
      setHits([]);
      setErrorText(null);
      setState("idle");
      setOpen(false);
      setActive(0);
      if (clearOnSelect) inputRef.current?.focus();
    },
    [clearOnSelect, onChange],
  );

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (!hits.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActive((current) => (current + 1) % hits.length);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setActive((current) => (current - 1 + hits.length) % hits.length);
      return;
    }
    if (event.key === "Enter") {
      const hit = hits[active];
      if (!hit) return;
      event.preventDefault();
      choose(hit);
    }
  }

  const listOpen = open && state !== "idle" && query.trim().length >= MIN_CHARS;
  const chosen = !clearOnSelect && value;

  if (chosen) {
    return (
      <div className="space-y-1.5">
        <div className="flex items-start gap-2 rounded-[12px] border border-primary-edge bg-primary-muted px-3 py-2">
          <Stethoscope className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block font-mono text-[13px] font-semibold text-primary">{value.code}</span>
            <span className="block text-sm font-medium text-foreground">{value.title}</span>
          </span>
          {!disabled && (
            <button
              type="button"
              onClick={() => onChange(null)}
              aria-label={t("clinical.icd.clear")}
              className="press flex size-7 shrink-0 items-center justify-center rounded-full bg-fill-strong text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {t("clinical.icd.chosen")}
          {value.release ? ` · ${value.release}` : ""}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle-foreground" aria-hidden />
        <Input
          ref={inputRef}
          id={fieldId}
          type="text"
          role="combobox"
          autoComplete="off"
          disabled={disabled}
          className="pl-9"
          value={query}
          placeholder={t("clinical.icd.placeholder")}
          aria-expanded={listOpen}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-describedby={helpId}
          aria-invalid={invalid || undefined}
          aria-activedescendant={listOpen && hits[active] ? `${listId}-${active}` : undefined}
          onChange={(event) => {
            const next = event.target.value;
            setQuery(next);
            setOpen(true);
            if (next.trim().length < MIN_CHARS) {
              setHits([]);
              setDegraded(false);
              setErrorText(null);
              setState("idle");
            } else {
              setState("searching");
            }
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
      </div>

      {listOpen && (
        <div
          id={listId}
          role="listbox"
          aria-label={t("clinical.icd.label")}
          className="max-h-64 overflow-y-auto overscroll-contain rounded-[12px] border border-border bg-surface p-1 shadow-pop"
        >
          {state === "searching" && (
            <p className="flex items-center gap-2 px-3 py-3 text-[13px] text-muted-foreground">
              <ProcessingPulse className="text-primary" /> {t("clinical.icd.searching")}
            </p>
          )}
          {state === "error" &&
            (errorText === t("clinical.icd.notConfigured") ? (
              <p role="alert" className="px-3 py-3 text-[13px] font-medium text-warning">
                {t("clinical.icd.notConfigured")}
              </p>
            ) : (
              <p role="alert" className="px-3 py-3 text-[13px] font-medium text-danger">
                {errorText ?? t("clinical.icd.searchError")}
              </p>
            ))}
          {state === "ok" && hits.length === 0 && (
            <p className="px-3 py-3 text-[13px] text-muted-foreground">{t("clinical.icd.noResults")}</p>
          )}
          {state === "ok" &&
            hits.map((hit, index) => (
              <button
                key={`${hit.code}-${index}`}
                id={`${listId}-${index}`}
                type="button"
                role="option"
                aria-selected={index === active}
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(hit)}
                className={cn(
                  "flex w-full items-start gap-3 rounded-[10px] px-3 py-2 text-left transition-colors duration-150",
                  index === active ? "bg-fill-strong" : "hover:bg-fill",
                )}
              >
                <span className="mt-0.5 shrink-0 font-mono text-[13px] font-semibold text-primary">{hit.code}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-foreground">{hit.title}</span>
                  {hit.chapter && <span className="block truncate text-xs text-muted-foreground">{hit.chapter}</span>}
                </span>
              </button>
            ))}
        </div>
      )}

      {degraded && state === "ok" && (
        <p className="flex items-start gap-2 rounded-[10px] border border-warning-edge bg-warning-muted px-3 py-2 text-xs font-medium text-warning">
          <CloudOff className="mt-px size-3.5 shrink-0" aria-hidden />
          <span>
            {t("clinical.icd.offline")} <span className="font-normal">{t("clinical.icd.offlineHint")}</span>
          </span>
        </p>
      )}

      <p id={helpId} className="text-xs text-muted-foreground">
        {t("clinical.icd.help")}
      </p>
    </div>
  );
}

const DIAGNOSIS_KINDS = ["PRINCIPAL", "SECUNDARIO", "DIFERENCIAL"] as const;
const DIAGNOSIS_CERTAINTIES = ["PROVISORIO", "CONFIRMADO"] as const;

/**
 * Registo de um diagnóstico novo.
 *
 * Substitui o formulário genérico: o diagnóstico vem da CID-11 e o médico só
 * escreve texto livre no campo de notas. O `patientId` é revalidado no
 * servidor (clínica, permissão e paciente activo) antes de gravar.
 */
export function DiagnosisButton({ patientId }: { patientId: string }) {
  const t = useT();
  const router = useRouter();
  const toast = useToast();
  const fieldId = React.useId();
  const [open, setOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [choice, setChoice] = React.useState<IcdSelection | null>(null);
  const [kind, setKind] = React.useState<string>("PRINCIPAL");
  const [certainty, setCertainty] = React.useState<string>("PROVISORIO");
  const [onsetDate, setOnsetDate] = React.useState("");
  const [notes, setNotes] = React.useState("");

  function reset() {
    setChoice(null);
    setKind("PRINCIPAL");
    setCertainty("PROVISORIO");
    setOnsetDate("");
    setNotes("");
    setError(null);
  }

  async function submit() {
    if (!choice) return setError(t("clinical.icd.required"));
    setError(null);
    setSaving(true);
    // Objecto em variável (não literal): o servidor aceita os campos do código
    // CID-11 acrescentados pela integração.
    const values = {
      patientId,
      title: choice.title,
      code: choice.code,
      codeSystem: "ICD-11",
      codeUri: choice.uri ?? "",
      codeRelease: choice.release ?? "",
      kind: kind as (typeof DIAGNOSIS_KINDS)[number],
      certainty: certainty as (typeof DIAGNOSIS_CERTAINTIES)[number],
      onsetDate,
      notes,
    };
    const result = await addDiagnosis(values);
    setSaving(false);
    if ("error" in result) return setError(result.error);
    toast(t("common.savedWithTitle", { title: t("clinical.record.diagnosis.title") }));
    setOpen(false);
    reset();
    router.refresh();
  }

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <Plus className="size-4" /> {t("clinical.record.diagnosis.label")}
      </Button>
      {open && (
        <Modal
          open
          onClose={() => !saving && setOpen(false)}
          title={t("clinical.record.diagnosis.title")}
          description={t("clinical.record.diagnosis.description")}
          footer={
            <>
              <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
                {t("common.cancel")}
              </Button>
              <Button onClick={submit} disabled={saving}>
                {saving ? <ProcessingPulse /> : <Check className="size-4" />} {t("common.save")}
              </Button>
            </>
          }
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label htmlFor={`${fieldId}-icd`}>
                {t("clinical.icd.label")}
                <span className="text-danger"> *</span>
              </Label>
              <div className="mt-1.5">
                <IcdPicker id={`${fieldId}-icd`} value={choice} onChange={setChoice} invalid={Boolean(error) && !choice} />
              </div>
            </div>
            <div>
              <Label htmlFor={`${fieldId}-kind`}>{t("clinical.icd.kind")}</Label>
              <Select id={`${fieldId}-kind`} className="mt-1.5" value={kind} onChange={(event) => setKind(event.target.value)}>
                {DIAGNOSIS_KINDS.map((value) => (
                  <option key={value} value={value}>
                    {t(`clinical.record.diagnosis.kinds.${value}`)}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor={`${fieldId}-certainty`}>{t("clinical.icd.certainty")}</Label>
              <Select
                id={`${fieldId}-certainty`}
                className="mt-1.5"
                value={certainty}
                onChange={(event) => setCertainty(event.target.value)}
              >
                {DIAGNOSIS_CERTAINTIES.map((value) => (
                  <option key={value} value={value}>
                    {t(`clinical.record.diagnosis.certainties.${value}`)}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor={`${fieldId}-onset`}>{t("clinical.record.diagnosis.onset")}</Label>
              <Input
                id={`${fieldId}-onset`}
                className="mt-1.5"
                type="date"
                value={onsetDate}
                onChange={(event) => setOnsetDate(event.target.value)}
              />
            </div>
            <div className="col-span-2">
              <Label htmlFor={`${fieldId}-notes`}>{t("clinical.record.diagnosis.notes")}</Label>
              <Textarea
                id={`${fieldId}-notes`}
                className="mt-1.5"
                rows={3}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </div>
          </div>
          {error && (
            <p role="alert" className="mt-3 rounded-md bg-danger-muted px-3 py-2 text-[13px] font-medium text-danger">
              {error}
            </p>
          )}
        </Modal>
      )}
    </>
  );
}
