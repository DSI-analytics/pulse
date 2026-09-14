import { AlertTriangle, ShieldAlert, Activity } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ClinicalAlert } from "@/server/clinical-record";
import { getTranslator } from "@/i18n/server";

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
export async function ClinicalAlerts({ alerts }: { alerts: ClinicalAlert[] }) {
  const t = await getTranslator();

  if (!alerts.length) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border bg-fill-subtle px-4 py-2.5 text-[13px] text-muted-foreground">
        <ShieldAlert className="size-4 text-subtle-foreground" aria-hidden />
        {t("clinical.alerts.none")}
      </div>
    );
  }

  const critical = alerts.some((a) => a.severity === "CRITICO");

  return (
    <section
      aria-label={t("clinical.alerts.label")}
      className={
        critical
          ? "rounded-lg border-2 border-danger-edge bg-danger-muted p-4"
          : "rounded-lg border-2 border-warning-edge bg-warning-muted p-4"
      }
    >
      <div className="flex items-center gap-2">
        <ShieldAlert className={critical ? "size-5 text-danger" : "size-5 text-warning"} aria-hidden />
        <h2 className={critical ? "font-display text-sm font-semibold text-danger" : "font-display text-sm font-semibold text-warning"}>
          {t(alerts.length === 1 ? "clinical.alerts.countOne" : "clinical.alerts.countOther", { count: alerts.length })}
        </h2>
      </div>
      <ul className="mt-2.5 grid gap-2 sm:grid-cols-2">
        {alerts.map((alert, index) => {
          const Icon = ICON[alert.kind];
          return (
            <li key={`${alert.kind}-${index}`} className="flex items-start gap-2 rounded-md bg-surface px-3 py-2">
              <Icon className={alert.severity === "CRITICO" ? "mt-0.5 size-4 text-danger" : "mt-0.5 size-4 text-warning"} aria-hidden />
              <div className="min-w-0">
                <p className="text-[13px] font-semibold">{alert.title}</p>
                {alert.detail && <p className="text-xs text-muted-foreground">{alert.detail}</p>}
              </div>
              <Badge variant={alert.severity === "CRITICO" ? "danger" : "warning"} className="ml-auto shrink-0">
                {alert.severity === "CRITICO" ? t("clinical.alerts.critical") : t("clinical.alerts.warning")}
              </Badge>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
