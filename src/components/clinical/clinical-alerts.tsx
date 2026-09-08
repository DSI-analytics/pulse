import { AlertTriangle, ShieldAlert, Activity } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ClinicalAlert } from "@/server/clinical-record";

const ICON = {
  ALERGIA: ShieldAlert,
  DIAGNOSTICO: AlertTriangle,
  SINAL_VITAL: Activity,
  RESULTADO: AlertTriangle,
} as const;

/**
 * Faixa de alertas clínicos, no topo do prontuário.
 *
 * Informação crítica — alergias, sinais vitais fora do intervalo — tem de ser
 * vista antes de qualquer decisão terapêutica, por isso aparece acima de tudo
 * o resto e com contraste elevado.
 */
export function ClinicalAlerts({ alerts }: { alerts: ClinicalAlert[] }) {
  if (!alerts.length) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-2/50 px-4 py-2.5 text-[13px] text-muted-foreground">
        <ShieldAlert className="size-4 text-subtle-foreground" aria-hidden />
        Sem alergias ou alertas clínicos registados.
      </div>
    );
  }

  const critical = alerts.some((a) => a.severity === "CRITICO");

  return (
    <section
      aria-label="Alertas clínicos"
      className={
        critical
          ? "rounded-lg border-2 border-danger/60 bg-danger-muted/60 p-4"
          : "rounded-lg border-2 border-warning/50 bg-warning-muted/50 p-4"
      }
    >
      <div className="flex items-center gap-2">
        <ShieldAlert className={critical ? "size-5 text-danger" : "size-5 text-warning"} aria-hidden />
        <h2 className={critical ? "font-display text-sm font-semibold text-danger" : "font-display text-sm font-semibold text-warning"}>
          {alerts.length} alerta{alerts.length === 1 ? "" : "s"} clínico{alerts.length === 1 ? "" : "s"}
        </h2>
      </div>
      <ul className="mt-2.5 grid gap-2 sm:grid-cols-2">
        {alerts.map((alert, index) => {
          const Icon = ICON[alert.kind];
          return (
            <li key={`${alert.kind}-${index}`} className="flex items-start gap-2 rounded-md bg-surface/70 px-3 py-2">
              <Icon className={alert.severity === "CRITICO" ? "mt-0.5 size-4 text-danger" : "mt-0.5 size-4 text-warning"} aria-hidden />
              <div className="min-w-0">
                <p className="text-[13px] font-semibold">{alert.title}</p>
                {alert.detail && <p className="text-xs text-muted-foreground">{alert.detail}</p>}
              </div>
              <Badge variant={alert.severity === "CRITICO" ? "danger" : "warning"} className="ml-auto shrink-0">
                {alert.severity === "CRITICO" ? "Crítico" : "Aviso"}
              </Badge>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
