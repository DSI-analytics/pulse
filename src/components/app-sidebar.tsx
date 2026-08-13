"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "@/lib/nav";
import { PulseMark } from "@/components/pulse-mark";
import { cn } from "@/lib/utils";

const GROUPS = ["Operação", "Gestão", "Sistema"] as const;

export function AppSidebar({ allowed, clinicName }: { allowed: string[]; clinicName: string }) {
  const pathname = usePathname();
  const visible = NAV_ITEMS.filter((i) => allowed.includes(i.href));

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-surface lg:flex">
      <div className="flex h-14 items-center gap-2.5 border-b border-border px-5">
        <div className="flex size-8 items-center justify-center rounded-lg bg-primary">
          <PulseMark className="size-5 text-white" />
        </div>
        <div className="min-w-0">
          <p className="font-display text-[15px] font-bold leading-none">Pulso</p>
          <p className="truncate text-[11px] text-muted-foreground">{clinicName}</p>
        </div>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
        {GROUPS.map((group) => {
          const items = visible.filter((i) => i.group === group);
          if (items.length === 0) return null;
          return (
            <div key={group}>
              <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-subtle-foreground">
                {group}
              </p>
              <ul className="space-y-0.5">
                {items.map((item) => {
                  const active =
                    item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={cn(
                          "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                          active
                            ? "bg-primary-muted text-primary"
                            : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
                        )}
                      >
                        <Icon className={cn("size-[18px]", active ? "text-primary" : "text-subtle-foreground")} />
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>

      <div className="border-t border-border p-3">
        <p className="px-2 text-[11px] text-subtle-foreground">Pulso MVP · v0.1 · Maputo</p>
      </div>
    </aside>
  );
}
