import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { getDoctorCards } from "@/server/doctor-analytics";
import { createDoctorRecord, createSpecialtyRecord } from "@/server/crud-actions";
import { PageHeader } from "@/components/page-header";
import { CadastroButton } from "@/components/cadastro-form";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { formatMZN } from "@/lib/money";
import { ListFilters } from "@/components/list-filters";

export default async function MedicosPage({ searchParams }: { searchParams: Promise<{ q?: string; especialidade?: string }> }) {
  const user = await requirePermission("doctor.view");
  const canViewFinancials = can(user.role, "finance.view");
  const sp = await searchParams;
  const query = (sp.q ?? "").trim().toLocaleLowerCase("pt");
  const allDoctors = await getDoctorCards(user.clinicId, canViewFinancials);
  const specialties = await prisma.specialty.findMany({
    where: { clinicId: user.clinicId },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  const selectedSpecialty = specialties.find((specialty) => specialty.id === sp.especialidade)?.name;
  const doctors = allDoctors.filter((doctor) =>
    (!query || doctor.name.toLocaleLowerCase("pt").includes(query))
    && (!selectedSpecialty || doctor.specialty === selectedSpecialty),
  );
  const canManage = can(user.role, "doctor.manage");

  return (
    <>
      <PageHeader
        eyebrow="Gestão"
        title="Médicos"
        description="Ocupação, produtividade e capacidade disponível — esta semana."
        actions={
          canManage ? (
            <>
              <CadastroButton
                variant="secondary"
                label="Nova especialidade"
                title="Nova especialidade"
                action={createSpecialtyRecord}
                fields={[
                  { name: "name", label: "Nome", required: true, full: true, placeholder: "Ex.: Neurologia" },
                  { name: "color", label: "Cor", type: "select", full: true, defaultValue: "#0C7C74", options: [
                    { value: "#0C7C74", label: "Teal" }, { value: "#2563a8", label: "Azul" }, { value: "#cb4133", label: "Vermelho" },
                    { value: "#8a4fbf", label: "Roxo" }, { value: "#b26a06", label: "Âmbar" }, { value: "#1f9d57", label: "Verde" },
                  ] },
                ]}
              />
              <CadastroButton
                label="Novo médico"
                title="Novo médico"
                description="Adicione um médico e o seu horário padrão (Seg–Sex, 08:00–16:00)."
                action={createDoctorRecord}
                fields={[
                  { name: "name", label: "Nome", required: true, full: true, placeholder: "Ex.: Dra. Marta Sitoe" },
                  { name: "specialtyId", label: "Especialidade", type: "select", required: true, full: true, options: specialties.map((s) => ({ value: s.id, label: s.name })) },
                  { name: "consultationPrice", label: "Preço da consulta", type: "money", required: true, suffix: "MZN", placeholder: "1500" },
                  { name: "consultationDuration", label: "Duração", type: "number", suffix: "min", defaultValue: "30" },
                  { name: "phone", label: "Telefone", type: "tel" },
                  { name: "email", label: "Email", type: "email" },
                  { name: "licenseNumber", label: "Cédula (OMM)", full: true },
                ]}
              />
            </>
          ) : undefined
        }
      />

      <ListFilters action="/medicos" fields={[
        { name: "q", label: "Pesquisar", value: sp.q?.trim(), type: "search", placeholder: "Nome do médico…" },
        { name: "especialidade", label: "Especialidade", value: sp.especialidade, options: specialties.map((specialty) => ({ value: specialty.id, label: specialty.name })) },
      ]} />

      <div className="space-y-3">
        {doctors.length === 0 && <Card className="p-8 text-center text-sm text-muted-foreground">Nenhum médico corresponde aos filtros.</Card>}
        {doctors.map((d) => (
          <Link
            key={d.id}
            href={`/medicos/${d.id}`}
            className="block transition-colors"
          >
            <Card className="p-4 transition-colors hover:border-primary/40">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <Avatar name={d.name} color={d.color} className="size-10 text-sm flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-sm">{d.name}</p>
                    <p className="text-[13px] text-muted-foreground">{d.specialty}</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-4 flex-shrink-0 ml-4">
                  <div className="text-right">
                    <p className="text-sm font-semibold tabular">{d.occupancy}%</p>
                    <p className="text-[11px] text-muted-foreground">Ocupação</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold tabular">{d.consultas}</p>
                    <p className="text-[11px] text-muted-foreground">Consultas</p>
                  </div>
                  {canViewFinancials && <div className="text-right">
                    <p className="text-sm font-semibold tabular">{formatMZN(d.receita)}</p>
                    <p className="text-[11px] text-muted-foreground">Receita</p>
                  </div>}
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}
