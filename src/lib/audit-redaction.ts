// Redacção de snapshots de auditoria. Puro e testável — sem I/O.
//
// Duas garantias:
//  1. credenciais (palavras-passe, hashes, tokens, segredos) nunca são
//     escritas no log, em nenhum nível de aninhamento;
//  2. texto clínico livre não é copiado para o log — regista-se apenas que
//     mudou e o seu tamanho, o que preserva a rastreabilidade sem duplicar
//     dados sensíveis fora do prontuário.

const SECRET_KEYS =
  /(password|passwordhash|codehash|tokenhash|token|secret|apikey|api_key|authorization|cookie|sessionversion|otp|pin)/i;

/** Campos de texto clínico livre: registados como "mudou", nunca copiados. */
export const CLINICAL_TEXT_KEYS = new Set([
  "subjective",
  "notes",
  "clinicalNotes",
  "diagnosis",
  "prescription",
  "recommendations",
  "chiefComplaint",
  "historyOfPresentIllness",
  "symptoms",
  "physicalExam",
  "assessment",
  "treatmentPlan",
  "conclusion",
  "observations",
  "evolution",
  "dischargeSummary",
  "reaction",
  "instructions",
  "personalHistory",
  "surgicalHistory",
  "familyHistory",
  "habits",
  "clinicalSummary",
]);

export const REDACTED = "«redigido»";
const MAX_STRING = 512;
const MAX_DEPTH = 3;

function redactValue(key: string, value: unknown, depth: number): unknown {
  if (SECRET_KEYS.test(key)) return REDACTED;
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") {
    if (CLINICAL_TEXT_KEYS.has(key)) return value.length ? `«texto clínico (${value.length} car.)»` : "";
    return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : value;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (depth >= MAX_DEPTH) return "«omitido»";
  if (Array.isArray(value)) return value.slice(0, 25).map((v, i) => redactValue(String(i), v, depth + 1));
  if (typeof value === "object") return redact(value as Record<string, unknown>, depth + 1);
  return String(value);
}

/** Remove credenciais e texto clínico livre de um snapshot. */
export function redact(
  input: Record<string, unknown> | null | undefined,
  depth = 0,
): Record<string, unknown> | null {
  if (!input) return null;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) out[key] = redactValue(key, value, depth);
  return out;
}

/**
 * Reduz um par antes/depois aos campos que mudaram, para o log ficar pequeno e
 * a vista de comparação legível.
 */
export function changedFields(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
): { before: Record<string, unknown> | null; after: Record<string, unknown> | null } {
  const b = redact(before);
  const a = redact(after);
  if (!b || !a) return { before: b, after: a };

  const keys = new Set([...Object.keys(b), ...Object.keys(a)]);
  const outB: Record<string, unknown> = {};
  const outA: Record<string, unknown> = {};
  for (const key of keys) {
    if (JSON.stringify(b[key] ?? null) === JSON.stringify(a[key] ?? null)) continue;
    outB[key] = b[key] ?? null;
    outA[key] = a[key] ?? null;
  }
  return { before: outB, after: outA };
}
