import Link from "next/link";
import { Users, ChevronRight } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { CadastroButton } from "@/components/cadastro-form";
import { createPatientRecord } from "@/server/crud-actions";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { ListFilters } from "@/components/list-filters";
import { patientSearchWhere } from "@/server/patient-search";
import { getFormatters, getTranslator } from "@/i18n/server";

const GENDERS = ["FEMININO", "MASCULINO", "OUTRO"] as const;

export async function generateMetadata() {
  const t = await getTranslator();
  return { title: t("nav.patients") };
}

export default async function PacientesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; cobertura?: string; genero?: string; estado?: string; pagina?: string }>;
}) {
  const user = await requirePermission("patient.view");
  const [t, f] = await Promise.all([getTranslator(), getFormatters()]);
  const { q, cobertura, genero, estado, pagina } = await searchParams;
  const query = (q ?? "").trim();
  const gender = (GENDERS as readonly string[]).includes(genero ?? "") ? genero as (typeof GENDERS)[number] : undefined;
  const includeInactive = estado === "inactivos" || estado === "todos";
  const page = Math.max(1, Number.parseInt(pagina ?? "1", 10) || 1);
  const pageSize = 50;

  const where = {
    ...patientSearchWhere(user.clinicId, query, { includeInactive }),
    ...(estado === "inactivos" ? { isActive: false } : {}),
    ...(gender ? { gender } : {}),
    ...(cobertura === "plano" ? { healthPlans: { some: {} } } : cobertura === "particular" ? { healthPlans: { none: {} } } : {}),
  };

  const [patients, total] = await Promise.all([
    prisma.patient.findMany({
      where,
      orderBy: { name: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true, code: true, name: true, phone: true, email: true, address: true, birthDate: true, gender: true,
        emergencyContactName: true, emergencyContactPhone: true, registeredAt: true,
        healthPlans: {
          take: 1,
          select: { healthPlan: { select: { insuranceCompany: { select: { name: true } } } } },
        },
        isActive: true,
        _count: { select: { appointments: true } },
      },
    }),
    prisma.patient.count({ where }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pageHref = (n: number) => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (cobertura) params.set("cobertura", cobertura);
    if (genero) params.set("genero", genero);
    if (estado) params.set("estado", estado);
    if (n > 1) params.set("pagina", String(n));
    const qs = params.toString();
    return qs ? `/pacientes?${qs}` : "/pacientes";
  };

  const genderOptions = GENDERS.map((value) => ({ value, label: t(`patients.gender.${value}`) }));

  return (
    <>
      <PageHeader
        eyebrow={t("nav.groups.operation")}
        title={t("nav.patients")}
        description={t("patients.list.count", { count: f.number(total) })}
        actions={
          can(user.role, "patient.manage") ? (
            <CadastroButton
              label={t("patients.list.newPatient")}
              title={t("patients.list.newPatient")}
              description={t("patients.list.newPatientDescription")}
              action={createPatientRecord}
              fields={[
                { name: "name", label: t("patients.fields.name"), required: true, full: true, placeholder: t("patients.fields.namePlaceholder") },
                { name: "phone", label: t("patients.fields.phone"), type: "tel", placeholder: t("patients.fields.phonePlaceholder") },
                { name: "birthDate", label: t("patients.fields.birthDate"), type: "date" },
                { name: "gender", label: t("patients.fields.gender"), type: "select", options: genderOptions },
                { name: "email", label: t("patients.fields.email"), type: "email" },
                { name: "address", label: t("patients.fields.address"), full: true },
                { name: "emergencyContactName", label: t("patients.fields.emergencyContact") },
                { name: "emergencyContactPhone", label: t("patients.fields.emergencyPhone"), type: "tel" },
              ]}
            />
          ) : undefined
        }
      />

      <ListFilters action="/pacientes" fields={[
        { name: "q", label: t("patients.list.search"), value: query, type: "search", placeholder: t("patients.list.searchPlaceholder") },
        { name: "cobertura", label: t("patients.list.coverage"), value: cobertura, options: [{ value: "plano", label: t("patients.list.withPlan") }, { value: "particular", label: t("patients.private") }] },
        { name: "genero", label: t("patients.fields.gender"), value: gender, options: genderOptions },
        { name: "estado", label: t("patients.list.status"), value: estado, options: [{ value: "inactivos", label: t("patients.list.inactiveFilter") }, { value: "todos", label: t("patients.list.all") }] },
      ]} />

      <Card>
        {patients.length === 0 ? (
          <div className="p-6">
            <EmptyState icon={Users} title={t("patients.list.emptyTitle")} description={t("patients.list.emptyDescription")} />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("patients.list.columns.patient")}</TableHead>
                <TableHead>{t("patients.list.columns.code")}</TableHead>
                <TableHead>{t("patients.list.columns.phone")}</TableHead>
                <TableHead>{t("patients.list.columns.plan")}</TableHead>
                <TableHead className="text-right">{t("patients.list.columns.consultations")}</TableHead>
                <TableHead>{t("patients.list.columns.registered")}</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {patients.map((p) => (
                <TableRow key={p.id} className="cursor-pointer">
                  <TableCell>
                    <Link href={`/pacientes/${p.id}`} className="flex items-center gap-2.5">
                      <Avatar name={p.name} className="size-8" />
                      <span className="font-medium">{p.name}</span>
                      {!p.isActive && <Badge variant="neutral">{t("common.inactive")}</Badge>}
                    </Link>
                  </TableCell>
                  <TableCell className="whitespace-nowrap font-mono text-[13px] text-muted-foreground">{p.code}</TableCell>
                  <TableCell className="whitespace-nowrap text-[13px] tabular">{p.phone ?? "—"}</TableCell>
                  <TableCell>
                    {p.healthPlans[0] ? (
                      <Badge variant="info">{p.healthPlans[0].healthPlan.insuranceCompany.name}</Badge>
                    ) : (
                      <Badge variant="neutral">{t("patients.private")}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular">{p._count.appointments}</TableCell>
                  <TableCell className="whitespace-nowrap text-[13px] text-muted-foreground tabular">{f.date(p.registeredAt)}</TableCell>
                  <TableCell className="text-right">
                    <Link href={`/pacientes/${p.id}`} className="inline-flex text-subtle-foreground hover:text-foreground">
                      <ChevronRight className="size-4" />
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {totalPages > 1 && (
        <nav className="flex items-center justify-between gap-3 text-sm" aria-label={t("patients.list.paginationLabel")}>
          <span className="text-muted-foreground">
            {t("patients.list.pageSummary", { page, totalPages, total: f.number(total) })}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link href={pageHref(page - 1)} className="rounded-md border border-border px-3 py-1.5 hover:bg-surface-2">
                {t("patients.list.previous")}
              </Link>
            )}
            {page < totalPages && (
              <Link href={pageHref(page + 1)} className="rounded-md border border-border px-3 py-1.5 hover:bg-surface-2">
                {t("patients.list.next")}
              </Link>
            )}
          </div>
        </nav>
      )}
    </>
  );
}
