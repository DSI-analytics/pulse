import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusPill } from "@/components/status-pill";
import { Stethoscope } from "lucide-react";
import { formatDatePt } from "@/lib/datetime";
import { STATUS_LABEL, TYPE_LABEL } from "@/lib/appointment-status";
import { ListFilters } from "@/components/list-filters";
import type { AppointmentStatus } from "@prisma/client";
import { ClinicalConsultationEditor } from "@/components/clinical-consultation-editor";

const CONSULTATION_STATUSES: AppointmentStatus[] = ["MARCADA", "CONFIRMADA", "CHEGOU", "EM_ESPERA", "EM_CONSULTA", "CONCLUIDA"];

export default async function ConsultasPage({ searchParams }: { searchParams: Promise<{ q?: string; estado?: string; medico?: string; especialidade?: string }> }) {
  const user = await requirePermission("appointment.view");
  const showClinical = can(user.role, "consultation.viewClinical");
  const canConduct = can(user.role, "consultation.conduct");
  const sp = await searchParams;
  const query = (sp.q ?? "").trim();
  const status = CONSULTATION_STATUSES.includes(sp.estado as AppointmentStatus) ? sp.estado as AppointmentStatus : undefined;
  const isDoctor = user.role === "DOCTOR";

  // Doctors see only their own consultations.
  const [consultations, doctors, specialties] = await Promise.all([
    prisma.consultation.findMany({
      where: {
        clinicId: user.clinicId,
        appointment: {
          status: status ?? { notIn: ["CANCELADA", "NAO_COMPARECEU"] },
          ...(sp.especialidade ? { specialtyId: sp.especialidade } : {}),
        },
        ...(query ? { patient: { name: { contains: query, mode: "insensitive" } } } : {}),
        ...(isDoctor ? { doctorId: user.doctorId ?? "__sem_medico_associado__" } : sp.medico ? { doctorId: sp.medico } : {}),
      },
      orderBy: { startedAt: "desc" },
      take: 40,
      include: {
        patient: { select: { name: true } },
        doctor: { select: { name: true } },
        appointment: { select: { id: true, type: true, status: true, startAt: true, specialty: { select: { name: true, color: true } } } },
      },
    }),
    isDoctor ? Promise.resolve([]) : prisma.doctor.findMany({ where: { clinicId: user.clinicId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.specialty.findMany({ where: { clinicId: user.clinicId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <>
      <PageHeader eyebrow="Operação" title="Consultas" description="Consultas agendadas e registos clínicos." />
      <ListFilters action="/consultas" fields={[
        { name: "q", label: "Pesquisar", value: query, type: "search", placeholder: "Nome do paciente…" },
        { name: "estado", label: "Estado", value: status, options: CONSULTATION_STATUSES.map((value) => ({ value, label: STATUS_LABEL[value] })) },
        ...(!isDoctor ? [{ name: "medico", label: "Médico", value: sp.medico, options: doctors.map((doctor) => ({ value: doctor.id, label: doctor.name })) }] : []),
        { name: "especialidade", label: "Especialidade", value: sp.especialidade, options: specialties.map((specialty) => ({ value: specialty.id, label: specialty.name })) },
      ]} />
      <Card>
        <CardContent className="p-0">
          {consultations.length === 0 ? (
            <div className="p-6"><EmptyState icon={Stethoscope} title="Sem consultas registadas" /></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Paciente</TableHead>
                  <TableHead>Médico</TableHead>
                  <TableHead>Especialidade</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Notas clínicas</TableHead>
                  {canConduct && <TableHead className="text-right">Ações</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {consultations.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="text-[13px] text-muted-foreground">{formatDatePt(c.startedAt)}</TableCell>
                    <TableCell className="font-medium">{c.patient.name}</TableCell>
                    <TableCell className="text-[13px] text-muted-foreground">{c.doctor.name}</TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1.5 text-[13px]">
                        <span className="size-2 rounded-full" style={{ background: c.appointment.specialty.color }} />
                        {c.appointment.specialty.name}
                      </span>
                    </TableCell>
                    <TableCell><Badge variant="neutral">{TYPE_LABEL[c.appointment.type]}</Badge></TableCell>
                    <TableCell><StatusPill status={c.appointment.status} startAt={c.appointment.startAt} /></TableCell>
                    <TableCell className="max-w-xs truncate text-[13px] text-muted-foreground">
                      {showClinical ? c.notes || c.diagnosis || "—" : <span className="italic">Restrito</span>}
                    </TableCell>
                    {canConduct && (
                      <TableCell className="text-right">
                        {c.appointment.status === "EM_CONSULTA" || c.appointment.status === "CONCLUIDA"
                          ? <ClinicalConsultationEditor appointmentId={c.appointment.id} status={c.appointment.status} compact />
                          : <span className="text-xs text-subtle-foreground">—</span>}
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
