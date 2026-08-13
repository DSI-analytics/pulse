"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Search, Loader2 } from "lucide-react";
import { globalSearch, type SearchHit } from "@/server/search-actions";
import { Badge } from "@/components/ui/badge";

export function CommandSearch() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [hits, setHits] = React.useState<SearchHit[]>([]);
  const [loading, setLoading] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

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
    if (open) setTimeout(() => inputRef.current?.focus(), 30);
    else {
      setQ("");
      setHits([]);
    }
  }, [open]);

  React.useEffect(() => {
    if (q.trim().length < 2) {
      setHits([]);
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      setHits(await globalSearch(q));
      setLoading(false);
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex h-9 w-full items-center gap-2 rounded-md border border-border bg-surface px-3 text-sm text-subtle-foreground transition-colors hover:border-border-strong md:w-64"
      >
        <Search className="size-4" />
        <span className="flex-1 text-left">Pesquisar…</span>
        <kbd className="hidden rounded border border-border bg-surface-2 px-1.5 text-[11px] font-medium text-muted-foreground md:inline">
          ⌘K
        </kbd>
      </button>

      {open && (
        <div className="fixed inset-0 z-[90] flex items-start justify-center bg-black/40 p-4 pt-[12vh] backdrop-blur-sm">
          <div className="absolute inset-0" onClick={() => setOpen(false)} aria-hidden />
          <div className="animate-in relative z-10 w-full max-w-xl overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
            <div className="flex items-center gap-3 border-b border-border px-4">
              {loading ? (
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              ) : (
                <Search className="size-4 text-muted-foreground" />
              )}
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Pesquisar pacientes, médicos, fornecedores, planos…"
                className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-subtle-foreground"
              />
            </div>
            <div className="max-h-80 overflow-y-auto p-2">
              {hits.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                  {q.length < 2 ? "Escreva para pesquisar em toda a clínica." : "Sem resultados."}
                </p>
              ) : (
                hits.map((h, i) => (
                  <button
                    key={i}
                    onClick={() => go(h.href)}
                    className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left hover:bg-surface-2"
                  >
                    <Badge variant="neutral" className="shrink-0">
                      {h.type}
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
