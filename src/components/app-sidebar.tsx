"use client";
import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef, useState } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { ProcessingPulse } from "@/components/processing-pulse";
import { NAV_GROUPS, NAV_ITEMS } from "@/lib/nav";
import { PulsoLogo } from "@/components/pulso-logo";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";

export function isNavActive(href: string, pathname: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

function NavPendingFeedback({ collapsed, label, loadingLabel }: { collapsed: boolean; label: string; loadingLabel: string }) {
  const { pending } = useLinkStatus();
  if (!pending) return null;

  return (
    <span
      role="status"
      aria-label={`${loadingLabel} ${label}`}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      className={cn(
        "animate-pop absolute inset-0 z-20 flex cursor-wait items-center rounded-[12px] border border-primary-edge bg-primary-muted px-3 text-primary shadow-glow",
        collapsed ? "justify-center" : "gap-3",
      )}
    >
      <ProcessingPulse />
      {!collapsed && <span className="truncate" aria-hidden>{loadingLabel}</span>}
    </span>
  );
}

/**
 * Barra lateral flutuante. O item activo é marcado por uma cápsula com aresta
 * sólida e brilho neon que desliza entre posições.
 *
 * A cápsula é posicionada escrevendo o estilo directamente no nó (sem estado
 * React) e mostrada/escondida por `visibility` — nunca por opacidade.
 */
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
  const t = useT();
  const [collapsed, setCollapsed] = useState(initiallyCollapsed);
  const listRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLSpanElement>(null);
  const itemRefs = useRef(new Map<string, HTMLAnchorElement>());
  const placedOnce = useRef(false);

  const visible = NAV_ITEMS.filter((i) => allowed.includes(i.href));
  const visibleGroups = NAV_GROUPS.map((group) => ({
    group,
    items: visible.filter((item) => item.group === group),
  })).filter(({ items }) => items.length > 0);
  const activeHref = visible.find((item) => isNavActive(item.href, pathname))?.href ?? null;

  useLayoutEffect(() => {
    const place = () => {
      const indicator = indicatorRef.current;
      const list = listRef.current;
      const node = activeHref ? itemRefs.current.get(activeHref) : undefined;
      if (!indicator || !list) return;
      if (!node) {
        indicator.style.visibility = "hidden";
        return;
      }
      const top = node.getBoundingClientRect().top - list.getBoundingClientRect().top;
      if (!placedOnce.current) indicator.style.transition = "none";
      indicator.style.visibility = "visible";
      indicator.style.height = `${node.offsetHeight}px`;
      indicator.style.transform = `translateY(${top}px)`;
      if (!placedOnce.current) {
        placedOnce.current = true;
        requestAnimationFrame(() => {
          if (indicatorRef.current) indicatorRef.current.style.transition = "";
        });
      }
    };
    place();
    const settle = setTimeout(place, 440);
    window.addEventListener("resize", place);
    return () => {
      clearTimeout(settle);
      window.removeEventListener("resize", place);
    };
  }, [activeHref, collapsed]);

  function toggleSidebar() {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `pulso-sidebar-collapsed=${next}; path=/; max-age=31536000; samesite=lax`;
  }

  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-dvh shrink-0 p-3 pr-0 transition-[width] duration-[420ms] ease-[var(--ease-spring)] lg:block print:hidden",
        collapsed ? "w-[84px]" : "w-[264px]",
      )}
    >
      <div className="glass flex h-full flex-col overflow-hidden rounded-[24px]">
        <div className={cn("flex h-16 shrink-0 items-center", collapsed ? "justify-center px-2" : "gap-2.5 pl-4 pr-2.5")}>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <PulsoLogo className="w-28" priority />
              <p className="mt-1 truncate text-[11px] text-muted-foreground">{clinicName}</p>
            </div>
          )}
          <button
            type="button"
            onClick={toggleSidebar}
            className="press flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-fill-strong hover:text-foreground"
            aria-label={collapsed ? t("nav.expandSidebar") : t("nav.collapseSidebar")}
            aria-expanded={!collapsed}
            title={collapsed ? t("nav.expandShort") : t("nav.collapseShort")}
          >
            {collapsed ? <PanelLeftOpen className="size-[18px]" /> : <PanelLeftClose className="size-[18px]" />}
          </button>
        </div>

        <div className="mx-3 h-px shrink-0 bg-border" aria-hidden />

        <nav className={cn("sidebar-scroll flex-1 overflow-y-auto overflow-x-hidden pb-4 pt-3", collapsed ? "px-2.5" : "px-3")}>
          <div ref={listRef} className={cn("relative", collapsed ? "space-y-3" : "space-y-5")}>
            <span
              ref={indicatorRef}
              aria-hidden
              className="pointer-events-none invisible absolute inset-x-0 top-0 h-10 rounded-[12px] border border-primary-edge bg-primary-muted shadow-glow transition-[transform,height] duration-[420ms] ease-[var(--ease-spring)]"
            />

            {visibleGroups.map(({ group, items }, groupIndex) => (
              <div key={group} className={cn("relative", collapsed && groupIndex > 0 && "border-t border-border pt-3")}>
                <p
                  className={cn(
                    "px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-subtle-foreground",
                    collapsed && "sr-only",
                  )}
                >
                  {t(`nav.groups.${group}`)}
                </p>
                <ul className="space-y-0.5">
                  {items.map((item) => {
                    const active = item.href === activeHref;
                    const Icon = item.icon;
                    const label = t(item.labelKey);
                    return (
                      <li key={item.href}>
                        <Link
                          ref={(node) => {
                            if (node) itemRefs.current.set(item.href, node);
                            else itemRefs.current.delete(item.href);
                          }}
                          href={item.href}
                          title={collapsed ? label : undefined}
                          aria-label={collapsed ? label : undefined}
                          aria-current={active ? "page" : undefined}
                          className={cn(
                            "press relative flex h-10 items-center gap-3 rounded-[12px] px-3 text-sm font-medium antialiased",
                            collapsed && "justify-center px-0",
                            active ? "text-primary" : "text-muted-foreground hover:bg-fill hover:text-foreground",
                          )}
                        >
                          <Icon className={cn("size-[18px] shrink-0", active ? "text-primary" : "text-subtle-foreground")} />
                          {!collapsed && <span className="truncate">{label}</span>}
                          <NavPendingFeedback collapsed={collapsed} label={label} loadingLabel={t("common.loading")} />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </nav>

      </div>
    </aside>
  );
}
