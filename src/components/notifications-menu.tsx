"use client";
import * as React from "react";
import { Bell, AlertTriangle, Info, AlertCircle, Check } from "lucide-react";
import { markAllNotificationsRead } from "@/server/notification-actions";
import { cn } from "@/lib/utils";

export interface NotificationView {
  id: string;
  title: string;
  body: string | null;
  severity: "INFO" | "AVISO" | "CRITICO";
  createdAt: string;
}

const SEV_ICON = { INFO: Info, AVISO: AlertTriangle, CRITICO: AlertCircle };
const SEV_COLOR = { INFO: "text-info", AVISO: "text-warning", CRITICO: "text-danger" };

export function NotificationsMenu({
  notifications,
  unread,
}: {
  notifications: NotificationView[];
  unread: number;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-2 hover:text-foreground"
        aria-label="Notificações"
      >
        <Bell className="size-[18px]" />
        {unread > 0 && (
          <span className="absolute right-1.5 top-1.5 flex size-4 items-center justify-center rounded-full bg-danger text-[10px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="animate-in absolute right-0 z-50 mt-1.5 w-80 overflow-hidden rounded-lg border border-border bg-card shadow-xl">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <span className="text-sm font-semibold">Notificações</span>
            {unread > 0 && (
              <form action={markAllNotificationsRead}>
                <button className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                  <Check className="size-3.5" /> Marcar lidas
                </button>
              </form>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">Sem notificações.</p>
            ) : (
              notifications.map((n) => {
                const Icon = SEV_ICON[n.severity];
                return (
                  <div key={n.id} className="flex gap-3 border-b border-border px-4 py-3 last:border-0">
                    <Icon className={cn("mt-0.5 size-4 shrink-0", SEV_COLOR[n.severity])} />
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium leading-snug">{n.title}</p>
                      {n.body && <p className="mt-0.5 text-xs text-muted-foreground">{n.body}</p>}
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
