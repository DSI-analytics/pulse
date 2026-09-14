/**
 * Formatos regionais — moeda, números, datas e fuso horário.
 *
 * Os valores vêm da clínica (`Clinic.currency`, `Clinic.timezone`) e do idioma
 * activo. As funções são puras e funcionam no servidor e no cliente; o cliente
 * recebe as opções pelo `I18nProvider`.
 *
 * Montantes são sempre guardados em centavos (inteiros).
 */
import type { Locale } from "@/i18n/config";

export interface RegionalOptions {
  locale: Locale;
  /** Código ISO 4217, ex.: "MZN". */
  currency: string;
  /** Fuso IANA, ex.: "Africa/Maputo". */
  timeZone: string;
}

/** Idioma da interface → etiqueta BCP 47 usada na formatação. */
const INTL_LOCALE: Record<Locale, string> = {
  // pt-MZ usa espaço como separador de milhares ("1 840 000").
  pt: "pt-MZ",
  en: "en-GB",
};

export function intlLocale(locale: Locale): string {
  return INTL_LOCALE[locale];
}

/** Moedas oferecidas nas configurações (qualquer ISO 4217 válido funciona). */
export const SUPPORTED_CURRENCIES = ["MZN", "ZAR", "USD", "EUR"] as const;

/** Fusos oferecidos nas configurações. */
export const SUPPORTED_TIMEZONES = [
  "Africa/Maputo",
  "Africa/Johannesburg",
  "Africa/Luanda",
  "Europe/Lisbon",
  "UTC",
] as const;

export function isValidCurrency(code: string): boolean {
  try {
    new Intl.NumberFormat("en", { style: "currency", currency: code });
    return /^[A-Z]{3}$/.test(code);
  } catch {
    return false;
  }
}

export function isValidTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

// Construir Intl.* é caro; guardamos os formatadores por combinação de opções.
const cache = new Map<string, Intl.NumberFormat | Intl.DateTimeFormat>();

function numberFormat(locale: Locale, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = `n|${locale}|${JSON.stringify(options)}`;
  let formatter = cache.get(key) as Intl.NumberFormat | undefined;
  if (!formatter) {
    formatter = new Intl.NumberFormat(INTL_LOCALE[locale], options);
    cache.set(key, formatter);
  }
  return formatter;
}

function dateFormat(locale: Locale, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `d|${locale}|${JSON.stringify(options)}`;
  let formatter = cache.get(key) as Intl.DateTimeFormat | undefined;
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(INTL_LOCALE[locale], options);
    cache.set(key, formatter);
  }
  return formatter;
}

/** Agrupamento com ponto e decimal com vírgula (formato histórico do Pulso). */
function ptGrouping(options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = `pt-group|${JSON.stringify(options)}`;
  let formatter = cache.get(key) as Intl.NumberFormat | undefined;
  if (!formatter) {
    formatter = new Intl.NumberFormat("de-DE", options);
    cache.set(key, formatter);
  }
  return formatter;
}

export function createFormatters({ locale, currency, timeZone }: RegionalOptions) {
  // PT mantém o aspecto actual da plataforma ("1.840.000 MZN": pontos nos
  // milhares, código no fim); EN segue a convenção inglesa ("MZN 1,840,000").
  const money = (cents: number, fractionDigits: 0 | 2) => {
    const amount = fractionDigits === 0 ? Math.round(cents / 100) : cents / 100;
    const digits = { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits };
    if (locale === "pt") return `${ptGrouping(digits).format(amount)} ${currency}`;
    return numberFormat(locale, { style: "currency", currency, currencyDisplay: "code", ...digits }).format(amount);
  };

  return {
    locale,
    currency,
    timeZone,

    /** Montante arredondado às unidades: "1.840.000 MZN" · "MZN 1,840,000". */
    money: (cents: number) => money(cents, 0),
    /** Montante com cêntimos: "1.500,50 MZN" · "MZN 1,500.50". */
    moneyExact: (cents: number) => money(cents, 2),
    /** Montante compacto para gráficos: "1,84 M MZN". */
    moneyCompact: (cents: number) =>
      numberFormat(locale, {
        style: "currency",
        currency,
        currencyDisplay: "code",
        notation: "compact",
        maximumFractionDigits: 2,
      }).format(cents / 100),

    number: (value: number, maximumFractionDigits = 0) =>
      numberFormat(locale, { maximumFractionDigits }).format(value),
    percent: (ratio: number, maximumFractionDigits = 0) =>
      numberFormat(locale, { style: "percent", maximumFractionDigits }).format(ratio),

    /** 15/09/2026 */
    date: (value: Date | string) =>
      dateFormat(locale, { timeZone, day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value)),
    /** 15 set. 2026 / 15 Sept 2026 */
    dateMedium: (value: Date | string) =>
      dateFormat(locale, { timeZone, day: "numeric", month: "short", year: "numeric" }).format(new Date(value)),
    /** terça-feira, 15 de setembro de 2026 */
    dateLong: (value: Date | string) =>
      dateFormat(locale, { timeZone, weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(value)),
    /** 14:30 (sempre 24 h — padrão clínico em ambos os idiomas) */
    time: (value: Date | string) =>
      dateFormat(locale, { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(value)),
    dateTime: (value: Date | string) =>
      dateFormat(locale, {
        timeZone,
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).format(new Date(value)),
  };
}

export type Formatters = ReturnType<typeof createFormatters>;

/**
 * Interpreta um montante escrito pelo utilizador ("1 500,50", "1,500.50",
 * "1500") e devolve centavos, ou `null` se não for um número.
 * Aceita as duas convenções de separadores, independentemente do idioma.
 */
export function parseMoneyInput(input: string): number | null {
  const cleaned = input.replace(/[\s  ]/g, "").replace(/[^\d.,-]/g, "");
  if (!/\d/.test(cleaned)) return null;

  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  const decimalAt = Math.max(lastComma, lastDot);
  // Um separador seguido de exactamente 1–2 dígitos no fim é decimal;
  // caso contrário ("1.500", "1,500") é separador de milhares.
  const isDecimal = decimalAt >= 0 && /^\d{1,2}$/.test(cleaned.slice(decimalAt + 1));

  const integerPart = (isDecimal ? cleaned.slice(0, decimalAt) : cleaned).replace(/[.,]/g, "");
  const fractionPart = isDecimal ? cleaned.slice(decimalAt + 1).padEnd(2, "0") : "00";
  const value = Number(`${integerPart || "0"}.${fractionPart}`);
  return Number.isFinite(value) ? Math.round(value * 100) : null;
}
