import { CheckCircle2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

/** Mensagem do resultado de uma acção (sucesso/erro), anunciada a leitores de ecrã. */
export function FormStatus({ state, className }: { state: { ok: boolean; message: string } | null; className?: string }) {
  if (!state) return null;
  const Icon = state.ok ? CheckCircle2 : AlertTriangle;
  return (
    <p
      role={state.ok ? "status" : "alert"}
      className={cn(
        "flex items-center gap-2 rounded-lg border px-3 py-2 text-[13px] font-medium",
        state.ok ? "border-success-edge bg-success-muted text-success" : "border-danger-edge bg-danger-muted text-danger",
        className,
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      {state.message}
    </p>
  );
}

/** Linha de definição: rótulo e ajuda à esquerda, controlo à direita (empilha em ecrãs estreitos). */
export function SettingRow({
  label,
  hint,
  htmlFor,
  hintId,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  hintId?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="min-w-0">
        {htmlFor ? (
          <label htmlFor={htmlFor} className="text-sm font-medium text-foreground">{label}</label>
        ) : (
          <p className="text-sm font-medium text-foreground">{label}</p>
        )}
        {hint && <p id={hintId} className="mt-0.5 text-[13px] text-muted-foreground">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
