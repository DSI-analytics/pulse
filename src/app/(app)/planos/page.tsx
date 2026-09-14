import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { CadastroButton } from "@/components/cadastro-form";
import { TableRecordCrudCell } from "@/components/table-record-crud-cell";
import { createHealthPlanRecord, deleteHealthPlanRecord, updateHealthPlanRecord } from "@/server/crud-actions";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ListFilters } from "@/components/list-filters";
import { getFormatters, getTranslator } from "@/i18n/server";

export async function generateMetadata() {
  const t = await getTranslator();
  return { title: t("plans.title") };
}

export default async function PlanosPage({ searchParams }: { searchParams: Promise<{ q?: string; seguradora?: string; estado?: string }> }) {
  const user = await requirePermission("healthplan.view");
  const [t, f] = await Promise.all([getTranslator(), getFormatters()]);
  const sp = await searchParams;
  const query = (sp.q ?? "").trim();
  const isActive = sp.estado === "ativo" ? true : sp.estado === "inativo" ? false : undefined;

  const [plans, invoiceByPlan, apptByPlan, insurers] = await Promise.all([
    prisma.healthPlan.findMany({
      where: {
        clinicId: user.clinicId,
        ...(query ? { name: { contains: query, mode: "insensitive" } } : {}),
        ...(sp.seguradora ? { insuranceCompanyId: sp.seguradora } : {}),
        ...(isActive !== undefined ? { isActive } : {}),
      },
      orderBy: { name: "asc" },
      include: { insuranceCompany: true },
    }),
    prisma.invoice.groupBy({
      by: ["healthPlanId"],
      where: { clinicId: user.clinicId, healthPlanId: { not: null } },
      _sum: { total: true, amountPaid: true },
    }),
    prisma.appointment.groupBy({
      by: ["healthPlanId"],
      where: { clinicId: user.clinicId, healthPlanId: { not: null }, status: "CONCLUIDA" },
      _count: { _all: true },
    }),
    prisma.healthInsuranceCompany.findMany({ where: { clinicId: user.clinicId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  const invMap = new Map(invoiceByPlan.map((r) => [r.healthPlanId, r]));
  const cntMap = new Map(apptByPlan.map((r) => [r.healthPlanId, r._count._all]));

  const rows = plans
    .map((p) => {
      const inv = invMap.get(p.id);
      const billed = inv?._sum.total ?? 0;
      const received = inv?._sum.amountPaid ?? 0;
      return {
        p,
        consultas: cntMap.get(p.id) ?? 0,
        billed,
        received,
        pending: billed - received,
      };
    })
    .sort((a, b) => b.billed - a.billed);

  const totalPending = rows.reduce((a, r) => a + r.pending, 0);

  return (
    <>
      <PageHeader
        eyebrow={t("catalog.eyebrow")}
        title={t("plans.title")}
        description={t("plans.description", { count: plans.length, amount: f.money(totalPending) })}
        actions={
          can(user.role, "healthplan.manage") ? (
            <CadastroButton
              label={t("plans.newPlan")}
              title={t("plans.newPlanTitle")}
              action={createHealthPlanRecord}
              fields={[
                { name: "insuranceCompanyId", label: t("plans.fields.insurer"), type: "select", required: true, full: true, options: insurers.map((i) => ({ value: i.id, label: i.name })) },
                { name: "name", label: t("plans.fields.name"), required: true, placeholder: t("plans.fields.namePlaceholder") },
                { name: "contractPrice", label: t("plans.fields.contractPrice"), type: "money", required: true, suffix: f.currency, placeholder: "2000" },
                { name: "patientCopay", label: t("plans.fields.copay"), type: "money", suffix: f.currency, placeholder: "200" },
              ]}
            />
          ) : undefined
        }
      />

      <ListFilters action="/planos" fields={[
        { name: "q", label: t("catalog.search"), value: query, type: "search", placeholder: t("plans.searchPlaceholder") },
        { name: "seguradora", label: t("plans.fields.insurer"), value: sp.seguradora, options: insurers.map((insurer) => ({ value: insurer.id, label: insurer.name })) },
        { name: "estado", label: t("catalog.status"), value: sp.estado, options: [{ value: "ativo", label: t("common.active") }, { value: "inativo", label: t("common.inactive") }] },
      ]} />

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("plans.columns.insurerPlan")}</TableHead>
                <TableHead className="text-right">{t("plans.columns.consultations")}</TableHead>
                <TableHead className="text-right">{t("plans.columns.billed")}</TableHead>
                <TableHead className="text-right">{t("plans.columns.received")}</TableHead>
                <TableHead className="text-right">{t("plans.columns.pending")}</TableHead>
                <TableHead className="text-right">{t("plans.columns.term")}</TableHead>
                <TableHead>{t("catalog.status")}</TableHead>
                {can(user.role, "healthplan.manage") && <TableHead className="text-right">{t("catalog.actions")}</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ p, consultas, billed, received, pending }) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <p className="font-medium">{p.insuranceCompany.name}</p>
                    <p className="text-[12px] text-muted-foreground">{t("plans.contractLine", { plan: p.name, price: f.money(p.contractPrice) })}</p>
                  </TableCell>
                  <TableCell className="text-right tabular">{consultas}</TableCell>
                  <TableCell className="text-right tabular">{f.money(billed)}</TableCell>
                  <TableCell className="text-right tabular text-success">{f.money(received)}</TableCell>
                  <TableCell className="text-right tabular font-medium text-danger">{f.money(pending)}</TableCell>
                  <TableCell className="text-right tabular text-muted-foreground">{t("plans.termDays", { days: p.insuranceCompany.paymentTermDays })}</TableCell>
                  <TableCell><Badge variant={p.isActive ? "success" : "neutral"}>{p.isActive ? t("common.active") : t("common.inactive")}</Badge></TableCell>
                  {can(user.role, "healthplan.manage") && (
                    <TableCell className="text-right">
                      <TableRecordCrudCell
                        id={p.id}
                        title={t("plans.editTitle")}
                        description={t("plans.editDescription")}
                        fields={[
                          { name: "insuranceCompanyId", label: t("plans.fields.insurer"), type: "select", required: true, defaultValue: p.insuranceCompanyId, options: insurers.map((i) => ({ value: i.id, label: i.name })) },
                          { name: "name", label: t("plans.fields.name"), required: true, defaultValue: p.name },
                          { name: "contractPrice", label: t("plans.fields.contractPrice"), type: "money", required: true, defaultValue: String(p.contractPrice), suffix: f.currency },
                          { name: "patientCopay", label: t("plans.fields.copay"), type: "money", defaultValue: String(p.patientCopay), suffix: f.currency },
                        ]}
                        updateAction={updateHealthPlanRecord}
                        deleteAction={deleteHealthPlanRecord}
                      />
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {rows.length === 0 && <TableRow><TableCell colSpan={can(user.role, "healthplan.manage") ? 8 : 7} className="py-8 text-center text-sm text-muted-foreground">{t("plans.empty")}</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
