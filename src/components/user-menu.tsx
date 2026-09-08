"use client";
import * as React from "react";
import Link from "next/link";
import { LogOut, ChevronDown, UserRound } from "lucide-react";
import { logoutAction } from "@/server/auth-actions";
import { initials } from "@/lib/utils";

export function UserMenu({ name, roleLabel }: { name: string; roleLabel: string }) {
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
        className="flex items-center gap-2 rounded-md py-1 pl-1 pr-2 hover:bg-surface-2"
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
        <ChevronDown className="size-4 text-muted-foreground" />
      </button>

      {open && (
        <div role="menu" className="animate-in absolute right-0 z-50 mt-1.5 w-52 overflow-hidden rounded-lg border border-border bg-card shadow-lg">
          <div className="border-b border-border px-3 py-2.5">
            <p className="text-sm font-medium">{name}</p>
            <p className="text-xs text-muted-foreground">{roleLabel}</p>
          </div>
          <Link
            href="/minha-conta"
            onClick={() => setOpen(false)}
            role="menuitem"
            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-foreground hover:bg-surface-2"
          >
            <UserRound className="size-4" /> Minha conta
          </Link>
          <form action={logoutAction}>
            <button
              type="submit"
              role="menuitem"
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-danger hover:bg-surface-2"
            >
              <LogOut className="size-4" /> Terminar sessão
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
