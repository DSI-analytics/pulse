// Limitador de taxa em memória, por instância do processo.
//
// Suficiente para travar abuso trivial (força bruta no login, varrimento da API
// FHIR) num deployment de instância única. Num deployment horizontal cada
// instância tem o seu balde — documentado em README como dívida técnica: a
// solução definitiva é um contador partilhado (Redis) ou o rate limiting do
// proxy/WAF à frente da aplicação.

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
let lastSweep = 0;

function sweep(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(key);
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/**
 * Consome uma unidade do balde `key`. Devolve `allowed: false` quando o limite
 * da janela foi atingido.
 */
export function consume(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  sweep(now);
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }

  bucket.count += 1;
  const allowed = bucket.count <= limit;
  return {
    allowed,
    remaining: Math.max(0, limit - bucket.count),
    retryAfterSeconds: allowed ? 0 : Math.ceil((bucket.resetAt - now) / 1000),
  };
}

/** Liberta o balde — usado após uma autenticação bem-sucedida e nos testes. */
export function reset(key?: string) {
  if (key) buckets.delete(key);
  else buckets.clear();
}

/** IP do pedido, a partir dos cabeçalhos do proxy. */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return headers.get("x-real-ip") ?? "desconhecido";
}
