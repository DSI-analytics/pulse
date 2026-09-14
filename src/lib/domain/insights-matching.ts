// Classificador determinístico de perguntas de gestão (PT + EN).
//
// Funciona SEM IA e é o caminho principal quando o modelo não está configurado
// (ou o caminho de recurso quando falha). Também define o limite do que o
// assistente responde: uma pergunta que não corresponda a nenhuma métrica do
// catálogo não produz consulta nenhuma.
//
// Como funciona:
//  1. normaliza o texto (minúsculas, sem acentos nem pontuação);
//  2. detecta CONCEITOS (paciente, receita, médico, tendência…) a partir de
//     vocabulário em português e inglês, tolerando plurais, conjugações e
//     pequenos erros de escrita;
//  3. pontua cada INTENÇÃO (métrica) pelos conceitos presentes — conceitos
//     específicos (faltas, lucro, género…) pesam mais do que genéricos
//     (paciente, consulta…) — e escolhe a de maior pontuação;
//  4. detecta o período ("hoje", "last month", "últimos 90 dias"…) e usa o
//     contexto da pergunta anterior em continuações ("e no mês passado?").
//
// A qualidade é medida contra o conjunto rotulado em
// `insights-matching.dataset.ts` (ver o teste respectivo).

import type { MetricId, PeriodKey } from "./insights-catalog";

// ─────────────────────────────────────────────────────────────────────────────
// Normalização e correspondência de termos
// ─────────────────────────────────────────────────────────────────────────────

export function normalise(text: string): string {
  const plain = text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/no[\s-]?shows?/g, " noshow ")
    .replace(/\bm[\s-]pesa\b/g, " mpesa ")
    .replace(/\be[\s-]mola\b/g, " emola ")
    .replace(/[^a-z0-9%]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return ` ${plain} `;
}

function tokenise(normalised: string): string[] {
  return normalised.trim().split(" ").filter(Boolean);
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const above = previous[j];
      previous[j] = Math.min(previous[j] + 1, previous[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return previous[b.length];
}

type WordMatcher = (token: string) => boolean;

/**
 * "palavra" = palavra exacta (tolera 1 erro a partir de 6 letras);
 * "prefix*" = qualquer palavra começada por "prefix" (tolera 1 erro a partir de 7 letras);
 * "*" = qualquer palavra (só dentro de frases).
 */
function wordMatcher(word: string, strict: boolean): WordMatcher {
  if (word === "*") return () => true;
  if (strict) {
    if (word.endsWith("*")) {
      const stem = word.slice(0, -1);
      return (token) => token.startsWith(stem);
    }
    return (token) => token === word;
  }
  if (word.endsWith("*")) {
    const stem = word.slice(0, -1);
    return (token) => {
      if (token.startsWith(stem)) return true;
      if (stem.length < 7) return false;
      return [stem.length - 1, stem.length, stem.length + 1].some(
        (length) => token.length >= length && levenshtein(token.slice(0, length), stem) <= 1,
      );
    };
  }
  return (token) =>
    token === word ||
    (word.length >= 6 && token.length >= 5 && Math.abs(token.length - word.length) <= 1 && levenshtein(token, word) <= 1);
}

type Phrase = WordMatcher[];

function compilePhrase(term: string, strict = false): Phrase {
  return term.split(" ").map((word) => wordMatcher(word, strict));
}

function phraseIn(tokens: string[], phrase: Phrase): boolean {
  for (let start = 0; start + phrase.length <= tokens.length; start += 1) {
    if (phrase.every((matches, offset) => matches(tokens[start + offset]))) return true;
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Vocabulário (conceitos)
// ─────────────────────────────────────────────────────────────────────────────

const VOCABULARY = {
  PATIENT: ["pacient*", "utente*", "doente*", "patient*", "cliente*", "client*"],
  DOCTOR: ["medico", "medicos", "medica", "medicas", "doutor*", "doctor*", "profission*", "physician*", "clinician*", "dr", "dra", "especialista*"],
  SPECIALTY: ["especialidad*", "specialt*", "speciali*", "areas clinicas", "area clinica", "areas medicas"],
  APPOINTMENT: ["marcac*", "agendad*", "agendament*", "appointment*", "booking*", "booked", "consult*", "atendiment*", "atend*", "visit*"],
  REVENUE: [
    "receit*", "receita", "receitas", "factur*", "fatur*", "revenue*", "income*", "ganh*", "earn*", "sales", "vend*", "turnover", "rendiment*", "arrecad*",
    "bill", "billed", "billing", "quanto entrou", "dinheiro entrou", "came in", "come in", "how much money", "quanto dinheiro", "did we make", "we made",
  ],
  EXPENSE: [
    "despes*", "gast*", "custo*", "expense*", "spend*", "spent", "cost", "costs", "pagamos a", "pagamos aos", "we paid",
    "salario*", "salary", "salaries", "renda", "rent", "fornecedor*", "supplier*", "compras", "purchases",
  ],
  PROFIT: [
    "lucro*", "profit*", "resultado liquido", "resultado operacional", "resultado financeiro", "margem", "margens", "margin*",
    "net income", "bottom line", "ganho liquido", "prejuizo*", "loss", "losses", "receitas menos", "receita menos", "revenue minus", "income minus",
  ],
  PAYMENT: ["pagament*", "payment*", "recebid*", "recebemos", "receive", "received", "receipt*", "cobrad*", "collected", "entrou em caixa"],
  OUTSTANDING: [
    "pendent*", "por receber", "a receber", "em aberto", "divid*", "debt*", "devedor*", "outstanding", "receivabl*", "unpaid",
    "nao pag*", "atrasad*", "overdue", "owe", "owes", "owed", "devem", "falta receber", "calote*", "vencid*",
  ],
  METHOD: [
    "metodo*", "method*", "forma* de pagamento", "formas de pagar", "meio* de pagamento", "modo* de pagamento", "tipo* de pagamento",
    "mpesa", "emola", "cartao", "cartoes", "card", "cards", "transferenc*", "bank transfer", "numerario", "em dinheiro", "cash",
    "como pagam", "pagam", "patients pay", "payment type*",
  ],
  CANCEL: ["cancel*", "desmarc*"],
  NOSHOW: [
    "falt*", "noshow", "nao compareceu", "nao compareceram", "nao comparecem", "comparec*", "nao vieram", "nao apareceram",
    "did not show", "didn t show", "missed", "absent*", "ausent*", "ausenc*",
  ],
  STATUS: ["por estado", "por status", "estado das", "estados das", "estado dos", "status das", "status of", "by status", "situacao das", "situacao dos", "concluidas", "concluida", "completed"],
  WEEKDAY: [
    "dia da semana", "dias da semana", "weekday*", "day of the week", "days of the week", "day of week",
    "segunda*", "terca*", "quarta*", "quinta*", "sexta*", "sabado*", "domingo*",
    "monday*", "tuesday*", "wednesday*", "thursday*", "friday*", "saturday*", "sunday*",
    "que dia", "qual dia", "quais dias", "which day*", "busiest day*", "dia mais", "dias mais", "dia com mais", "dias com mais", "dia de maior", "dias de maior",
  ],
  HOUR: ["hora", "horas", "horario*", "hour", "hours", "hourly", "time of day", "que horas", "hora de ponta", "horas de ponta", "horario de pico"],
  BUSY: ["movimento*", "movimentad*", "busy", "busiest", "afluencia", "lotad*", "cheio*", "mais gente", "pico", "peak", "fluxo", "procur*", "demand*", "popular*", "ocupad*"],
  DURATION: [
    "duracao", "durac*", "durat*", "demor*", "tempo medio", "tempo de consulta", "tempo de atendimento", "tempo das consultas", "tempo por consulta",
    "quanto tempo", "how long", "length", "average time",
  ],
  WAIT: ["espera*", "wait*", "fila*"],
  PRODUCTIVITY: ["produtiv*", "productiv*", "desempenho", "performance", "eficien*", "efficien*", "taxa de conclusao", "completion rate"],
  GENDER: ["genero*", "sexo", "gender*", "sex", "homens", "mulheres", "men", "women", "masculin*", "feminin*", "female*", "male", "males"],
  AGE: ["idade*", "faixa* etaria*", "grupo* etario*", "age", "ages", "age group*", "idosos", "idosas", "criancas", "children", "elderly", "jovens", "young*", "adolescent*", "bebes", "babies"],
  STOCK: [
    "stock*", "estoque*", "inventari*", "inventor*", "medicament*", "medicine*", "produto*", "product*", "artigo*", "item", "items",
    "material*", "armazem", "warehouse", "supplies", "consumiv*", "reagente*",
  ],
  LOW: ["baixo*", "low", "minimo*", "minimum", "esgot*", "out of stock", "em falta", "acabar*", "running out", "run out", "critic*"],
  REORDER: ["encomend*", "repor", "reposicao", "reorder*", "restock*", "comprar mais", "buy more"],
  EXPIRY: ["validade*", "expir*", "caduc*", "fora do prazo", "prazo de validade"],
  EXPIRED_WORD: ["vencid*", "vence*"],
  CATEGORY: ["categor*", "rubrica*", "tipo de despesa*", "tipos de despesa*", "por tipo", "by type", "em que gast*", "com que gast*", "onde gast*", "where did we spend", "where do we spend", "spend the most on", "spending by"],
  TREND: [
    "evolu*", "evolv*", "tendenc*", "trend*", "ao longo", "over time", "mes a mes", "month by month", "month on month", "mes apos mes",
    "grafico*", "chart", "graph", "historic*", "history", "serie*", "por mes", "per month", "each month", "cada mes", "mensal*", "monthly", "progress*",
  ],
  COMPARE: ["compar*", "versus", "vs", "em relacao", "face ao", "face a", "against"],
  PLURAL_MONTHS: ["meses", "months", "mensal*", "monthly"],
  TOP: ["mais", "most", "top", "ranking", "maior", "maiores", "melhor*", "best", "highest", "lider*", "quem", "which", "who", "qual", "quais", "principais", "biggest"],
  COUNT: ["quant*", "qtos", "qtas", "qts", "total", "totais", "numero*", "number", "how many", "count", "quantidade", "soma", "tamanho"],
  NEW: ["novo", "novos", "nova", "novas", "new", "cadastr*", "inscrit*", "primeira vez", "first time", "first visit", "entraram", "signed up", "sign up", "recem*", "novos registos", "new registration*", "registaram", "joined"],
  GROWTH: ["cresc*", "grow*", "grew", "aument*", "increase*", "subiu", "subida"],
  ACTIVE: ["activ*", "ativ*", "active", "atend*", "seen", "we see", "we saw", "did we see", "vieram", "visited", "visitaram", "distint*", "unique", "unic*"],
  AVERAGE: ["media", "medio", "medias", "average", "mean", "por paciente", "per patient", "cada paciente", "each patient", "por utente", "per capita"],
  TICKET: ["ticket*"],
  CLINICAL: [
    "diagnos*", "prescri*", "receita medica", "receitas medicas", "receitas emitidas", "receita emitida", "alergi*", "allerg*", "sintoma*", "symptom*",
    "tratament*", "treatment*", "doenc*", "disease*", "diabet*", "hipertens*", "hypertens*", "malaria", "hiv", "sida", "tuberculos*",
    "gravid*", "pregnan*", "medicac*", "medication*", "dosag*", "dose", "doses", "resultado* de exame*", "resultado* dos exame*",
    "exam* result*", "test result*", "historial clinico", "historico clinico", "clinical history", "sinais vitais", "vital sign*",
    "tensao arterial", "pressao arterial", "blood pressure", "nota* clinica*", "clinical note*", "prontuario", "medical record*",
  ],
  FORECAST: [
    "previs*", "forecast*", "projec*", "predict*", "estimat*", "vai ser", "will be", "vamos ter", "we will", "futur*",
    "proximo mes", "proxima semana", "proximo ano", "amanha", "tomorrow", "next month", "next week", "next year",
  ],
  GREETING: ["ola", "oi", "bom dia", "boa tarde", "boa noite", "hello", "hi", "hey", "good morning", "good afternoon", "good evening", "saudacoes"],
  THANKS: ["obrigad*", "thanks", "thank you", "valeu", "agradeco"],
  HELP: [
    "ajuda", "help", "o que podes", "o que pode", "o que consegues", "o que sabes", "what can you", "what do you do", "como funciona",
    "how does this work", "how do i use", "que perguntas", "what questions", "exemplo*", "example*", "como usar", "what can i ask", "o que posso perguntar",
  ],
} as const satisfies Record<string, readonly string[]>;

type Concept = keyof typeof VOCABULARY;

/**
 * Conceitos sem tolerância a erros de escrita: um "quase igual" aqui produz
 * falsos positivos perigosos ("receita média" ≠ "receita médica",
 * "médio" ≠ "médico", "month" ≠ "months", "medicamentos" ≠ "medicação").
 */
const STRICT_CONCEPTS = new Set<string>([
  "CLINICAL", "FORECAST", "GREETING", "THANKS", "HELP", "DOCTOR", "PLURAL_MONTHS", "COMPARE", "TOP", "COUNT",
  // "compared" ≈ "comparec(eu)" — sem tolerância, uma comparação não vira "faltas".
  "NOSHOW",
]);

const COMPILED = Object.fromEntries(
  Object.entries(VOCABULARY).map(([concept, terms]) => [
    concept,
    terms.map((term) => compilePhrase(term, STRICT_CONCEPTS.has(concept))),
  ]),
) as Record<Concept, Phrase[]>;

/** Peso de cada conceito: específicos pesam mais do que genéricos. */
const WEIGHT: Record<Concept, number> = {
  PATIENT: 10, DOCTOR: 10, SPECIALTY: 12, APPOINTMENT: 10, REVENUE: 12, EXPENSE: 14, PROFIT: 25, PAYMENT: 10,
  OUTSTANDING: 20, METHOD: 25, CANCEL: 20, NOSHOW: 20, STATUS: 20, WEEKDAY: 20, HOUR: 20, BUSY: 6, DURATION: 25,
  WAIT: 0, PRODUCTIVITY: 25, GENDER: 25, AGE: 25, STOCK: 14, LOW: 8, REORDER: 16, EXPIRY: 25, EXPIRED_WORD: 10,
  CATEGORY: 12, TREND: 10, COMPARE: 8, PLURAL_MONTHS: 8, TOP: 5, COUNT: 5, NEW: 10, GROWTH: 8, ACTIVE: 8,
  AVERAGE: 10, TICKET: 22, CLINICAL: 0, FORECAST: 0, GREETING: 0, THANKS: 0, HELP: 0,
};

function detectConcepts(tokens: string[]): Set<Concept> {
  const present = new Set<Concept>();
  for (const concept of Object.keys(COMPILED) as Concept[]) {
    if (COMPILED[concept].some((phrase) => phraseIn(tokens, phrase))) present.add(concept);
  }
  return present;
}

// ─────────────────────────────────────────────────────────────────────────────
// Intenções (uma por métrica). A ordem desempata pontuações iguais: as mais
// específicas primeiro.
// ─────────────────────────────────────────────────────────────────────────────

interface Intent {
  metric: MetricId;
  /** Alternativas: basta uma estar completa. */
  all: Concept[][];
  /** Conceitos que reforçam a intenção quando presentes. */
  boost?: Concept[];
  /** Conceitos que a excluem. */
  none?: Concept[];
}

const INTENTS: Intent[] = [
  { metric: "finance.net_result", all: [["PROFIT"], ["REVENUE", "EXPENSE"]] },
  { metric: "finance.revenue_monthly_series", all: [["REVENUE", "TREND"], ["REVENUE", "COMPARE", "PLURAL_MONTHS"]] },
  { metric: "finance.revenue_per_patient", all: [["REVENUE", "AVERAGE"], ["TICKET"]] },
  { metric: "finance.revenue_by_specialty", all: [["REVENUE", "SPECIALTY"]], boost: ["TOP"] },
  { metric: "finance.revenue_by_doctor", all: [["REVENUE", "DOCTOR"]], boost: ["TOP"] },
  { metric: "finance.payments_by_method", all: [["METHOD"]], boost: ["PAYMENT", "REVENUE"] },
  { metric: "finance.expenses_by_category", all: [["EXPENSE", "CATEGORY"]], boost: ["TOP"] },
  { metric: "finance.expenses", all: [["EXPENSE"]], boost: ["COUNT", "COMPARE"] },
  { metric: "finance.outstanding", all: [["OUTSTANDING"]], boost: ["PATIENT", "PAYMENT"], none: ["STOCK"] },
  { metric: "finance.payments_received", all: [["PAYMENT"]], boost: ["COUNT"], none: ["OUTSTANDING"] },
  { metric: "finance.revenue", all: [["REVENUE"]], boost: ["COMPARE", "COUNT"] },
  { metric: "operations.doctor_productivity", all: [["PRODUCTIVITY"]], boost: ["DOCTOR"] },
  { metric: "operations.consultation_duration", all: [["DURATION"]], boost: ["APPOINTMENT", "AVERAGE"], none: ["WAIT"] },
  { metric: "appointments.cancellation_rate", all: [["CANCEL"]], boost: ["APPOINTMENT", "COUNT"] },
  { metric: "appointments.no_show_rate", all: [["NOSHOW"]], boost: ["PATIENT", "APPOINTMENT"], none: ["STOCK", "OUTSTANDING"] },
  { metric: "appointments.by_status", all: [["STATUS"]], boost: ["APPOINTMENT"], none: ["STOCK"] },
  { metric: "inventory.expiring", all: [["EXPIRY"], ["STOCK", "EXPIRED_WORD"]], boost: ["STOCK"] },
  { metric: "inventory.low_stock", all: [["STOCK"], ["REORDER"]], boost: ["LOW", "REORDER"], none: ["REVENUE"] },
  { metric: "patients.by_gender", all: [["GENDER"]], boost: ["PATIENT"] },
  { metric: "patients.by_age_group", all: [["AGE"]], boost: ["PATIENT"] },
  { metric: "specialties.growth", all: [["SPECIALTY", "GROWTH"], ["SPECIALTY", "TREND"], ["SPECIALTY", "COMPARE"]], boost: ["BUSY"] },
  { metric: "appointments.by_doctor", all: [["DOCTOR", "APPOINTMENT"], ["DOCTOR", "TOP"], ["DOCTOR", "COUNT"]] },
  { metric: "appointments.by_specialty", all: [["SPECIALTY"]], boost: ["APPOINTMENT", "TOP", "BUSY"] },
  { metric: "appointments.by_hour", all: [["HOUR"]], boost: ["BUSY", "APPOINTMENT"] },
  { metric: "appointments.by_weekday", all: [["WEEKDAY"], ["BUSY"]], boost: ["APPOINTMENT"] },
  { metric: "appointments.monthly_series", all: [["APPOINTMENT", "TREND"], ["APPOINTMENT", "COMPARE", "PLURAL_MONTHS"]] },
  { metric: "patients.monthly_series", all: [["PATIENT", "TREND"], ["PATIENT", "COMPARE", "PLURAL_MONTHS"]], boost: ["NEW"] },
  { metric: "patients.new", all: [["PATIENT", "NEW"], ["PATIENT", "GROWTH"]], boost: ["COUNT"] },
  { metric: "patients.active", all: [["PATIENT", "ACTIVE"]], boost: ["COUNT"], none: ["DOCTOR"] },
  { metric: "appointments.total", all: [["APPOINTMENT"]], boost: ["COUNT", "COMPARE"] },
  { metric: "patients.total", all: [["PATIENT", "COUNT"]] },
];

interface IntentScore {
  metric: MetricId;
  score: number;
  partial: number;
  order: number;
}

function scoreIntents(present: Set<Concept>): IntentScore[] {
  return INTENTS.map((intent, order) => {
    if (intent.none?.some((concept) => present.has(concept))) return { metric: intent.metric, score: 0, partial: 0, order };

    let best: Concept[] | null = null;
    let bestWeight = -1;
    let partial = 0;
    for (const alternative of intent.all) {
      const hits = alternative.filter((concept) => present.has(concept));
      const weight = hits.reduce((sum, concept) => sum + WEIGHT[concept], 0);
      partial = Math.max(partial, weight);
      if (hits.length === alternative.length && weight > bestWeight) {
        best = alternative;
        bestWeight = weight;
      }
    }
    if (!best) return { metric: intent.metric, score: 0, partial, order };

    // Conceitos relacionados presentes (outras alternativas ou reforços) somam metade do peso.
    const related = new Set<Concept>([...intent.all.flat(), ...(intent.boost ?? [])]);
    let extra = 0;
    for (const concept of related) {
      if (present.has(concept) && !best.includes(concept)) extra += WEIGHT[concept] / 2;
    }
    return { metric: intent.metric, score: bestWeight + extra, partial, order };
  });
}

function rank(present: Set<Concept>) {
  const scores = scoreIntents(present);
  const matched = scores.filter((entry) => entry.score > 0).sort((a, b) => b.score - a.score || a.order - b.order);
  return { best: matched[0] ?? null, second: matched[1] ?? null, scores };
}

// ─────────────────────────────────────────────────────────────────────────────
// Períodos
// ─────────────────────────────────────────────────────────────────────────────

const PERIOD_PHRASES: [PeriodKey, string[]][] = [
  ["ano_passado", ["ano passado", "ano anterior", "last year", "previous year"]],
  ["semana_passada", ["semana passada", "semana anterior", "ultima semana", "last week", "previous week"]],
  ["mes_anterior", ["mes passado", "mes anterior", "last month", "previous month"]],
  ["esta_semana", ["esta semana", "nesta semana", "desta semana", "semana actual", "semana atual", "this week", "current week"]],
  ["ontem", ["ontem", "yesterday"]],
  ["hoje", ["hoje", "today"]],
  ["este_ano", ["este ano", "neste ano", "deste ano", "ano actual", "ano atual", "this year", "current year", "year to date", "ytd"]],
  ["este_mes", ["este mes", "neste mes", "deste mes", "mes actual", "mes atual", "this month", "current month", "month to date"]],
  ["ultimos_12_meses", ["ultimo ano", "12 meses", "doze meses", "past year", "12 months", "twelve months"]],
  ["ultimos_6_meses", ["semestre", "6 meses", "seis meses", "6 months", "six months", "half year", "half a year"]],
  ["ultimos_3_meses", ["trimestre", "3 meses", "tres meses", "3 months", "three months", "quarter"]],
  ["ultimos_30_dias", ["ultimo mes", "30 dias", "trinta dias", "30 days", "thirty days", "past month"]],
  ["ultimos_7_dias", ["7 dias", "sete dias", "7 days", "seven days", "past week"]],
].map(([key, phrases]) => [key as PeriodKey, phrases as string[]]);

const COMPILED_PERIODS = PERIOD_PHRASES.map(([key, phrases]) => [key, phrases.map((phrase) => phrase.split(" "))] as const);

const NUMBER_WORDS: Record<string, number> = {
  um: 1, uma: 1, one: 1, dois: 2, duas: 2, two: 2, tres: 3, three: 3, quatro: 4, four: 4, cinco: 5, five: 5, seis: 6, six: 6,
  sete: 7, seven: 7, oito: 8, eight: 8, nove: 9, nine: 9, dez: 10, ten: 10, onze: 11, eleven: 11, doze: 12, twelve: 12,
  catorze: 14, quatorze: 14, fourteen: 14, quinze: 15, fifteen: 15, vinte: 20, twenty: 20, trinta: 30, thirty: 30,
  sessenta: 60, sixty: 60, noventa: 90, ninety: 90,
};

const RELATIVE = / (?:ultim[oa]s?|past|last|previous) (\d{1,3}|[a-z]+) (dias?|days?|semanas?|weeks?|mes|meses|months?|anos?|years?) /;

function fromNumber(amount: number, unit: string): PeriodKey {
  const days = unit.startsWith("di") || unit.startsWith("day")
    ? amount
    : unit.startsWith("sem") || unit.startsWith("week")
      ? amount * 7
      : unit.startsWith("an") || unit.startsWith("year")
        ? amount * 365
        : amount * 30;
  if (days <= 1) return "hoje";
  if (days <= 7) return "ultimos_7_dias";
  if (days <= 31) return "ultimos_30_dias";
  if (days <= 92) return "ultimos_3_meses";
  if (days <= 183) return "ultimos_6_meses";
  return "ultimos_12_meses";
}

/**
 * "face ao mês anterior", "compared to last month"… indicam a BASE de
 * comparação, não o período pedido: a pergunta refere-se ao período corrente.
 */
const BASELINE =
  / (?:face (?:ao|a)|em relacao (?:ao|a)|comparad[oa]s? (?:com|ao|a)|compared (?:to|with)|relative to|versus|vs|than|do que|against) (?:o |a |the )?(mes passado|mes anterior|semana passada|semana anterior|ano passado|ano anterior|last month|previous month|last week|previous week|last year|previous year) /;

function currentPeriodFor(baseline: string): PeriodKey {
  if (baseline.includes("semana") || baseline.includes("week")) return "esta_semana";
  if (baseline.includes("ano") || baseline.includes("year")) return "este_ano";
  return "este_mes";
}

export function findPeriod(question: string): { period: PeriodKey; explicit: boolean } {
  let text = normalise(question);
  let fallback: PeriodKey | null = null;
  const baseline = BASELINE.exec(text);
  if (baseline) {
    fallback = currentPeriodFor(baseline[1]);
    text = text.replace(baseline[0], " ");
  }

  const relative = RELATIVE.exec(text);
  if (relative) {
    const amount = /^\d+$/.test(relative[1]) ? Number(relative[1]) : NUMBER_WORDS[relative[1]];
    if (amount) return { period: fromNumber(amount, relative[2]), explicit: true };
  }
  const tokens = tokenise(text);
  for (const [period, phrases] of COMPILED_PERIODS) {
    if (phrases.some((words) => phraseIn(tokens, words.map((word) => (token: string) => token === word)))) {
      return { period, explicit: true };
    }
  }
  return fallback ? { period: fallback, explicit: true } : { period: "este_mes", explicit: false };
}

export function detectPeriod(question: string): PeriodKey {
  return findPeriod(question).period;
}

// ─────────────────────────────────────────────────────────────────────────────
// Classificação
// ─────────────────────────────────────────────────────────────────────────────

export interface ConversationContext {
  metric?: MetricId | null;
  period?: PeriodKey | null;
}

export interface Classification {
  /** Melhor métrica para a pergunta (antes de aplicar permissões). */
  metric: MetricId | null;
  score: number;
  /** Suficientemente claro para dispensar o modelo de linguagem. */
  confident: boolean;
  period: PeriodKey;
  periodExplicit: boolean;
  /** A resposta usa a métrica ou o período da pergunta anterior. */
  usedContext: boolean;
  /** Perguntas que o assistente recusa por natureza. */
  blocked: "clinical" | "forecast" | null;
  smalltalk: "greeting" | "thanks" | "help" | null;
  /** Métricas parcialmente relacionadas, por relevância (para sugerir). */
  candidates: MetricId[];
}

const FOLLOW_UP = /^ (e|and|what about|how about|agora|now|tambem|also) /;

/** Conceito que representa o "assunto" de uma métrica, usado em continuações. */
function domainOf(metric: MetricId): Concept {
  if (metric === "finance.expenses" || metric === "finance.expenses_by_category") return "EXPENSE";
  if (metric === "finance.payments_received" || metric === "finance.payments_by_method" || metric === "finance.outstanding") return "PAYMENT";
  if (metric.startsWith("finance.")) return "REVENUE";
  if (metric.startsWith("patients.")) return "PATIENT";
  if (metric.startsWith("inventory.")) return "STOCK";
  return "APPOINTMENT";
}

export function classifyQuestion(question: string, context: ConversationContext = {}): Classification {
  const text = normalise(question);
  const tokens = tokenise(text);
  const present = detectConcepts(tokens);
  const { period: detectedPeriod, explicit } = findPeriod(question);

  const blocked = present.has("CLINICAL") ? "clinical" : present.has("FORECAST") ? "forecast" : null;
  const smalltalkConcept = present.has("HELP") ? "help" : present.has("THANKS") ? "thanks" : present.has("GREETING") ? "greeting" : null;

  let { best, second, scores } = rank(present);
  let usedContext = false;

  const isFollowUp = FOLLOW_UP.test(text) || tokens.length <= 5;
  if (!blocked && context.metric && isFollowUp && !(smalltalkConcept && !best)) {
    // Continuação: junta o assunto da pergunta anterior e volta a pontuar.
    const withContext = new Set(present);
    withContext.add(domainOf(context.metric));
    const contextual = rank(withContext);
    const bestWithoutContext = best?.score ?? 0;
    if (contextual.best && (!best || contextual.best.score > bestWithoutContext) && (explicit || best || FOLLOW_UP.test(text))) {
      best = contextual.best;
      second = contextual.second;
      scores = contextual.scores;
      usedContext = true;
    }
  }

  const metric = blocked ? null : (best?.metric ?? null);
  let period = detectedPeriod;
  if (metric && !explicit && context.period && (usedContext || FOLLOW_UP.test(text))) {
    period = context.period;
    usedContext = true;
  }

  const score = best?.score ?? 0;
  const margin = score - (second?.score ?? 0);
  const confident = metric !== null && (usedContext || score >= 20 || (score >= 10 && margin >= 6));

  const candidates = scores
    .filter((entry) => entry.metric !== metric && (entry.partial > 0 || entry.score > 0))
    .sort((a, b) => Math.max(b.score, b.partial) - Math.max(a.score, a.partial) || a.order - b.order)
    .map((entry) => entry.metric)
    .filter((id, index, list) => list.indexOf(id) === index)
    .slice(0, 5);

  return {
    metric,
    score,
    confident,
    period,
    periodExplicit: explicit,
    usedContext,
    blocked,
    smalltalk: metric || blocked ? null : smalltalkConcept,
    candidates,
  };
}

/** Compatibilidade: melhor métrica para a pergunta, ou `null` se não for permitida. */
export function matchMetric(question: string, allowed: Set<MetricId>): MetricId | null {
  const { metric } = classifyQuestion(question);
  return metric && allowed.has(metric) ? metric : null;
}
