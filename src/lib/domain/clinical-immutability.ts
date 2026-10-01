/**
 * Detecção do erro levantado pelos gatilhos de imutabilidade clínica.
 *
 * A base de dados é a última linha de defesa: qualquer UPDATE/DELETE proibido
 * sobre o prontuário levanta uma excepção PostgreSQL com o ERRCODE
 * `insufficient_privilege` (42501) e a mensagem "Registo clinico imutavel…"
 * (ver a migração `clinical_records_immutable_and_icd11`).
 *
 * O servidor recusa SEMPRE a operação antes de chegar aqui — este auxiliar só
 * existe para que uma falha residual apareça como mensagem traduzida
 * (`clinical.immutable.blocked`) e nunca como erro cru da base de dados.
 */

const SIGNATURE = /insufficient_privilege|\b42501\b|Registo clinico imutavel/i;

export function isImmutabilityError(error: unknown): boolean {
  if (!error) return false;
  const parts: string[] = [];
  if (error instanceof Error) {
    parts.push(error.message);
    const meta = (error as { meta?: unknown }).meta;
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string") parts.push(code);
    if (meta) {
      try {
        parts.push(JSON.stringify(meta));
      } catch {
        // Meta não serializável: a mensagem já foi considerada.
      }
    }
    if (error.cause) parts.push(String((error.cause as { message?: string })?.message ?? error.cause));
  } else {
    parts.push(String(error));
  }
  return SIGNATURE.test(parts.join(" "));
}
