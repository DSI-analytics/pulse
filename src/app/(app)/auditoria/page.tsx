import Link from "next/link";
import { ScrollText, ShieldCheck } from "lucide-react";
import type { AuditResult } from "@prisma/client";
import { requirePermission } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { ListFilters } from "@/components/list-filters";
import { AuditEntryDetail, AuditResultBadge, type AuditEntryView } from "@/components/audit-entry-detail";
import { getAuditFilterOptions, getAuditPage } from "@/server/audit-log";
import { formatDateShort, formatTime } from "@/lib/datetime";

const RESULTS: AuditResult[] = ["SUCESSO", "FALHA", "NEGADO"];

function parseDay(value: string | undefined, endOfDay = false): Date | null {
  if (!value) return null;
  const date = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export default async function AuditoriaPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string; utilizador?: string; accao?: string; modulo?: string; entidade?: string;
    resultado?: string; ip?: string; de?: string; ate?: string; pagina?: string;
  }>;
}) {
  // Por omissão, apenas o Administrador do Sistema tem `audit.view` (ver lib/rbac.ts).
  const user = await requirePermission("audit.view");
  const sp = await searchParams;

  const page = Math.max(1, Number.parseInt(sp.pagina ?? "1", 10) || 1);
  const result = RESULTS.includes(sp.resultado as AuditResult) ? (sp.resultado as AuditResult) : undefined;

  const [data, options] = await Promise.all([
    getAuditPage(user.clinicId, {
      q: sp.q,
      userId: sp.utilizador,
      action: sp.accao,
      module: sp.modulo,
      entity: sp.entidade,
      result,
      ip: sp.ip,
      from: parseDay(sp.de),
      to: parseDay(sp.ate, true),
      page,
    }),
    getAuditFilterOptions(user.clinicId),
  ]);

  const pageHref = (n: number) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(sp)) if (value && key !== "pagina") params.set(key, value);
    if (n > 1) params.set("pagina", String(n));
    const qs = params.toString();
    return qs ? `/auditoria?${qs}` : "/auditoria";
  };

  const entries: AuditEntryView[] = data.entries.map((e) => ({
    id: e.id,
    createdAt: e.createdAt.toISOString(),
    action: e.action,
    module: e.module,
    entity: e.entity,
    entityId: e.entityId,
    userName: e.userName,
    userRole: e.userRole,
    result: e.result,
    ipAddress: e.ipAddress,
    userAgent: e.userAgent,
    sessionId: e.sessionId,
    requestId: e.requestId,
    endpoint: e.endpoint,
    httpMethod: e.httpMethod,
    before: e.before,
    after: e.after,
    metadata: e.metadata,
  }));

  return (
    <>
      <PageHeader
        eyebrow="Sistema"
        title="Auditoria"
        description={`${data.total.toLocaleString("pt-PT")} eventos registados · acesso restrito a administradores`}
      />

      <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-2/50 px-4 py-2.5 text-[13px] text-muted-foreground">
        <ShieldCheck className="size-4 text-primary" aria-hidden />
        Registo append-only: a base de dados rejeita alterações e eliminações, incluindo as feitas pela própria aplicação.
      </div>

      <ListFilters
        action="/auditoria"
        fields={[
          { name: "q", label: "Pesquisar", value: sp.q, type: "search", placeholder: "Acção, entidade, utilizador, request id…" },
          { name: "utilizador", label: "Utilizador", value: sp.utilizador, options: options.users.map((u) => ({ value: u.id, label: u.name })) },
          { name: "accao", label: "Acção", value: sp.accao, options: options.actions.map((a) => ({ value: a, label: a })) },
          { name: "modulo", label: "Módulo", value: sp.modulo, options: options.modules.map((m) => ({ value: m, label: m })) },
          { name: "entidade", label: "Entidade", value: sp.entidade, options: options.entities.map((e) => ({ value: e, label: e })) },
          { name: "resultado", label: "Resultado", value: sp.resultado, options: RESULTS.map((r) => ({ value: r, label: r })) },
          { name: "ip", label: "IP", value: sp.ip, type: "search", placeholder: "IP" },
          { name: "de", label: "De", value: sp.de, type: "date" },
          { name: "ate", label: "Até", value: sp.ate, type: "date" },
        ]}
      />

      <Card>
        {entries.length === 0 ? (
          <div className="p-6">
            <EmptyState icon={ScrollText} title="Sem eventos" description="Nenhum registo de auditoria corresponde a estes filtros." />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Utilizador</TableHead>
                <TableHead>Acção</TableHead>
                <TableHead>Entidade</TableHead>
                <TableHead>Resultado</TableHead>
                <TableHead>IP</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="whitespace-nowrap text-[13px]">
                    {formatDateShort(entry.createdAt)} · {formatTime(entry.createdAt)}
                  </TableCell>
                  <TableCell className="text-[13px]">
                    <span className="font-medium">{entry.userName ?? "sistema"}</span>
                    {entry.userRole && <span className="block text-xs text-muted-foreground">{entry.userRole}</span>}
                  </TableCell>
                  <TableCell className="font-mono text-[13px]">
                    {entry.action}
                    {entry.module && <span className="block text-xs text-muted-foreground">{entry.module}</span>}
                  </TableCell>
                  <TableCell className="text-[13px]">
                    {entry.entity}
                    {entry.entityId && <span className="block font-mono text-xs text-muted-foreground">{entry.entityId}</span>}
                  </TableCell>
                  <TableCell><AuditResultBadge result={entry.result} /></TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{entry.ipAddress ?? "—"}</TableCell>
                  <TableCell className="text-right"><AuditEntryDetail entry={entry} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {data.totalPages > 1 && (
        <nav className="flex items-center justify-between gap-3 text-sm" aria-label="Paginação da auditoria">
          <span className="text-muted-foreground">Página {data.page} de {data.totalPages}</span>
          <div className="flex gap-2">
            {data.page > 1 && (
              <Link href={pageHref(data.page - 1)} className="rounded-md border border-border px-3 py-1.5 hover:bg-surface-2">Anterior</Link>
            )}
            {data.page < data.totalPages && (
              <Link href={pageHref(data.page + 1)} className="rounded-md border border-border px-3 py-1.5 hover:bg-surface-2">Seguinte</Link>
            )}
          </div>
        </nav>
      )}
    </>
  );
}
