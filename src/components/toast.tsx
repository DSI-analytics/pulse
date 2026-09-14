"use client";
import * as React from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, AlertTriangle, Info, X } from "lucide-react";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";

type ToastKind = "success" | "error" | "info";
interface Toast {
  id: number;
  message: string;
  kind: ToastKind;
}

const ToastCtx = React.createContext<(message: string, kind?: ToastKind) => void>(() => {});

export function useToast() {
  return React.useContext(ToastCtx);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const translate = useT();
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => {
    const id = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(id);
  }, []);

  const push = React.useCallback((message: string, kind: ToastKind = "success") => {
    const id = Date.now() + Math.floor(performance.now());
    setToasts((t) => [...t, { id, message, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3800);
  }, []);

  const Icon = { success: CheckCircle2, error: AlertTriangle, info: Info };
  const tone = { success: "bg-success-muted text-success", error: "bg-danger-muted text-danger", info: "bg-info-muted text-info" };

  return (
    <ToastCtx.Provider value={push}>
      {children}
      {mounted &&
        createPortal(
          // Acima da barra de navegação móvel; no desktop, junto ao fundo.
          <div
            className="pointer-events-none fixed inset-x-0 bottom-28 z-[100] flex flex-col items-center gap-2 px-3 lg:bottom-6"
            aria-live="polite"
          >
            {toasts.map((t) => {
              const I = Icon[t.kind];
              return (
                <div
                  key={t.id}
                  role="status"
                  className="glass-strong animate-toast pointer-events-auto flex max-w-full items-center gap-2.5 rounded-full py-2 pl-2 pr-2 text-sm font-medium sm:max-w-md"
                >
                  <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-full", tone[t.kind])}>
                    <I className="size-4" />
                  </span>
                  <span className="min-w-0 pr-1">{t.message}</span>
                  <button
                    onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}
                    className="press flex size-7 shrink-0 items-center justify-center rounded-full text-subtle-foreground hover:bg-fill-strong hover:text-foreground"
                    aria-label={translate("common.close")}
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              );
            })}
          </div>,
          document.body,
        )}
    </ToastCtx.Provider>
  );
}
