"use client";
import * as React from "react";
import { Bell, AlertTriangle, Info, AlertCircle, Check } from "lucide-react";
import { markAllNotificationsRead } from "@/server/notification-actions";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";

export interface NotificationView {
  id: string;
  title: string;
  body: string | null;
  severity: "INFO" | "AVISO" | "CRITICO";
  createdAt: string;
}

const SEV_ICON = { INFO: Info, AVISO: AlertTriangle, CRITICO: AlertCircle };
const SEV_COLOR = { INFO: "text-info bg-info-muted", AVISO: "text-warning bg-warning-muted", CRITICO: "text-danger bg-danger-muted" };

export function NotificationsMenu({
  notifications,
  unread,
}: {
  notifications: NotificationView[];
  unread: number;
}) {
  const t = useT();
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="press relative flex size-10 items-center justify-center rounded-full text-muted-foreground hover:bg-fill-strong hover:text-foreground"
        aria-label={t("nav.notifications.title")}
        aria-haspopup="true"
        aria-expanded={open}
      >
        <Bell className="size-[18px]" />
        {unread > 0 && (
          <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold leading-none text-white ring-2 ring-surface">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="glass-strong animate-pop z-50 overflow-hidden rounded-[22px] max-sm:fixed max-sm:inset-x-3 max-sm:top-[4.75rem] sm:absolute sm:right-0 sm:mt-2 sm:w-[22rem]">
          <div className="flex items-center justify-between px-4 pb-2 pt-3.5">
            <span className="text-[15px] font-semibold tracking-[-0.01em]">{t("nav.notifications.title")}</span>
            {unread > 0 && (
              <form action={markAllNotificationsRead}>
                <button className="press inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary-muted">
                  <Check className="size-3.5" /> {t("nav.notifications.markAllRead")}
                </button>
              </form>
            )}
          </div>
          <div className="max-h-[min(26rem,65dvh)] overflow-y-auto px-2 pb-2">
            {notifications.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-muted-foreground">{t("nav.notifications.empty")}</p>
            ) : (
              notifications.map((n) => {
                const Icon = SEV_ICON[n.severity];
                return (
                  <div key={n.id} className="flex gap-3 rounded-[16px] px-3 py-2.5 transition-colors duration-150 hover:bg-fill">
                    <span className={cn("mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full", SEV_COLOR[n.severity])}>
                      <Icon className="size-3.5" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium leading-snug">{n.title}</p>
                      {n.body && <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{n.body}</p>}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
