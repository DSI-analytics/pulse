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
import { getFormatters, getTranslator } from "@/i18n/server";
import type { Translator } from "@/i18n/translate";
import type { MessageKey } from "@/i18n/types";

const RESULTS = ["SUCESSO", "FALHA", "NEGADO"] as const satisfies readonly AuditResult[];

function parseDay(value: string | undefined, endOfDay = false): Date | null {
  if (!value) return null;
  const date = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Tradução opcional: devolve `fallback` quando a chave não existe no dicionário. */
function labelOr(t: Translator, key: string, fallback: string): string {
  const value = t(key as MessageKey);
  return value === key ? fallback : value;
}

/** Nome legível de uma acção guardada ("clinic.update"); o identificador não se traduz. */
function actionLabel(t: Translator, action: string): string {
  return labelOr(t, `audit.actions.${action.replace(/\./g, "_")}`, action);
}

function moduleLabel(t: Translator, module: string): string {
  return labelOr(t, `audit.modules.${module}`, module);
}

export async function generateMetadata() {
  const t = await getTranslator();
  return { title: t("audit.title") };
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
  const [t, f] = await Promise.all([getTranslator(), getFormatters()]);
  const sp = await searchParams;

  const page = Math.max(1, Number.parseInt(sp.pagina ?? "1", 10) || 1);
  const result = (RESULTS as readonly string[]).includes(sp.resultado ?? "")
    ? (sp.resultado as (typeof RESULTS)[number])
    : undefined;

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
    actionLabel: actionLabel(t, e.action),
    module: e.module,
    moduleLabel: e.module ? moduleLabel(t, e.module) : null,
    entity: e.entity,
    entityId: e.entityId,
    userName: e.userName,
    userRole: e.userRole ? labelOr(t, `roles.${e.userRole}`, e.userRole) : null,
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
        eyebrow={t("audit.eyebrow")}
        title={t("audit.title")}
        description={t("audit.description", { count: f.number(data.total) })}
      />

      <div className="flex items-center gap-2 rounded-lg border border-border bg-fill-subtle px-4 py-2.5 text-[13px] text-muted-foreground">
        <ShieldCheck className="size-4 text-primary" aria-hidden />
        {t("audit.appendOnly")}
      </div>

      <ListFilters
        action="/auditoria"
        fields={[
          { name: "q", label: t("audit.filters.search"), value: sp.q, type: "search", placeholder: t("audit.filters.searchPlaceholder") },
          { name: "utilizador", label: t("audit.filters.user"), value: sp.utilizador, options: options.users.map((u) => ({ value: u.id, label: u.name })) },
          { name: "accao", label: t("audit.filters.action"), value: sp.accao, options: options.actions.map((a) => ({ value: a, label: actionLabel(t, a) })) },
          { name: "modulo", label: t("audit.filters.module"), value: sp.modulo, options: options.modules.map((m) => ({ value: m, label: moduleLabel(t, m) })) },
          { name: "entidade", label: t("audit.filters.entity"), value: sp.entidade, options: options.entities.map((e) => ({ value: e, label: e })) },
          { name: "resultado", label: t("audit.filters.result"), value: sp.resultado, options: RESULTS.map((r) => ({ value: r, label: t(`audit.resultOptions.${r}`) })) },
          { name: "ip", label: t("audit.filters.ip"), value: sp.ip, type: "search", placeholder: t("audit.filters.ip") },
          { name: "de", label: t("audit.filters.from"), value: sp.de, type: "date" },
          { name: "ate", label: t("audit.filters.to"), value: sp.ate, type: "date" },
        ]}
      />

      <Card>
        {entries.length === 0 ? (
          <div className="p-6">
            <EmptyState icon={ScrollText} title={t("audit.empty.title")} description={t("audit.empty.description")} />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("audit.columns.date")}</TableHead>
                <TableHead>{t("audit.columns.user")}</TableHead>
                <TableHead>{t("audit.columns.action")}</TableHead>
                <TableHead>{t("audit.columns.entity")}</TableHead>
                <TableHead>{t("audit.columns.result")}</TableHead>
                <TableHead>{t("audit.columns.ip")}</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="whitespace-nowrap text-[13px]">
                    {f.date(entry.createdAt)} · {f.time(entry.createdAt)}
                  </TableCell>
                  <TableCell className="text-[13px]">
                    <span className="font-medium">{entry.userName ?? t("audit.system")}</span>
                    {entry.userRole && <span className="block text-xs text-muted-foreground">{entry.userRole}</span>}
                  </TableCell>
                  <TableCell className="font-mono text-[13px]">
                    {entry.action}
                    {entry.moduleLabel && <span className="block text-xs text-muted-foreground">{entry.moduleLabel}</span>}
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
        <nav className="flex items-center justify-between gap-3 text-sm" aria-label={t("audit.pagination.label")}>
          <span className="text-muted-foreground">{t("audit.pagination.page", { page: data.page, total: data.totalPages })}</span>
          <div className="flex gap-2">
            {data.page > 1 && (
              <Link href={pageHref(data.page - 1)} className="rounded-md border border-border px-3 py-1.5 hover:bg-surface-2">{t("audit.pagination.previous")}</Link>
            )}
            {data.page < data.totalPages && (
              <Link href={pageHref(data.page + 1)} className="rounded-md border border-border px-3 py-1.5 hover:bg-surface-2">{t("audit.pagination.next")}</Link>
            )}
          </div>
        </nav>
      )}
    </>
  );
}
