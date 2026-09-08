"use client";

import * as React from "react";
import { ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";

export interface AuditEntryView {
  id: string;
  createdAt: string;
  action: string;
  module: string | null;
  entity: string;
  entityId: string | null;
  userName: string | null;
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

/** Comparação antes/depois: só os campos alterados são guardados e mostrados. */
function DiffTable({ before, after }: { before: unknown; after: unknown }) {
  const b = asRecord(before) ?? {};
  const a = asRecord(after) ?? {};
  const keys = Array.from(new Set([...Object.keys(b), ...Object.keys(a)])).sort();
  if (!keys.length) return <p className="text-[13px] text-muted-foreground">Sem alterações de campos registadas.</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-subtle-foreground">
            <th className="py-1.5 pr-3 font-medium">Campo</th>
            <th className="py-1.5 pr-3 font-medium">Antes</th>
            <th className="py-1.5 font-medium">Depois</th>
          </tr>
        </thead>
        <tbody>
          {keys.map((key) => (
            <tr key={key} className="border-b border-border/60 align-top last:border-0">
              <td className="py-1.5 pr-3 font-mono text-xs">{key}</td>
              <td className="py-1.5 pr-3 break-all text-danger/80">{render(b[key])}</td>
              <td className="py-1.5 break-all text-success">{render(a[key])}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AuditEntryDetail({ entry }: { entry: AuditEntryView }) {
  const [open, setOpen] = React.useState(false);
  const metadata = asRecord(entry.metadata);

  return (
    <>
      <Button variant="ghost" size="icon" aria-label={`Detalhes do evento ${entry.action}`} onClick={() => setOpen(true)}>
        <ChevronRight className="size-4" />
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={entry.action} description={new Date(entry.createdAt).toLocaleString("pt-PT")}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 text-[13px] sm:grid-cols-3">
            <Field label="Utilizador" value={entry.userName ?? "—"} />
            <Field label="Perfil" value={entry.userRole ?? "—"} />
            <Field label="Módulo" value={entry.module ?? "—"} />
            <Field label="Entidade" value={`${entry.entity}${entry.entityId ? ` · ${entry.entityId}` : ""}`} />
            <Field label="Resultado" value={entry.result} />
            <Field label="IP" value={entry.ipAddress ?? "—"} />
            <Field label="Endpoint" value={`${entry.httpMethod ?? ""} ${entry.endpoint ?? "—"}`.trim()} />
            <Field label="Request ID" value={entry.requestId ?? "—"} />
            <Field label="Sessão" value={entry.sessionId ?? "—"} />
          </div>

          {entry.userAgent && (
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-subtle-foreground">User-Agent</p>
              <p className="break-all text-[13px] text-muted-foreground">{entry.userAgent}</p>
            </div>
          )}

          <div>
            <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-subtle-foreground">Alterações</p>
            <DiffTable before={entry.before} after={entry.after} />
          </div>

          {metadata && Object.keys(metadata).length > 0 && (
            <div>
              <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-subtle-foreground">Metadados</p>
              <pre className="overflow-x-auto rounded-md border border-border bg-surface-2/50 p-2.5 text-xs">
                {JSON.stringify(metadata, null, 2)}
              </pre>
            </div>
          )}

          <p className="text-xs text-subtle-foreground">
            Este registo é imutável: a base de dados rejeita qualquer alteração ou eliminação.
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
  if (result === "NEGADO") return <Badge variant="warning">Negado</Badge>;
  if (result === "FALHA") return <Badge variant="danger">Falha</Badge>;
  return <Badge variant="success">Sucesso</Badge>;
}
