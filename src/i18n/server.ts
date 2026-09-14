import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import type { TextSizePreference, ThemePreference } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  createFormatters,
  isValidCurrency,
  isValidTimeZone,
  type Formatters,
  type RegionalOptions,
} from "@/lib/format";
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, type Locale } from "./config";
import { createTranslator, type Translator } from "./translate";
import type { Messages } from "./types";
import en from "./messages/en";
import pt from "./messages/pt";

const DICTIONARIES: Record<Locale, Messages> = { pt, en };

export function getMessages(locale: Locale): Messages {
  return DICTIONARIES[locale];
}

export interface UiPreferences {
  theme: ThemePreference;
  textSize: TextSizePreference;
  reduceMotion: boolean;
  /** Idioma escolhido pela pessoa; `null` = segue a clínica. */
  locale: Locale | null;
}

export interface UiContext {
  locale: Locale;
  /** Idioma predefinido da clínica (ou o global, sem sessão). */
  clinicLocale: Locale;
  regional: RegionalOptions;
  preferences: UiPreferences;
  messages: Messages;
  t: Translator;
}

const DEFAULT_PREFERENCES: UiPreferences = {
  theme: "SYSTEM",
  textSize: "NORMAL",
  reduceMotion: false,
  locale: null,
};

const FALLBACK_TIMEZONE = process.env.APP_TZ ?? "Africa/Maputo";

/**
 * Contexto de interface do pedido actual: idioma, formatos regionais e
 * preferências de aparência.
 *
 * Ordem do idioma: preferência da pessoa → idioma da clínica → cookie
 * (páginas sem sessão) → português. Memorizado por pedido com `cache`.
 */
export const getUiContext = cache(async (): Promise<UiContext> => {
  // Fora de um pedido (testes, scripts, jobs) não há cookies: usa-se o
  // idioma e os formatos predefinidos em vez de falhar.
  let session: Awaited<ReturnType<typeof getSession>> = null;
  let cookieLocale: string | undefined;
  try {
    session = await getSession();
    cookieLocale = (await cookies()).get(LOCALE_COOKIE)?.value;
  } catch {
    session = null;
  }

  const row = session
    ? await prisma.user.findFirst({
        where: { id: session.userId, clinicId: session.clinicId, isActive: true },
        select: {
          locale: true,
          theme: true,
          textSize: true,
          reduceMotion: true,
          clinic: { select: { locale: true, currency: true, timezone: true } },
        },
      })
    : null;

  const clinicLocale: Locale = isLocale(row?.clinic.locale)
    ? row.clinic.locale
    : isLocale(cookieLocale)
      ? cookieLocale
      : DEFAULT_LOCALE;

  const preferences: UiPreferences = row
    ? {
        theme: row.theme,
        textSize: row.textSize,
        reduceMotion: row.reduceMotion,
        locale: isLocale(row.locale) ? row.locale : null,
      }
    : DEFAULT_PREFERENCES;

  const locale = preferences.locale ?? clinicLocale;
  const currency = row && isValidCurrency(row.clinic.currency) ? row.clinic.currency : "MZN";
  const timeZone = row && isValidTimeZone(row.clinic.timezone) ? row.clinic.timezone : FALLBACK_TIMEZONE;
  const messages = getMessages(locale);

  return {
    locale,
    clinicLocale,
    regional: { locale, currency, timeZone },
    preferences,
    messages,
    t: createTranslator(messages),
  };
});

/** Atalho para componentes de servidor que só precisam de traduzir. */
export async function getTranslator(): Promise<Translator> {
  return (await getUiContext()).t;
}

/** Formatadores (moeda, números, datas) da clínica e do idioma do pedido actual. */
export async function getFormatters(): Promise<Formatters> {
  return createFormatters((await getUiContext()).regional);
}
