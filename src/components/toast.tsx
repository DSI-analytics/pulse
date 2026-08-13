"use client";
import * as React from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, AlertTriangle, Info, X } from "lucide-react";
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
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  const push = React.useCallback((message: string, kind: ToastKind = "success") => {
    const id = Date.now() + Math.floor(performance.now());
    setToasts((t) => [...t, { id, message, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3800);
  }, []);

  const Icon = { success: CheckCircle2, error: AlertTriangle, info: Info };

  return (
    <ToastCtx.Provider value={push}>
      {children}
      {mounted &&
        createPortal(
          <div className="fixed bottom-5 left-1/2 z-[100] flex -translate-x-1/2 flex-col items-center gap-2">
            {toasts.map((t) => {
              const I = Icon[t.kind];
              return (
                <div
                  key={t.id}
                  className="animate-in flex items-center gap-2.5 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium shadow-lg"
                >
                  <I
                    className={cn(
                      "size-4",
                      t.kind === "success" && "text-success",
                      t.kind === "error" && "text-danger",
                      t.kind === "info" && "text-info",
                    )}
                  />
                  <span>{t.message}</span>
                  <button
                    onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}
                    className="text-subtle-foreground hover:text-foreground"
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
