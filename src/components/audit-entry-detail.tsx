"use client";

import * as React from "react";
import { ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { useFormat, useT } from "@/i18n/client";
import type { Translator } from "@/i18n/translate";

export interface AuditEntryView {
  id: string;
  createdAt: string;
  /** Identificador guardado (não se traduz), ex.: "clinic.update". */
  action: string;
  /** Nome legível da acção no idioma activo (ou o identificador). */
  actionLabel: string;
  module: string | null;
  moduleLabel: string | null;
  entity: string;
  entityId: string | null;
  userName: string | null;
  /** Perfil já traduzido (ou o código guardado). */
  userRole: string | null;
  result: string;
  ipAddress: string | null;
  userAgent: string | null;
  sessionId: string | null;
  requestId: string | null;
  endpoint: string | null;
  httpMethod: string | null;
  before: unknown;
  after: unknown;
  metadata: unknown;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function render(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function resultLabel(t: Translator, result: string): string {
  if (result === "NEGADO") return t("audit.results.NEGADO");
  if (result === "FALHA") return t("audit.results.FALHA");
  if (result === "SUCESSO") return t("audit.results.SUCESSO");
  return result;
}

/** Comparação antes/depois: só os campos alterados são guardados e mostrados. */
function DiffTable({ before, after }: { before: unknown; after: unknown }) {
  const t = useT();
  const b = asRecord(before) ?? {};
  const a = asRecord(after) ?? {};
  const keys = Array.from(new Set([...Object.keys(b), ...Object.keys(a)])).sort();
  if (!keys.length) return <p className="text-[13px] text-muted-foreground">{t("audit.detail.noChanges")}</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-subtle-foreground">
            <th className="py-1.5 pr-3 font-medium">{t("audit.detail.field")}</th>
            <th className="py-1.5 pr-3 font-medium">{t("audit.detail.before")}</th>
            <th className="py-1.5 font-medium">{t("audit.detail.after")}</th>
          </tr>
        </thead>
        <tbody>
          {keys.map((key) => (
            <tr key={key} className="border-b border-border align-top last:border-0">
              <td className="py-1.5 pr-3 font-mono text-xs">{key}</td>
              <td className="py-1.5 pr-3 break-all text-danger">{render(b[key])}</td>
              <td className="py-1.5 break-all text-success">{render(a[key])}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AuditEntryDetail({ entry }: { entry: AuditEntryView }) {
  const t = useT();
  const f = useFormat();
  const [open, setOpen] = React.useState(false);
  const metadata = asRecord(entry.metadata);

  return (
    <>
      <Button variant="ghost" size="icon" aria-label={t("audit.detail.open", { action: entry.actionLabel })} onClick={() => setOpen(true)}>
        <ChevronRight className="size-4" />
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={entry.actionLabel} description={f.dateTime(entry.createdAt)}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 text-[13px] sm:grid-cols-3">
            <Field label={t("audit.detail.user")} value={entry.userName ?? "—"} />
            <Field label={t("audit.detail.role")} value={entry.userRole ?? "—"} />
            <Field label={t("audit.detail.module")} value={entry.moduleLabel ?? "—"} />
            <Field label={t("audit.detail.entity")} value={`${entry.entity}${entry.entityId ? ` · ${entry.entityId}` : ""}`} />
            <Field label={t("audit.detail.result")} value={resultLabel(t, entry.result)} />
            <Field label={t("audit.detail.ip")} value={entry.ipAddress ?? "—"} />
            <Field label={t("audit.detail.endpoint")} value={`${entry.httpMethod ?? ""} ${entry.endpoint ?? "—"}`.trim()} />
            <Field label={t("audit.detail.requestId")} value={entry.requestId ?? "—"} />
            <Field label={t("audit.detail.session")} value={entry.sessionId ?? "—"} />
          </div>

          {entry.userAgent && (
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-subtle-foreground">{t("audit.detail.userAgent")}</p>
              <p className="break-all text-[13px] text-muted-foreground">{entry.userAgent}</p>
            </div>
          )}

          <div>
            <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-subtle-foreground">{t("audit.detail.changes")}</p>
            <DiffTable before={entry.before} after={entry.after} />
          </div>

          {metadata && Object.keys(metadata).length > 0 && (
            <div>
              <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-subtle-foreground">{t("audit.detail.metadata")}</p>
              <pre className="overflow-x-auto rounded-md border border-border bg-fill-subtle p-2.5 text-xs">
                {JSON.stringify(metadata, null, 2)}
              </pre>
            </div>
          )}

          <p className="text-xs text-subtle-foreground">
            {t("audit.detail.immutable")}
          </p>
        </div>
      </Modal>
    </>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wide text-subtle-foreground">{label}</p>
      <p className="break-all font-medium">{value}</p>
    </div>
  );
}

export function AuditResultBadge({ result }: { result: string }) {
  const t = useT();
  if (result === "NEGADO") return <Badge variant="warning">{t("audit.results.NEGADO")}</Badge>;
  if (result === "FALHA") return <Badge variant="danger">{t("audit.results.FALHA")}</Badge>;
  return <Badge variant="success">{t("audit.results.SUCESSO")}</Badge>;
}
