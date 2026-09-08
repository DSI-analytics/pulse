import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { formatMZN } from "@/lib/money";
import { UserManagement } from "@/components/user-management";

export default async function ConfiguracoesPage() {
  const user = await requirePermission("settings.manage");

  const [clinic, settings, users, doctors, specialties] = await Promise.all([
    prisma.clinic.findUnique({ where: { id: user.clinicId }, include: { branches: true } }),
    prisma.clinicSettings.findUnique({ where: { clinicId: user.clinicId } }),
    prisma.user.findMany({
      where: { clinicId: user.clinicId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true, role: true, isActive: true, lastLoginAt: true, doctor: { select: { id: true, name: true } } },
    }),
    prisma.doctor.findMany({ where: { clinicId: user.clinicId }, orderBy: { name: "asc" }, select: { id: true, name: true, userId: true } }),
    prisma.specialty.findMany({ where: { clinicId: user.clinicId }, orderBy: { name: "asc" } }),
  ]);

  return (
    <>
      <PageHeader eyebrow="Sistema" title="Configurações" description="Dados da clínica, utilizadores e parâmetros operacionais." />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Dados da clínica</CardTitle></CardHeader>
          <CardContent className="space-y-2 pt-0 text-sm">
            <Row label="Nome" value={clinic?.name} />
            <Row label="NUIT" value={clinic?.nuit} />
            <Row label="Telefone" value={clinic?.phone} />
            <Row label="Email" value={clinic?.email} />
            <Row label="Morada" value={clinic?.address} />
            <Row label="Cidade" value={`${clinic?.city}, ${clinic?.country}`} />
            <Row label="Moeda / Fuso" value={`${clinic?.currency} · ${clinic?.timezone}`} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Parâmetros operacionais</CardTitle><CardDescription>Aplicados a marcações e alertas</CardDescription></CardHeader>
          <CardContent className="space-y-2 pt-0 text-sm">
            <Row label="Duração padrão da consulta" value={`${settings?.defaultSlotMinutes} min`} />
            <Row label="Valor padrão da consulta" value={settings ? formatMZN(settings.defaultConsultationFee) : "—"} />
            <Row label="Aviso de stock (dias)" value={`${settings?.lowStockLeadDays}`} />
            <Row label="Aviso de validade (dias)" value={`${settings?.expiryWarningDays}`} />
            <Row label="Conta a receber vencida (dias)" value={`${settings?.receivableOverdueDays}`} />
            <div className="pt-1">
              <p className="mb-1 text-xs text-muted-foreground">Filiais</p>
              {clinic?.branches.map((b) => (
                <p key={b.id} className="text-[13px]">{b.name}{b.isMain ? " · principal" : ""}</p>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Utilizadores</CardTitle><CardDescription>{users.length} utilizadores · controlo de acesso por perfil</CardDescription></CardHeader>
        <CardContent className="pt-0">
          <UserManagement
            users={users.map((u) => ({ ...u, lastLoginAt: u.lastLoginAt?.toISOString() ?? null }))}
            doctors={doctors}
            currentUserId={user.userId}
            currentRole={user.role}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Especialidades</CardTitle></CardHeader>
        <CardContent className="pt-0">
          <div className="flex flex-wrap gap-2">
            {specialties.map((s) => (
              <span key={s.id} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-3 py-1 text-[13px]">
                <span className="size-2 rounded-full" style={{ background: s.color }} />
                {s.name}
              </span>
            ))}
          </div>
        </CardContent>
      </Card>
    </>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value ?? "—"}</span>
    </div>
  );
}
