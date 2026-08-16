import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Phone, Mail, MapPin, CalendarClock, Stethoscope, Lock } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { StatusPill } from "@/components/status-pill";
import { buttonVariants } from "@/components/ui/button";
import { EditPatientButton } from "@/components/patient-editor";
import { updatePatientRecord } from "@/server/crud-actions";
import { formatDatePt, formatDateShort, formatTime } from "@/lib/datetime";
import { formatMZN } from "@/lib/money";
import { TYPE_LABEL } from "@/lib/appointment-status";

function age(birth?: Date | null): string {
  if (!birth) return "—";
  const diff = Date.now() - birth.getTime();
  return `${Math.floor(diff / (365.25 * 86400000))} anos`;
}
const GENDER = { MASCULINO: "Masculino", FEMININO: "Feminino", OUTRO: "Outro" };

export default async function PatientProfile({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("patient.view");
  const { id } = await params;

  const patient = await prisma.patient.findFirst({
    where: { id, clinicId: user.clinicId },
    include: {
      healthPlans: {
        include: { healthPlan: { include: { insuranceCompany: true } } },
      },
    },
  });
  if (!patient) notFound();

  const now = new Date();
  const [appointments, consultations, invoiceAgg, noShows] = await Promise.all([
    prisma.appointment.findMany({
      where: { clinicId: user.clinicId, patientId: id },
      orderBy: { startAt: "desc" },
      take: 20,
      select: {
        id: true, startAt: true, status: true, type: true,
        doctor: { select: { name: true } },
        specialty: { select: { name: true, color: true } },
      },
    }),
    prisma.consultation.findMany({
      where: { clinicId: user.clinicId, patientId: id },
      orderBy: { startedAt: "desc" },
      take: 10,
      select: { id: true, startedAt: true, notes: true, diagnosis: true, doctor: { select: { name: true } } },
    }),
    prisma.invoice.aggregate({
      where: { clinicId: user.clinicId, patientId: id },
      _sum: { total: true, amountPaid: true },
    }),
    prisma.appointment.count({ where: { clinicId: user.clinicId, patientId: id, status: "NAO_COMPARECEU" } }),
  ]);

  const upcoming = appointments.filter((a) => a.startAt >= now && a.status !== "CANCELADA");
  const history = appointments.filter((a) => a.startAt < now || a.status === "CANCELADA");
  const billed = invoiceAgg._sum.total ?? 0;
  const paid = invoiceAgg._sum.amountPaid ?? 0;
  const plan = patient.healthPlans[0]?.healthPlan;
  const showClinical = can(user.role, "consultation.viewClinical");

  return (
    <>
      <Link href="/pacientes" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Pacientes
      </Link>

      <div className="flex flex-wrap items-center gap-4">
        <Avatar name={patient.name} className="size-14 text-lg" />
        <div className="flex-1">
          <h1 className="font-display text-2xl font-semibold">{patient.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span className="font-mono">{patient.code}</span>
            <span>·</span>
            <span>{age(patient.birthDate)}</span>
            <span>·</span>
            <span>{patient.gender ? GENDER[patient.gender] : "—"}</span>
            {plan ? <Badge variant="info">{plan.insuranceCompany.name} · {plan.name}</Badge> : <Badge variant="neutral">Particular</Badge>}
          </div>
        </div>
        {can(user.role, "patient.manage") && (
          <EditPatientButton
            patient={{
              id: patient.id,
              name: patient.name,
              phone: patient.phone,
              email: patient.email,
              address: patient.address,
              birthDate: patient.birthDate,
              gender: patient.gender,
              emergencyContactName: patient.emergencyContactName,
              emergencyContactPhone: patient.emergencyContactPhone,
            }}
            action={updatePatientRecord}
          />
        )}
      </div>

      {/* Financial summary */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MiniStat label="Total facturado" value={formatMZN(billed)} />
        <MiniStat label="Total pago" value={formatMZN(paid)} tone="success" />
        <MiniStat label="Saldo em dívida" value={formatMZN(billed - paid)} tone={billed - paid > 0 ? "danger" : "neutral"} />
        <MiniStat label="Faltas" value={String(noShows)} tone={noShows > 0 ? "warning" : "neutral"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.6fr]">
        {/* Personal + plan */}
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Dados pessoais</CardTitle></CardHeader>
            <CardContent className="space-y-2.5 pt-0 text-sm">
              <Row icon={Phone} label="Telefone" value={patient.phone} />
              <Row icon={Mail} label="Email" value={patient.email} />
              <Row icon={MapPin} label="Morada" value={patient.address} />
              <Row icon={CalendarClock} label="Nascimento" value={patient.birthDate ? formatDatePt(patient.birthDate) : null} />
              <div className="border-t border-border pt-2.5">
                <p className="text-xs text-muted-foreground">Contacto de emergência</p>
                <p className="font-medium">{patient.emergencyContactName ?? "—"}</p>
                {patient.emergencyContactPhone && <p className="text-sm text-muted-foreground">{patient.emergencyContactPhone}</p>}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Plano de saúde</CardTitle></CardHeader>
            <CardContent className="pt-0 text-sm">
              {plan ? (
                <div className="space-y-1.5">
                  <div className="flex justify-between"><span className="text-muted-foreground">Seguradora</span><span className="font-medium">{plan.insuranceCompany.name}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Plano</span><span className="font-medium">{plan.name}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Nº membro</span><span className="font-mono">{patient.healthPlans[0].membershipNumber ?? "—"}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Co-pagamento</span><span className="tabular">{formatMZN(plan.patientCopay)}</span></div>
                </div>
              ) : (
                <p className="text-muted-foreground">Paciente particular (sem plano associado).</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Appointments + clinical */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Próximas marcações</CardTitle>
              <span className="text-xs text-muted-foreground">{upcoming.length}</span>
            </CardHeader>
            <CardContent className="pt-0">
              {upcoming.length === 0 ? (
                <p className="py-3 text-sm text-muted-foreground">Sem marcações futuras.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {upcoming.map((a) => (
                    <li key={a.id} className="flex items-center justify-between py-2.5">
                      <div>
                        <p className="text-sm font-medium">{formatDatePt(a.startAt)} · {formatTime(a.startAt)}</p>
                        <p className="text-[13px] text-muted-foreground">{a.doctor.name} · {a.specialty.name}</p>
                      </div>
                      <StatusPill status={a.status} startAt={a.startAt} />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Histórico de consultas</CardTitle></CardHeader>
            <CardContent className="pt-0">
              {history.length === 0 ? (
                <p className="py-3 text-sm text-muted-foreground">Sem histórico.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {history.slice(0, 10).map((a) => (
                    <li key={a.id} className="flex items-center justify-between py-2.5">
                      <div className="flex items-center gap-2.5">
                        <span className="size-2 rounded-full" style={{ background: a.specialty.color }} />
                        <div>
                          <p className="text-sm font-medium">{a.specialty.name} · {TYPE_LABEL[a.type]}</p>
                          <p className="text-[13px] text-muted-foreground">{formatDateShort(a.startAt)} · {a.doctor.name}</p>
                        </div>
                      </div>
                      <StatusPill status={a.status} startAt={a.startAt} />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2"><Stethoscope className="size-4 text-primary" /> Notas clínicas</CardTitle>
              {!showClinical && <Badge variant="neutral"><Lock className="size-3" /> Restrito</Badge>}
            </CardHeader>
            <CardContent className="pt-0">
              {!showClinical ? (
                <p className="text-sm text-muted-foreground">O seu perfil não tem acesso às notas clínicas.</p>
              ) : consultations.length === 0 ? (
                <p className="py-3 text-sm text-muted-foreground">Sem registos clínicos.</p>
              ) : (
                <ul className="space-y-3">
                  {consultations.map((c) => (
                    <li key={c.id} className="rounded-lg border border-border bg-surface-2/50 p-3">
                      <p className="text-[13px] font-medium">{formatDatePt(c.startedAt)} · {c.doctor.name}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{c.notes || c.diagnosis || "Consulta concluída, sem notas registadas."}</p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

function Row({ icon: Icon, label, value }: { icon: any; label: string; value?: string | null }) {
  return (
    <div className="flex items-center gap-2.5">
      <Icon className="size-4 text-subtle-foreground" />
      <span className="text-muted-foreground">{label}</span>
      <span className="ml-auto font-medium">{value ?? "—"}</span>
    </div>
  );
}

function MiniStat({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "success" | "warning" | "danger" }) {
  const color = { neutral: "text-foreground", success: "text-success", warning: "text-warning", danger: "text-danger" }[tone];
  return (
    <Card className="p-4">
      <p className="text-[13px] text-muted-foreground">{label}</p>
      <p className={`mt-1 font-display text-xl font-semibold tabular ${color}`}>{value}</p>
    </Card>
  );
}
