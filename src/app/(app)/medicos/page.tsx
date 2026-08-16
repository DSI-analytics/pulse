import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { getDoctorCards } from "@/server/doctor-analytics";
import { createDoctorRecord, createSpecialtyRecord, deleteDoctorRecord, deleteSpecialtyRecord, updateDoctorRecord, updateSpecialtyRecord } from "@/server/crud-actions";
import { PageHeader } from "@/components/page-header";
import { CadastroButton } from "@/components/cadastro-form";
import { TableRecordCrudCell } from "@/components/table-record-crud-cell";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Avatar } from "@/components/ui/avatar";
import { formatMZN } from "@/lib/money";

export default async function MedicosPage() {
  const user = await requirePermission("doctor.view");
  const [doctors, doctorsData, specialties] = await Promise.all([
    getDoctorCards(user.clinicId),
    prisma.doctor.findMany({
      where: { clinicId: user.clinicId },
      orderBy: { name: "asc" },
      select: { id: true, specialtyId: true, phone: true, email: true, licenseNumber: true, consultationPrice: true, consultationDuration: true },
    }),
    prisma.specialty.findMany({ where: { clinicId: user.clinicId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const canManage = can(user.role, "doctor.manage");
  const doctorDataMap = new Map(doctorsData.map((d) => [d.id, d]));

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

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {doctors.map((d) => (
          <Card key={d.id} className="p-5 transition-colors hover:border-primary/40">
            <div className="flex items-center gap-3">
              <Avatar name={d.name} color={d.color} className="size-11 text-sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{d.name}</p>
                <p className="text-[13px] text-muted-foreground">{d.specialty}</p>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Ocupação esta semana</span>
              <span className="font-semibold tabular">{d.occupancy}%</span>
            </div>
            <Progress
              className="mt-1.5"
              value={d.occupancy}
              indicatorClassName={d.occupancy >= 75 ? "bg-success" : d.occupancy >= 55 ? "bg-warning" : "bg-danger"}
            />

            <div className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-3 text-center">
              <Stat label="Consultas" value={String(d.consultas)} />
              <Stat label="Disponível" value={`${d.availableHours}h`} />
              <Stat label="No-show" value={`${d.noShowRate}%`} />
            </div>
            <p className="mt-3 text-center text-[13px]">
              <span className="text-muted-foreground">Receita: </span>
              <span className="font-semibold tabular">{formatMZN(d.receita)}</span>
            </p>
            {canManage && (
              <div className="mt-4 flex items-center justify-between gap-2 border-t border-border pt-3">
                <Link href={`/medicos/${d.id}`} className="text-sm text-primary hover:underline">Abrir</Link>
                {(() => {
                  const dd = doctorDataMap.get(d.id);
                  return dd ? (
                    <TableRecordCrudCell
                      id={d.id}
                      title="Editar médico"
                      description="Atualize os dados do médico."
                      fields={[
                        { name: "name", label: "Nome", required: true, defaultValue: d.name },
                        { name: "specialtyId", label: "Especialidade", type: "select", required: true, defaultValue: dd.specialtyId ?? "", options: specialties.map((s) => ({ value: s.id, label: s.name })) },
                        { name: "consultationPrice", label: "Preço da consulta", type: "money", required: true, defaultValue: String(dd.consultationPrice), suffix: "MZN" },
                        { name: "consultationDuration", label: "Duração", type: "number", defaultValue: String(dd.consultationDuration) },
                        { name: "phone", label: "Telefone", type: "tel", defaultValue: dd.phone ?? "" },
                        { name: "email", label: "Email", type: "email", defaultValue: dd.email ?? "" },
                        { name: "licenseNumber", label: "Cédula (OMM)", defaultValue: dd.licenseNumber ?? "" },
                      ]}
                      updateAction={updateDoctorRecord}
                      deleteAction={deleteDoctorRecord}
                    />
                  ) : null;
                })()}
              </div>
            )}
          </Card>
        ))}
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-display text-lg font-semibold tabular">{value}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}
