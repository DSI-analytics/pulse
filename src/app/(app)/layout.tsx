import { requireUser } from "@/lib/auth";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { NAV_ITEMS } from "@/lib/nav";
import { can } from "@/lib/rbac";
import { getTranslator } from "@/i18n/server";
import { AppSidebar } from "@/components/app-sidebar";
import { MobileNav } from "@/components/mobile-nav";
import { CommandSearch } from "@/components/command-search";
import { NovaMarcacao } from "@/components/nova-marcacao";
import { PulseMark } from "@/components/pulse-mark";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserMenu } from "@/components/user-menu";
import { NotificationsMenu, type NotificationView } from "@/components/notifications-menu";
import { getVisibleNotifications } from "@/server/notifications";
import { Loader2 } from "lucide-react";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const t = await getTranslator();
  const initiallyCollapsed = (await cookies()).get("pulso-sidebar-collapsed")?.value === "true";

  const [clinic, visible] = await Promise.all([
    prisma.clinic.findUnique({ where: { id: user.clinicId }, select: { name: true } }),
    getVisibleNotifications(user),
  ]);
  const { notifications, unread } = visible;

  const allowed = NAV_ITEMS.filter((i) => can(user.role, i.permission)).map((i) => i.href);
  const canBook = can(user.role, "appointment.manage");

  const notifView: NotificationView[] = notifications.map((n) => ({
    id: n.id,
    title: n.title,
    body: n.body,
    severity: n.severity,
    createdAt: n.createdAt.toISOString(),
  }));

  return (
    <div className="relative flex min-h-dvh">
      <div className="dashboard-reveal pointer-events-none fixed inset-0 z-[150] flex items-center justify-center bg-background p-6" aria-hidden>
        <div className="glass-strong flex min-w-52 flex-col items-center rounded-[28px] px-8 py-7 text-center">
          <div className="flex size-14 items-center justify-center rounded-[18px] bg-primary shadow-glow">
            <PulseMark className="size-8 text-primary-foreground" />
          </div>
          <p className="mt-4 font-display text-lg font-semibold">Pulso</p>
          <Loader2 className="mt-3 size-5 animate-spin text-primary" />
        </div>
      </div>
      <AppSidebar allowed={allowed} clinicName={clinic?.name ?? t("common.clinicFallback")} initiallyCollapsed={initiallyCollapsed} />
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Barra superior flutuante em vidro: o conteúdo desliza por baixo dela. */}
        <header className="sticky top-0 z-30 px-3 pt-3 md:px-4 lg:pl-3 print:hidden">
          <div className="glass flex h-14 items-center gap-2 rounded-[20px] pl-2 pr-1.5 md:pl-2.5">
            <div
              className="flex size-9 shrink-0 items-center justify-center rounded-[11px] bg-primary lg:hidden"
              aria-hidden
            >
              <PulseMark className="size-5 text-primary-foreground" />
            </div>
            <div className="min-w-0 flex-1 md:flex-none">
              <CommandSearch />
            </div>
            <div className="ml-auto flex items-center gap-1">
              {canBook && <NovaMarcacao />}
              <NotificationsMenu notifications={notifView} unread={unread} />
              <ThemeToggle />
              <div className="mx-1 hidden h-6 w-px bg-border sm:block" />
              <UserMenu name={user.name} roleLabel={t(`roles.${user.role}`)} />
            </div>
          </div>
        </header>
        {/* pb-32 abaixo de lg: espaço para a barra de navegação flutuante. */}
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-3 pb-32 pt-5 md:px-4 lg:px-3 lg:pb-10">{children}</main>
      </div>
      <MobileNav allowed={allowed} />
    </div>
  );
}
