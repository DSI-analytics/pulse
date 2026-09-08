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
import { formatDateShort } from "@/lib/datetime";
import { ListFilters } from "@/components/list-filters";
import { patientSearchWhere } from "@/server/patient-search";

export default async function PacientesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; cobertura?: string; genero?: string; estado?: string; pagina?: string }>;
}) {
  const user = await requirePermission("patient.view");
  const { q, cobertura, genero, estado, pagina } = await searchParams;
  const query = (q ?? "").trim();
  const gender = ["FEMININO", "MASCULINO", "OUTRO"].includes(genero ?? "") ? genero as "FEMININO" | "MASCULINO" | "OUTRO" : undefined;
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

  return (
    <>
      <PageHeader
        eyebrow="Operação"
        title="Pacientes"
        description={`${total.toLocaleString("pt-PT")} pacientes registados`}
        actions={
          can(user.role, "patient.manage") ? (
            <CadastroButton
              label="Novo paciente"
              title="Novo paciente"
              description="Registe um novo paciente na clínica."
              action={createPatientRecord}
              fields={[
                { name: "name", label: "Nome completo", required: true, full: true, placeholder: "Ex.: Ana Machava" },
                { name: "phone", label: "Telefone", type: "tel", placeholder: "84…" },
                { name: "birthDate", label: "Data de nascimento", type: "date" },
                { name: "gender", label: "Género", type: "select", options: [
                  { value: "FEMININO", label: "Feminino" }, { value: "MASCULINO", label: "Masculino" }, { value: "OUTRO", label: "Outro" },
                ] },
                { name: "email", label: "Email", type: "email" },
                { name: "address", label: "Morada", full: true },
                { name: "emergencyContactName", label: "Contacto de emergência" },
                { name: "emergencyContactPhone", label: "Tel. de emergência", type: "tel" },
              ]}
            />
          ) : undefined
        }
      />

      <ListFilters action="/pacientes" fields={[
        { name: "q", label: "Pesquisar", value: query, type: "search", placeholder: "Nome, nº, telefone, email, documento ou data de nascimento…" },
        { name: "cobertura", label: "Cobertura", value: cobertura, options: [{ value: "plano", label: "Com plano" }, { value: "particular", label: "Particular" }] },
        { name: "genero", label: "Género", value: gender, options: [{ value: "FEMININO", label: "Feminino" }, { value: "MASCULINO", label: "Masculino" }, { value: "OUTRO", label: "Outro" }] },
        { name: "estado", label: "Estado", value: estado, options: [{ value: "inactivos", label: "Inactivos" }, { value: "todos", label: "Todos" }] },
      ]} />

      <Card>
        {patients.length === 0 ? (
          <div className="p-6">
            <EmptyState icon={Users} title="Nenhum paciente encontrado" description="Ajuste a pesquisa ou registe um novo paciente através de + Nova Marcação." />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Paciente</TableHead>
                <TableHead>Nº</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Plano</TableHead>
                <TableHead className="text-right">Consultas</TableHead>
                <TableHead>Registo</TableHead>
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
                      {!p.isActive && <Badge variant="neutral">Inactivo</Badge>}
                    </Link>
                  </TableCell>
                  <TableCell className="font-mono text-[13px] text-muted-foreground">{p.code}</TableCell>
                  <TableCell className="text-[13px]">{p.phone ?? "—"}</TableCell>
                  <TableCell>
                    {p.healthPlans[0] ? (
                      <Badge variant="info">{p.healthPlans[0].healthPlan.insuranceCompany.name}</Badge>
                    ) : (
                      <Badge variant="neutral">Particular</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular">{p._count.appointments}</TableCell>
                  <TableCell className="text-[13px] text-muted-foreground">{formatDateShort(p.registeredAt)}</TableCell>
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
        <nav className="flex items-center justify-between gap-3 text-sm" aria-label="Paginação de pacientes">
          <span className="text-muted-foreground">
            Página {page} de {totalPages} · {total.toLocaleString("pt-PT")} resultados
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link href={pageHref(page - 1)} className="rounded-md border border-border px-3 py-1.5 hover:bg-surface-2">
                Anterior
              </Link>
            )}
            {page < totalPages && (
              <Link href={pageHref(page + 1)} className="rounded-md border border-border px-3 py-1.5 hover:bg-surface-2">
                Seguinte
              </Link>
            )}
          </div>
        </nav>
      )}
    </>
  );
}
