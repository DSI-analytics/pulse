"use client";
import * as React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";

/**
 * Folha modal em vidro (iOS 26).
 *
 * - Em ecrãs estreitos é uma folha que sobe do fundo, com pega; em ecrãs largos
 *   flutua ao centro.
 * - Cabeçalho e rodapé ficam fixos e só o corpo desloca — em formulários longos
 *   (receita, marcação) os botões de acção estão sempre à vista.
 * - A API é a mesma de antes: `title`, `description`, `footer`, `className`.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  const t = useT();
  const [mounted, setMounted] = React.useState(false);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const onCloseRef = React.useRef(onClose);
  const titleId = React.useId();

  React.useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  React.useEffect(() => {
    const id = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(id);
  }, []);

  React.useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCloseRef.current();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    // Leva o foco para dentro da folha, sem roubar o autofocus de um campo.
    const focusTimer = setTimeout(() => {
      if (panelRef.current && !panelRef.current.contains(document.activeElement)) panelRef.current.focus();
    }, 0);
    return () => {
      clearTimeout(focusTimer);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      previouslyFocused?.focus?.();
    };
  }, [open]);

  if (!mounted || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <div
        className="animate-backdrop absolute inset-0 bg-scrim"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          "glass-strong animate-sheet relative z-10 flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-[28px] outline-none",
          "sm:max-h-[calc(100dvh-3rem)] sm:rounded-[28px]",
          className,
        )}
      >
        <div className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-border-strong sm:hidden" aria-hidden />

        <div className="flex shrink-0 items-start justify-between gap-4 px-6 pb-3 pt-4 sm:pt-6">
          <div className="min-w-0 space-y-1">
            <h2 id={titleId} className="font-display text-[19px] font-semibold leading-tight tracking-[-0.015em]">
              {title}
            </h2>
            {description && <p className="text-[13px] leading-relaxed text-muted-foreground">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="press -mr-1.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-fill-strong text-muted-foreground hover:bg-fill-strong hover:text-foreground"
            aria-label={t("common.close")}
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-5 pt-1">{children}</div>

        {footer && (
          <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-border px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
