"use client";
import * as React from "react";
import Link from "next/link";
import { LogOut, ChevronDown, Palette, UserRound } from "lucide-react";
import { logoutAction } from "@/server/auth-actions";
import { useT } from "@/i18n/client";
import { initials, cn } from "@/lib/utils";

export function UserMenu({ name, roleLabel }: { name: string; roleLabel: string }) {
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
        className="press flex items-center gap-2 rounded-full py-1 pl-1 pr-1 hover:bg-fill-strong sm:pr-2.5"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="flex size-8 items-center justify-center rounded-full bg-primary-muted text-xs font-semibold text-primary">
          {initials(name)}
        </span>
        <span className="hidden text-left leading-tight sm:block">
          <span className="block text-[13px] font-medium">{name}</span>
          <span className="block text-[11px] text-muted-foreground">{roleLabel}</span>
        </span>
        <ChevronDown
          className={cn(
            "hidden size-4 text-muted-foreground transition-transform duration-300 ease-[var(--ease-spring)] sm:block",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div role="menu" className="glass-strong animate-pop absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-[22px] p-1.5">
          <div className="px-3 pb-2 pt-2">
            <p className="text-sm font-medium">{name}</p>
            <p className="text-xs text-muted-foreground">{roleLabel}</p>
          </div>
          <div className="mx-2 my-1 h-px bg-border" />
          <Link
            href="/minha-conta"
            onClick={() => setOpen(false)}
            role="menuitem"
            className="press flex w-full items-center gap-2.5 rounded-[14px] px-3 py-2.5 text-left text-sm text-foreground hover:bg-fill"
          >
            <UserRound className="size-4 text-muted-foreground" /> {t("userMenu.myAccount")}
          </Link>
          <Link
            href="/configuracoes/aparencia"
            onClick={() => setOpen(false)}
            role="menuitem"
            className="press flex w-full items-center gap-2.5 rounded-[14px] px-3 py-2.5 text-left text-sm text-foreground hover:bg-fill"
          >
            <Palette className="size-4 text-muted-foreground" /> {t("userMenu.appearance")}
          </Link>
          <form action={logoutAction}>
            <button
              type="submit"
              role="menuitem"
              className="press flex w-full items-center gap-2.5 rounded-[14px] px-3 py-2.5 text-left text-sm text-danger hover:bg-danger-muted"
            >
              <LogOut className="size-4" /> {t("userMenu.signOut")}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
