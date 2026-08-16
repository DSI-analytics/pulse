import Link from "next/link";
import { Search, Users, ChevronRight } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { CadastroButton } from "@/components/cadastro-form";
import { createPatientRecord } from "@/server/crud-actions";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDateShort } from "@/lib/datetime";

export default async function PacientesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await requirePermission("patient.view");
  const { q } = await searchParams;
  const query = (q ?? "").trim();

  const where = {
    clinicId: user.clinicId,
    ...(query
      ? {
          OR: [
            { name: { contains: query, mode: "insensitive" as const } },
            { phone: { contains: query } },
            { code: { contains: query, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [patients, total] = await Promise.all([
    prisma.patient.findMany({
      where,
      orderBy: { name: "asc" },
      take: 50,
      select: {
        id: true, code: true, name: true, phone: true, email: true, address: true, birthDate: true, gender: true,
        emergencyContactName: true, emergencyContactPhone: true, registeredAt: true,
        healthPlans: {
          take: 1,
          select: { healthPlan: { select: { insuranceCompany: { select: { name: true } } } } },
        },
        _count: { select: { appointments: true } },
      },
    }),
    prisma.patient.count({ where: { clinicId: user.clinicId } }),
  ]);

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

      <Card className="p-3">
        <form className="relative" action="/pacientes">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle-foreground" />
          <Input
            name="q"
            defaultValue={query}
            placeholder="Pesquisar por nome, telefone ou nº de paciente…"
            className="pl-9"
          />
        </form>
      </Card>

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
    </>
  );
}
