/**
 * Idiomas da interface.
 *
 * O idioma é uma PREFERÊNCIA (do utilizador, ou por omissão da clínica) e não
 * faz parte do URL: os endereços da aplicação, da API FHIR e do canal público
 * de marcações mantêm-se iguais em qualquer idioma.
 *
 * Isto é distinto dos formatos regionais (moeda, separadores, fuso horário),
 * que são definidos pela clínica — ver `src/lib/format.ts`.
 */

export const LOCALES = ["pt", "en"] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "pt";

/** Nome de cada idioma escrito nesse próprio idioma (não se traduz). */
export const LOCALE_AUTONYM: Record<Locale, string> = {
  pt: "Português",
  en: "English",
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/** Cookie usado apenas antes de haver sessão (login, recuperar palavra-passe). */
export const LOCALE_COOKIE = "pulso-locale";
