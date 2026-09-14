import { FlaskConical } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { CadastroButton } from "@/components/cadastro-form";
import { TableRecordCrudCell } from "@/components/table-record-crud-cell";
import { createServiceRecord, deleteServiceRecord, updateServiceRecord } from "@/server/crud-actions";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ListFilters } from "@/components/list-filters";
import { getFormatters, getTranslator } from "@/i18n/server";
import type { RevenueSource } from "@prisma/client";

const SERVICE_SOURCES = ["CONSULTA", "EXAME", "PROCEDIMENTO", "PRODUTO", "SEGURADORA", "PRIVADO", "OUTRO"] as RevenueSource[];

/** Tipos que se podem escolher ao cadastrar/editar um serviço. */
const EDITABLE_SOURCES = ["EXAME", "PROCEDIMENTO", "CONSULTA", "PRODUTO", "OUTRO"] as const satisfies readonly RevenueSource[];

export async function generateMetadata() {
  const t = await getTranslator();
  return { title: t("services.title") };
}

export default async function ServicosPage({ searchParams }: { searchParams: Promise<{ q?: string; categoria?: string; tipo?: string; estado?: string }> }) {
  const user = await requirePermission("service.view");
  const [t, f] = await Promise.all([getTranslator(), getFormatters()]);
  const sourceOptions = EDITABLE_SOURCES.map((value) => ({ value, label: t(`services.sources.${value}`) }));
  const sp = await searchParams;
  const query = (sp.q ?? "").trim();
  const source = SERVICE_SOURCES.includes(sp.tipo as RevenueSource) ? sp.tipo as RevenueSource : undefined;
  const isActive = sp.estado === "ativo" ? true : sp.estado === "inativo" ? false : undefined;
  const [services, categoryRows] = await Promise.all([
    prisma.service.findMany({
      where: {
        clinicId: user.clinicId,
        ...(query ? { name: { contains: query, mode: "insensitive" } } : {}),
        ...(sp.categoria ? { category: sp.categoria } : {}),
        ...(source ? { source } : {}),
        ...(isActive !== undefined ? { isActive } : {}),
      },
      orderBy: [{ category: "asc" }, { name: "asc" }],
      include: { _count: { select: { appointments: true } } },
    }),
    prisma.service.findMany({ where: { clinicId: user.clinicId }, distinct: ["category"], orderBy: { category: "asc" }, select: { category: true } }),
  ]);
  const canManage = can(user.role, "service.manage");

  return (
    <>
      <PageHeader
        eyebrow={t("catalog.eyebrow")}
        title={t("services.title")}
        description={t("services.description", { count: services.length })}
        actions={
          canManage ? (
            <CadastroButton
              label={t("services.newService")}
              title={t("services.newServiceTitle")}
              description={t("services.newServiceDescription")}
              action={createServiceRecord}
              fields={[
                { name: "name", label: t("services.fields.name"), required: true, full: true, placeholder: t("services.fields.namePlaceholder") },
                { name: "source", label: t("services.fields.type"), type: "select", defaultValue: "EXAME", options: sourceOptions },
                { name: "category", label: t("services.fields.category"), defaultValue: t("services.fields.categoryDefault"), placeholder: t("services.fields.categoryPlaceholder") },
                { name: "basePrice", label: t("services.fields.price"), type: "money", required: true, suffix: f.currency, placeholder: "1200", full: true },
              ]}
            />
          ) : undefined
        }
      />

      <ListFilters action="/servicos" fields={[
        { name: "q", label: t("catalog.search"), value: query, type: "search", placeholder: t("services.searchPlaceholder") },
        { name: "categoria", label: t("services.fields.category"), value: sp.categoria, options: categoryRows.map(({ category }) => ({ value: category, label: category })) },
        { name: "tipo", label: t("services.fields.type"), value: source, options: SERVICE_SOURCES.map((value) => ({ value, label: t(`services.sources.${value}`) })) },
        { name: "estado", label: t("catalog.status"), value: sp.estado, options: [{ value: "ativo", label: t("common.active") }, { value: "inativo", label: t("common.inactive") }] },
      ]} />

      <Card>
        <CardContent className="p-0">
          {services.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={FlaskConical}
                title={t("services.emptyTitle")}
                description={t("services.emptyDescription")}
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("services.columns.service")}</TableHead>
                  <TableHead>{t("services.columns.category")}</TableHead>
                  <TableHead>{t("services.columns.type")}</TableHead>
                  <TableHead className="text-right">{t("services.columns.appointments")}</TableHead>
                  <TableHead className="text-right">{t("services.columns.price")}</TableHead>
                  <TableHead>{t("catalog.status")}</TableHead>
                  {canManage && <TableHead className="text-right">{t("catalog.actions")}</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {services.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell className="text-[13px] text-muted-foreground">{s.category}</TableCell>
                    <TableCell><Badge variant="neutral">{t(`services.sources.${s.source}`)}</Badge></TableCell>
                    <TableCell className="text-right tabular">{s._count.appointments}</TableCell>
                    <TableCell className="text-right font-medium tabular">{f.money(s.basePrice)}</TableCell>
                    <TableCell><Badge variant={s.isActive ? "success" : "neutral"}>{s.isActive ? t("common.active") : t("common.inactive")}</Badge></TableCell>
                    {canManage && (
                      <TableCell className="text-right">
                        <TableRecordCrudCell
                          id={s.id}
                          title={t("services.editTitle")}
                          description={t("services.editDescription")}
                          fields={[
                            { name: "name", label: t("services.fields.name"), required: true, defaultValue: s.name },
                            { name: "category", label: t("services.fields.category"), defaultValue: s.category },
                            { name: "source", label: t("services.fields.type"), type: "select", defaultValue: s.source, options: sourceOptions },
                            { name: "basePrice", label: t("services.fields.price"), type: "money", required: true, defaultValue: String(s.basePrice), suffix: f.currency },
                          ]}
                          updateAction={updateServiceRecord}
                          deleteAction={deleteServiceRecord}
                        />
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
