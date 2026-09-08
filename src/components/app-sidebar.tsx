"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { NAV_ITEMS } from "@/lib/nav";
import { PulseMark } from "@/components/pulse-mark";
import { cn } from "@/lib/utils";

const GROUPS = ["Operação", "Gestão", "Sistema"] as const;

export function AppSidebar({
  allowed,
  clinicName,
  initiallyCollapsed = false,
}: {
  allowed: string[];
  clinicName: string;
  initiallyCollapsed?: boolean;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(initiallyCollapsed);
  const visible = NAV_ITEMS.filter((i) => allowed.includes(i.href));
  const visibleGroups = GROUPS.map((group) => ({
    group,
    items: visible.filter((item) => item.group === group),
  })).filter(({ items }) => items.length > 0);

  function toggleSidebar() {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `pulso-sidebar-collapsed=${next}; path=/; max-age=31536000; samesite=lax`;
  }

  return (
    <aside
      className={cn(
        "hidden shrink-0 flex-col border-r border-border bg-surface transition-[width] duration-200 lg:flex",
        collapsed ? "w-16" : "w-60",
      )}
    >
      <div className={cn("flex h-14 items-center border-b border-border", collapsed ? "justify-center px-2" : "gap-2.5 px-3")}>
        {!collapsed && (
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary">
              <PulseMark className="size-5 text-white" />
            </div>
            <div className="min-w-0">
              <p className="font-display text-[15px] font-bold leading-none">Pulso</p>
              <p className="truncate text-[11px] text-muted-foreground">{clinicName}</p>
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={toggleSidebar}
          className="flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
          aria-label={collapsed ? "Expandir menu lateral" : "Encolher menu lateral"}
          aria-expanded={!collapsed}
          title={collapsed ? "Expandir menu" : "Encolher menu"}
        >
          {collapsed ? <PanelLeftOpen className="size-[18px]" /> : <PanelLeftClose className="size-[18px]" />}
        </button>
      </div>

      <nav className={cn("flex-1 overflow-y-auto py-4", collapsed ? "space-y-3 px-2" : "space-y-5 px-3")}>
        {visibleGroups.map(({ group, items }, groupIndex) => (
            <div key={group} className={cn(collapsed && groupIndex > 0 && "border-t border-border pt-3")}>
              <p className={cn(
                "px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-subtle-foreground",
                collapsed && "sr-only",
              )}>
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
                        title={collapsed ? item.label : undefined}
                        aria-label={collapsed ? item.label : undefined}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                          collapsed && "justify-center px-0",
                          active
                            ? "bg-primary-muted text-primary"
                            : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
                        )}
                      >
                        <Icon className={cn("size-[18px] shrink-0", active ? "text-primary" : "text-subtle-foreground")} />
                        {!collapsed && item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
        ))}
      </nav>

      <div className={cn("border-t border-border p-3", collapsed && "hidden")}>
        <p className="px-2 text-[11px] text-subtle-foreground">Pulso MVP · v0.1 · Maputo</p>
      </div>
    </aside>
  );
}
