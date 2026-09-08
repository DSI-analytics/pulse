import { requireUser } from "@/lib/auth";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { NAV_ITEMS } from "@/lib/nav";
import { can, ROLE_LABELS } from "@/lib/rbac";
import { AppSidebar } from "@/components/app-sidebar";
import { CommandSearch } from "@/components/command-search";
import { NovaMarcacao } from "@/components/nova-marcacao";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserMenu } from "@/components/user-menu";
import { NotificationsMenu, type NotificationView } from "@/components/notifications-menu";
import { getVisibleNotifications } from "@/server/notifications";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
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
    <div className="flex min-h-screen bg-background">
      <AppSidebar allowed={allowed} clinicName={clinic?.name ?? "Clínica"} initiallyCollapsed={initiallyCollapsed} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-surface/80 px-4 backdrop-blur-md md:px-6">
          <div className="flex-1 md:flex-none">
            <CommandSearch />
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            {canBook && <NovaMarcacao />}
            <NotificationsMenu notifications={notifView} unread={unread} />
            <ThemeToggle />
            <div className="mx-1 h-6 w-px bg-border" />
            <UserMenu name={user.name} roleLabel={ROLE_LABELS[user.role]} />
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1400px] flex-1 space-y-3 p-4 md:p-6 lg:p-3">{children}</main>
      </div>
    </div>
  );
}
