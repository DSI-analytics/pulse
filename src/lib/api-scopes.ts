/**
 * Permissões que podem ser atribuídas a um cliente da API nas Configurações.
 *
 * Os valores seguem o formato SMART on FHIR aceite por `src/lib/fhir/auth.ts`
 * e por `src/lib/public-booking-auth.ts` (que também aceitam `system/*.read`).
 */
export const API_SCOPE_OPTIONS = [
  { key: "fhirRead", scope: "system/*.read", group: "fhir" },
  { key: "fhirWrite", scope: "system/*.write", group: "fhir" },
  { key: "bookingRead", scope: "system/Appointment.read", group: "booking" },
  { key: "bookingWrite", scope: "system/Appointment.write", group: "booking" },
] as const;

export type ApiScopeKey = (typeof API_SCOPE_OPTIONS)[number]["key"];

export const ALLOWED_API_SCOPES: readonly string[] = API_SCOPE_OPTIONS.map((option) => option.scope);

/** Chave de tradução de um scope guardado (ou `null` se for um scope antigo/manual). */
export function scopeKey(scope: string): ApiScopeKey | null {
  return API_SCOPE_OPTIONS.find((option) => option.scope === scope)?.key ?? null;
}
