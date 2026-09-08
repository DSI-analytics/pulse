import { BadgeCheck, Building2, CalendarClock, Mail, Stethoscope, UserRound } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ROLE_LABELS } from "@/lib/rbac";
import { formatDatePt, formatDateTimePt } from "@/lib/datetime";
import { PageHeader } from "@/components/page-header";
import { AccountSettings } from "@/components/account-settings";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

export default async function MinhaContaPage() {
  const session = await requireUser();
  const account = await prisma.user.findFirstOrThrow({
    where: { id: session.userId, clinicId: session.clinicId },
    select: {
      name: true, email: true, role: true, isActive: true, lastLoginAt: true, createdAt: true,
      clinic: { select: { name: true } },
      doctor: { select: { name: true, specialty: { select: { name: true } } } },
    },
  });

  return (
    <>
      <PageHeader eyebrow="Conta" title="Meus detalhes" description="Consulte os seus dados pessoais e faça alterações à sua conta." />

      <section className="border-y border-border py-5" aria-label="Resumo da conta">
        <div className="flex flex-col gap-5 md:flex-row md:items-center">
          <Avatar name={account.name} className="size-16 text-xl" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold">{account.name}</h2>
              <Badge variant={account.isActive ? "success" : "neutral"}>{account.isActive ? "Conta ativa" : "Conta inativa"}</Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{account.email}</p>
          </div>
          <div className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
            <Detail icon={BadgeCheck} label="Perfil" value={ROLE_LABELS[account.role]} />
            <Detail icon={Building2} label="Clínica" value={account.clinic.name} />
            <Detail icon={Stethoscope} label="Médico associado" value={account.doctor ? `${account.doctor.name} · ${account.doctor.specialty.name}` : "Não associado"} />
            <Detail icon={CalendarClock} label="Último acesso" value={account.lastLoginAt ? formatDateTimePt(account.lastLoginAt) : "Primeiro acesso"} />
            <Detail icon={UserRound} label="Conta criada" value={formatDatePt(account.createdAt)} />
            <Detail icon={Mail} label="Identificador de acesso" value={account.email} />
          </div>
        </div>
      </section>

      <AccountSettings name={account.name} email={account.email} />
    </>
  );
}

function Detail({ icon: Icon, label, value }: { icon: typeof UserRound; label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-start gap-2.5">
      <Icon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
      <div className="min-w-0"><p className="text-[11px] font-medium uppercase text-subtle-foreground">{label}</p><p className="truncate font-medium" title={value}>{value}</p></div>
    </div>
  );
}
