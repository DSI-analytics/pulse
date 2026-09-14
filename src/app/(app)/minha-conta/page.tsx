import type { Metadata } from "next";
import { BadgeCheck, Building2, CalendarClock, Mail, Stethoscope, UserRound } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { AccountSettings } from "@/components/account-settings";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { getFormatters, getTranslator } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslator();
  return { title: t("userMenu.myAccount") };
}

export default async function MinhaContaPage() {
  const session = await requireUser();
  const [t, f] = await Promise.all([getTranslator(), getFormatters()]);
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
      <PageHeader eyebrow={t("account.eyebrow")} title={t("account.title")} description={t("account.description")} />

      <section className="border-y border-border py-5" aria-label={t("account.summary")}>
        <div className="flex flex-col gap-5 md:flex-row md:items-center">
          <Avatar name={account.name} className="size-16 text-xl" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold">{account.name}</h2>
              <Badge variant={account.isActive ? "success" : "neutral"}>{account.isActive ? t("account.active") : t("account.inactive")}</Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{account.email}</p>
          </div>
          <div className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
            <Detail icon={BadgeCheck} label={t("account.role")} value={t(`roles.${account.role}`)} />
            <Detail icon={Building2} label={t("account.clinic")} value={account.clinic.name} />
            <Detail icon={Stethoscope} label={t("account.linkedDoctor")} value={account.doctor ? `${account.doctor.name} · ${account.doctor.specialty.name}` : t("account.notLinked")} />
            <Detail icon={CalendarClock} label={t("account.lastAccess")} value={account.lastLoginAt ? f.dateTime(account.lastLoginAt) : t("account.firstAccess")} />
            <Detail icon={UserRound} label={t("account.createdAt")} value={f.dateMedium(account.createdAt)} />
            <Detail icon={Mail} label={t("account.loginId")} value={account.email} />
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
