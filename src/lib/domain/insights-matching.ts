// Correspondência determinística entre pergunta e métrica.
//
// Esta camada funciona SEM IA e é o caminho de recurso quando o modelo não está
// configurado ou falha. Também é ela que define o limite do que o assistente
// consegue responder: uma pergunta que não corresponda a nenhuma métrica do
// catálogo não produz consulta nenhuma.

import type { MetricId, PeriodKey } from "@/server/analytics-metrics";

interface Rule {
  metric: MetricId;
  keywords: string[][];
}

/** Cada regra exige que TODOS os grupos tenham pelo menos um termo presente. */
const RULES: Rule[] = [
  { metric: "finance.revenue_monthly_series", keywords: [["receita", "facturacao", "faturacao"], ["compare", "comparar", "evolucao", "meses", "ultimos", "tendencia"]] },
  { metric: "finance.revenue_per_patient", keywords: [["receita"], ["media", "por paciente"]] },
  { metric: "finance.outstanding", keywords: [["pendente", "por receber", "divida", "receber"]] },
  { metric: "finance.payments_received", keywords: [["pagamento", "recebido", "recebemos"]] },
  { metric: "finance.revenue", keywords: [["receita", "facturacao", "faturacao", "faturamos", "ganhamos"]] },
  { metric: "appointments.by_doctor", keywords: [["medico", "profissional", "doutor"], ["mais", "ranking", "qual", "top", "realizou"]] },
  { metric: "operations.doctor_productivity", keywords: [["produtividade"]] },
  { metric: "specialties.growth", keywords: [["especialidade"], ["cresc", "evolu", "compar"]] },
  { metric: "appointments.by_specialty", keywords: [["especialidade"]] },
  { metric: "appointments.cancellation_rate", keywords: [["cancel"]] },
  { metric: "appointments.no_show_rate", keywords: [["falta", "no-show", "no show", "comparec"]] },
  { metric: "appointments.by_weekday", keywords: [["dia", "dias"], ["semana", "movimento"]] },
  { metric: "appointments.by_hour", keywords: [["hora", "horario", "horarios"]] },
  { metric: "operations.consultation_duration", keywords: [["tempo", "duracao"], ["atendimento", "consulta"]] },
  { metric: "appointments.monthly_series", keywords: [["consulta", "marcacao", "marcacoes"], ["evolucao", "ultimos", "meses", "tendencia", "grafico"]] },
  { metric: "appointments.total", keywords: [["consulta", "marcacao", "marcacoes", "atendimento"]] },
  { metric: "patients.monthly_series", keywords: [["paciente"], ["evolucao", "ultimos", "meses", "tendencia", "grafico"]] },
  { metric: "patients.new", keywords: [["paciente"], ["novo", "novos", "cresc", "aumento"]] },
  { metric: "patients.active", keywords: [["paciente"], ["activo", "ativo"]] },
  // Exige um termo de contagem: a palavra "paciente" sozinha aparece em
  // perguntas clínicas ("qual o diagnóstico do paciente X?") que este
  // assistente não responde — e que não devem cair numa métrica qualquer.
  { metric: "patients.total", keywords: [["paciente"], ["quantos", "quantas", "total", "numero", "quantidade", "temos registados", "registados"]] },
];

function normalise(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

const PERIOD_RULES: [PeriodKey, string[]][] = [
  ["mes_anterior", ["mes passado", "mes anterior"]],
  ["ultimos_3_meses", ["tres meses", "3 meses", "ultimo trimestre", "trimestre"]],
  ["ultimos_6_meses", ["seis meses", "6 meses", "semestre"]],
  ["ultimos_12_meses", ["doze meses", "12 meses", "ultimo ano"]],
  ["ultimos_30_dias", ["30 dias", "trinta dias", "ultimo mes"]],
  ["este_ano", ["este ano", "ano actual", "ano atual"]],
  ["este_mes", ["este mes", "mes actual", "mes atual"]],
];

export function detectPeriod(question: string): PeriodKey {
  const text = normalise(question);
  for (const [period, terms] of PERIOD_RULES) {
    if (terms.some((term) => text.includes(term))) return period;
  }
  return "este_mes";
}

/** Escolhe a métrica por palavras-chave. Devolve `null` quando nada encaixa. */
export function matchMetric(question: string, allowed: Set<MetricId>): MetricId | null {
  const text = normalise(question);
  for (const rule of RULES) {
    if (!allowed.has(rule.metric)) continue;
    if (rule.keywords.every((group) => group.some((term) => text.includes(term)))) return rule.metric;
  }
  return null;
}
