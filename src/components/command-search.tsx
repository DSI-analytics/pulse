"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { ProcessingPulse } from "@/components/processing-pulse";
import { startNavigationFeedback } from "@/components/navigation-feedback";
import { globalSearch, type SearchHit } from "@/server/search-actions";
import { Badge } from "@/components/ui/badge";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";

export function CommandSearch() {
  const router = useRouter();
  const t = useT();
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [hits, setHits] = React.useState<SearchHit[]>([]);
  const [active, setActive] = React.useState(0);
  const [loading, setLoading] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  React.useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      setTimeout(() => inputRef.current?.focus(), 30);
    } else {
      setTimeout(() => {
        setQ("");
        setHits([]);
        setActive(0);
      }, 0);
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  React.useEffect(() => {
    if (q.trim().length < 2) {
      setTimeout(() => setHits([]), 0);
      return;
    }
    const start = setTimeout(() => setLoading(true), 0);
    const timer = setTimeout(async () => {
      const result = await globalSearch(q);
      setHits(result);
      setActive(0);
      setLoading(false);
    }, 200);
    return () => {
      clearTimeout(start);
      clearTimeout(timer);
    };
  }, [q]);

  function go(href: string) {
    setOpen(false);
    startNavigationFeedback();
    router.push(href);
  }

  // Navegação por teclado nos resultados: ↑ ↓ para escolher, Enter para abrir.
  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!hits.length) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = e.key === "ArrowDown" ? (active + 1) % hits.length : (active - 1 + hits.length) % hits.length;
      setActive(next);
      listRef.current?.querySelector<HTMLElement>(`[data-index="${next}"]`)?.scrollIntoView({ block: "nearest" });
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const hit = hits[active];
      if (hit) go(hit.href);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="press flex h-10 w-full items-center gap-2 rounded-full border border-border bg-fill px-3.5 text-sm text-subtle-foreground hover:bg-fill-strong md:w-72"
      >
        <Search className="size-4 shrink-0" />
        <span className="flex-1 truncate text-left">{t("nav.search.button")}</span>
        <kbd className="hidden rounded-md border border-border bg-surface px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground md:inline">
          ⌘K
        </kbd>
      </button>

      {open && (
        <div className="fixed inset-0 z-[90] flex items-start justify-center p-3 pt-[9vh] sm:p-4 sm:pt-[14vh]">
          <div className="animate-backdrop absolute inset-0 bg-scrim" onClick={() => setOpen(false)} aria-hidden />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t("nav.search.label")}
            className="glass-strong animate-in relative z-10 w-full max-w-xl overflow-hidden rounded-[24px]"
          >
            <div className="flex items-center gap-3 px-5">
              {loading ? (
                <ProcessingPulse className="text-muted-foreground" />
              ) : (
                <Search className="size-[18px] shrink-0 text-muted-foreground" />
              )}
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={onInputKeyDown}
                role="combobox"
                aria-expanded={hits.length > 0}
                aria-controls="command-search-results"
                aria-activedescendant={hits[active] ? `command-search-hit-${active}` : undefined}
                placeholder={t("nav.search.placeholder")}
                className="h-14 flex-1 bg-transparent text-[15px] outline-none placeholder:text-subtle-foreground focus-visible:outline-none"
              />
            </div>
            <div className="h-px bg-border" />
            <div ref={listRef} id="command-search-results" role="listbox" className="max-h-[min(22rem,60dvh)] overflow-y-auto p-2">
              {hits.length === 0 ? (
                <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                  {q.length < 2 ? t("nav.search.hint") : t("nav.search.noResults")}
                </p>
              ) : (
                hits.map((h, i) => (
                  <button
                    key={i}
                    id={`command-search-hit-${i}`}
                    data-index={i}
                    role="option"
                    aria-selected={i === active}
                    onClick={() => go(h.href)}
                    onMouseEnter={() => setActive(i)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-[14px] px-3 py-2.5 text-left transition-colors duration-150",
                      i === active ? "bg-fill-strong" : "hover:bg-fill",
                    )}
                  >
                    <Badge variant="neutral" className="shrink-0">
                      {t(`nav.search.types.${h.type}`)}
                    </Badge>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{h.label}</span>
                      <span className="block truncate text-xs text-muted-foreground">{h.sub}</span>
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
