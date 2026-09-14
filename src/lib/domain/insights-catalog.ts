/**
 * Catálogo de Insights partilhado (sem dependências de servidor).
 *
 * Identificadores estáveis das métricas e dos períodos, usados pelo
 * classificador de perguntas, pelo servidor que executa as métricas, pela API
 * e pelos testes. Os rótulos apresentados vivem no dicionário
 * (`insights.metrics.*`, `insights.periods.*`).
 */

export const METRIC_IDS = [
  "patients.total",
  "patients.new",
  "patients.active",
  "patients.monthly_series",
  "patients.by_gender",
  "patients.by_age_group",
  "appointments.total",
  "appointments.by_status",
  "appointments.cancellation_rate",
  "appointments.no_show_rate",
  "appointments.by_doctor",
  "appointments.by_specialty",
  "appointments.monthly_series",
  "appointments.by_weekday",
  "appointments.by_hour",
  "specialties.growth",
  "finance.revenue",
  "finance.revenue_monthly_series",
  "finance.payments_received",
  "finance.outstanding",
  "finance.revenue_per_patient",
  "finance.expenses",
  "finance.expenses_by_category",
  "finance.net_result",
  "finance.revenue_by_specialty",
  "finance.revenue_by_doctor",
  "finance.payments_by_method",
  "operations.consultation_duration",
  "operations.doctor_productivity",
  "inventory.low_stock",
  "inventory.expiring",
] as const;

export type MetricId = (typeof METRIC_IDS)[number];

export function isMetricId(value: unknown): value is MetricId {
  return typeof value === "string" && (METRIC_IDS as readonly string[]).includes(value);
}

export const PERIOD_KEYS = [
  "hoje",
  "ontem",
  "esta_semana",
  "semana_passada",
  "ultimos_7_dias",
  "este_mes",
  "mes_anterior",
  "ultimos_30_dias",
  "ultimos_3_meses",
  "ultimos_6_meses",
  "ultimos_12_meses",
  "este_ano",
  "ano_passado",
] as const;

export type PeriodKey = (typeof PERIOD_KEYS)[number];

export function isPeriodKey(value: unknown): value is PeriodKey {
  return typeof value === "string" && (PERIOD_KEYS as readonly string[]).includes(value);
}

/** Perguntas seguintes sugeridas depois de cada métrica (filtradas por permissão). */
export const RELATED_METRICS: Record<MetricId, MetricId[]> = {
  "patients.total": ["patients.new", "patients.by_gender", "patients.by_age_group"],
  "patients.new": ["patients.monthly_series", "patients.total", "patients.by_age_group"],
  "patients.active": ["patients.new", "finance.revenue_per_patient", "appointments.total"],
  "patients.monthly_series": ["patients.new", "appointments.monthly_series"],
  "patients.by_gender": ["patients.by_age_group", "patients.total"],
  "patients.by_age_group": ["patients.by_gender", "patients.total"],
  "appointments.total": ["appointments.by_status", "appointments.monthly_series", "appointments.by_specialty"],
  "appointments.by_status": ["appointments.cancellation_rate", "appointments.no_show_rate"],
  "appointments.cancellation_rate": ["appointments.no_show_rate", "appointments.by_status"],
  "appointments.no_show_rate": ["appointments.cancellation_rate", "appointments.by_weekday"],
  "appointments.by_doctor": ["operations.doctor_productivity", "finance.revenue_by_doctor"],
  "appointments.by_specialty": ["specialties.growth", "finance.revenue_by_specialty"],
  "appointments.monthly_series": ["appointments.total", "appointments.by_weekday"],
  "appointments.by_weekday": ["appointments.by_hour", "appointments.by_specialty"],
  "appointments.by_hour": ["appointments.by_weekday", "operations.consultation_duration"],
  "specialties.growth": ["appointments.by_specialty", "finance.revenue_by_specialty"],
  "finance.revenue": ["finance.revenue_monthly_series", "finance.expenses", "finance.net_result"],
  "finance.revenue_monthly_series": ["finance.revenue", "finance.net_result"],
  "finance.payments_received": ["finance.payments_by_method", "finance.outstanding"],
  "finance.outstanding": ["finance.payments_received", "finance.revenue"],
  "finance.revenue_per_patient": ["finance.revenue", "patients.active"],
  "finance.expenses": ["finance.expenses_by_category", "finance.net_result"],
  "finance.expenses_by_category": ["finance.expenses", "finance.net_result"],
  "finance.net_result": ["finance.revenue", "finance.expenses"],
  "finance.revenue_by_specialty": ["appointments.by_specialty", "finance.revenue"],
  "finance.revenue_by_doctor": ["appointments.by_doctor", "finance.revenue"],
  "finance.payments_by_method": ["finance.payments_received", "finance.outstanding"],
  "operations.consultation_duration": ["operations.doctor_productivity", "appointments.by_hour"],
  "operations.doctor_productivity": ["appointments.by_doctor", "operations.consultation_duration"],
  "inventory.low_stock": ["inventory.expiring"],
  "inventory.expiring": ["inventory.low_stock"],
};

/** Sugestões iniciais do chat (filtradas pelas permissões de quem pergunta). */
export const DEFAULT_SUGGESTED_METRICS: MetricId[] = [
  "patients.new",
  "appointments.by_specialty",
  "appointments.by_doctor",
  "finance.revenue_monthly_series",
  "finance.net_result",
  "appointments.cancellation_rate",
  "appointments.by_weekday",
  "inventory.low_stock",
  "patients.by_age_group",
];
