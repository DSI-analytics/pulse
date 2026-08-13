import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Stethoscope } from "lucide-react";
import { formatDatePt } from "@/lib/datetime";
import { TYPE_LABEL } from "@/lib/appointment-status";

export default async function ConsultasPage() {
  const user = await requirePermission("appointment.view");
  const showClinical = can(user.role, "consultation.viewClinical");

  // Doctors see only their own consultations.
  const consultations = await prisma.consultation.findMany({
    where: {
      clinicId: user.clinicId,
      ...(user.role === "DOCTOR" && user.doctorId ? { doctorId: user.doctorId } : {}),
    },
    orderBy: { startedAt: "desc" },
    take: 40,
    include: {
      patient: { select: { name: true } },
      doctor: { select: { name: true } },
      appointment: { select: { type: true, specialty: { select: { name: true, color: true } } } },
    },
  });

  return (
    <>
      <PageHeader eyebrow="Operação" title="Consultas" description="Registo clínico das consultas concluídas." />
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
                  <TableHead>Notas clínicas</TableHead>
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
                    <TableCell className="max-w-xs truncate text-[13px] text-muted-foreground">
                      {showClinical ? c.notes || c.diagnosis || "—" : <span className="italic">Restrito</span>}
                    </TableCell>
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
