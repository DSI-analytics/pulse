"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";
import { createPortal } from "react-dom";
import { LayoutGrid, X } from "lucide-react";
import { NAV_GROUPS, NAV_ITEMS } from "@/lib/nav";
import { isNavActive } from "@/components/app-sidebar";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";

const PRIMARY_SLOTS = 4;

/**
 * Navegação para tablet e telemóvel (abaixo de `lg`), que antes não existia:
 * a barra lateral só aparece a partir de 1024px.
 *
 * Barra de separadores flutuante em vidro, como no iOS 26: os primeiros itens a
 * que o perfil tem acesso ficam à mão do polegar; os restantes abrem numa folha.
 * As entradas e permissões são exactamente as da barra lateral (`NAV_ITEMS`).
 */
export function MobileNav({ allowed }: { allowed: string[] }) {
  const pathname = usePathname();
  const t = useT();
  const [open, setOpen] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    const id = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(id);
  }, []);

  // Fecha a folha ao navegar.
  React.useEffect(() => {
    const id = setTimeout(() => setOpen(false), 0);
    return () => clearTimeout(id);
  }, [pathname]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  const visible = NAV_ITEMS.filter((i) => allowed.includes(i.href));
  const primary = visible.slice(0, PRIMARY_SLOTS);
  const overflow = visible.slice(PRIMARY_SLOTS);
  const overflowActive = overflow.some((item) => isNavActive(item.href, pathname));

  if (!visible.length) return null;

  return (
    <>
      <nav
        aria-label={t("nav.mainNavigation")}
        className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden print:hidden"
      >
        <ul className="glass flex w-full max-w-md items-stretch gap-1 rounded-[26px] p-1.5">
          {primary.map((item) => {
            const active = isNavActive(item.href, pathname);
            const Icon = item.icon;
            return (
              <li key={item.href} className="flex-1">
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "press flex h-14 flex-col items-center justify-center gap-1 rounded-[20px] text-[10.5px] font-medium",
                    active ? "bg-primary-muted text-primary ring-1 ring-inset ring-primary-edge" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="size-[20px]" aria-hidden />
                  <span className="max-w-full truncate px-1">{t(item.labelKey)}</span>
                </Link>
              </li>
            );
          })}
          {overflow.length > 0 && (
            <li className="flex-1">
              <button
                type="button"
                onClick={() => setOpen(true)}
                aria-haspopup="dialog"
                aria-expanded={open}
                className={cn(
                  "press flex h-14 w-full flex-col items-center justify-center gap-1 rounded-[20px] text-[10.5px] font-medium",
                  overflowActive ? "bg-primary-muted text-primary ring-1 ring-inset ring-primary-edge" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <LayoutGrid className="size-[20px]" aria-hidden />
                <span>{t("nav.more")}</span>
              </button>
            </li>
          )}
        </ul>
      </nav>

      {mounted && open &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-end justify-center lg:hidden" role="dialog" aria-modal="true" aria-label={t("nav.navigation")}>
            <div className="animate-backdrop absolute inset-0 bg-scrim" onClick={() => setOpen(false)} aria-hidden />
            <div className="glass-strong animate-sheet relative z-10 max-h-[80dvh] w-full max-w-md overflow-y-auto rounded-t-[28px] px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-2">
              <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-border-strong" aria-hidden />
              <div className="mb-1 flex justify-end">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="press flex size-8 items-center justify-center rounded-full bg-fill-strong text-muted-foreground"
                  aria-label={t("common.close")}
                >
                  <X className="size-4" />
                </button>
              </div>
              <div className="space-y-4">
                {NAV_GROUPS.map((group) => {
                  const items = visible.filter((item) => item.group === group);
                  if (!items.length) return null;
                  return (
                    <div key={group}>
                      <p className="px-2 pb-2 text-[11px] font-medium uppercase tracking-[0.08em] text-subtle-foreground">{t(`nav.groups.${group}`)}</p>
                      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                        {items.map((item) => {
                          const active = isNavActive(item.href, pathname);
                          const Icon = item.icon;
                          return (
                            <li key={item.href}>
                              <Link
                                href={item.href}
                                aria-current={active ? "page" : undefined}
                                className={cn(
                                  "press flex h-[78px] flex-col items-center justify-center gap-1.5 rounded-[18px] px-1 text-center text-[11.5px] font-medium leading-tight",
                                  active
                                    ? "bg-primary-muted text-primary ring-1 ring-inset ring-primary-edge"
                                    : "bg-fill text-foreground hover:bg-fill-strong",
                                )}
                              >
                                <Icon className={cn("size-5", active ? "text-primary" : "text-muted-foreground")} aria-hidden />
                                <span className="line-clamp-2">{t(item.labelKey)}</span>
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
