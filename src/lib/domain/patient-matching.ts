// Detecção de pacientes potencialmente duplicados.
//
// Pontuação determinística sobre os campos disponíveis. Nunca funde registos
// automaticamente: apresenta candidatos a quem está a fazer o cadastro, que
// decide. A fusão é uma operação explícita e auditada.

export interface PatientIdentity {
  id?: string;
  code?: string | null;
  name?: string | null;
  birthDate?: Date | string | null;
  gender?: string | null;
  phone?: string | null;
  phoneAlt?: string | null;
  email?: string | null;
  documentNumbers?: string[];
}

export interface DuplicateCandidate {
  id: string;
  score: number;
  reasons: string[];
}

/** Nome comparável: minúsculas, sem acentos, sem partículas e ordenado. */
export function nameKey(value: string | null | undefined): string {
  if (!value) return "";
  const particles = new Set(["de", "da", "do", "das", "dos", "e", "di", "del"]);
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !particles.has(t))
    .sort()
    .join(" ");
}

/** Últimos 9 dígitos do telefone — ignora prefixos internacionais e formatação. */
export function phoneKey(value: string | null | undefined): string {
  if (!value) return "";
  const digits = value.replace(/\D/g, "");
  return digits.length >= 7 ? digits.slice(-9) : "";
}

export function documentKey(value: string | null | undefined): string {
  if (!value) return "";
  return value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

function isoDay(value: Date | string | null | undefined): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function tokenOverlap(a: string, b: string): number {
  if (!a || !b) return 0;
  const setA = new Set(a.split(" "));
  const setB = new Set(b.split(" "));
  let shared = 0;
  for (const token of setA) if (setB.has(token)) shared += 1;
  return shared / Math.max(setA.size, setB.size);
}

/** Peso de cada sinal. A soma máxima ultrapassa 100 — o resultado é limitado. */
const WEIGHTS = {
  // Um número de documento igual é praticamente conclusivo: sozinho já tem de
  // ultrapassar o limiar de "duplicado muito provável".
  document: 70,
  phone: 30,
  email: 25,
  exactName: 30,
  partialName: 15,
  birthDate: 25,
  gender: 5,
};

/** Acima deste valor o registo é tratado como duplicado muito provável. */
export const DUPLICATE_THRESHOLD = 70;
/** Abaixo deste valor o candidato não é sequer apresentado. */
export const SUGGESTION_THRESHOLD = 45;

export function scoreMatch(a: PatientIdentity, b: PatientIdentity): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;

  const docsA = new Set((a.documentNumbers ?? []).map(documentKey).filter(Boolean));
  const docsB = new Set((b.documentNumbers ?? []).map(documentKey).filter(Boolean));
  for (const doc of docsA) {
    if (docsB.has(doc)) {
      score += WEIGHTS.document;
      reasons.push("Documento de identificação igual");
      break;
    }
  }

  const phonesA = new Set([phoneKey(a.phone), phoneKey(a.phoneAlt)].filter(Boolean));
  const phonesB = new Set([phoneKey(b.phone), phoneKey(b.phoneAlt)].filter(Boolean));
  for (const phone of phonesA) {
    if (phonesB.has(phone)) {
      score += WEIGHTS.phone;
      reasons.push("Telefone igual");
      break;
    }
  }

  const emailA = (a.email ?? "").trim().toLowerCase();
  const emailB = (b.email ?? "").trim().toLowerCase();
  if (emailA && emailA === emailB) {
    score += WEIGHTS.email;
    reasons.push("E-mail igual");
  }

  const keyA = nameKey(a.name);
  const keyB = nameKey(b.name);
  if (keyA && keyA === keyB) {
    score += WEIGHTS.exactName;
    reasons.push("Nome igual");
  } else if (tokenOverlap(keyA, keyB) >= 0.6) {
    score += WEIGHTS.partialName;
    reasons.push("Nome muito semelhante");
  }

  const birthA = isoDay(a.birthDate);
  const birthB = isoDay(b.birthDate);
  if (birthA && birthA === birthB) {
    score += WEIGHTS.birthDate;
    reasons.push("Data de nascimento igual");
  } else if (birthA && birthB) {
    // Datas de nascimento diferentes são forte evidência de pessoas distintas.
    score -= 20;
  }

  if (a.gender && b.gender && a.gender === b.gender) score += WEIGHTS.gender;
  else if (a.gender && b.gender) score -= 10;

  return { score: Math.max(0, Math.min(100, score)), reasons };
}

/** Ordena e filtra candidatos acima do limiar de sugestão. */
export function rankDuplicates(
  subject: PatientIdentity,
  candidates: PatientIdentity[],
  threshold = SUGGESTION_THRESHOLD,
): DuplicateCandidate[] {
  return candidates
    .filter((c) => c.id && c.id !== subject.id)
    .map((c) => ({ id: c.id!, ...scoreMatch(subject, c) }))
    .filter((c) => c.score >= threshold)
    .sort((a, b) => b.score - a.score);
}
