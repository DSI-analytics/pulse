"use client";

import * as React from "react";
import { createFormatters, type Formatters, type RegionalOptions } from "@/lib/format";
import type { Locale } from "./config";
import { createTranslator, type Translator } from "./translate";
import type { Messages } from "./types";

interface I18nValue {
  locale: Locale;
  t: Translator;
  format: Formatters;
}

const I18nContext = React.createContext<I18nValue | null>(null);

/**
 * Disponibiliza idioma, traduções e formatos regionais aos componentes de
 * cliente. Os valores vêm do servidor (`getUiContext`), pelo que o HTML
 * inicial e a hidratação coincidem.
 */
export function I18nProvider({
  messages,
  regional,
  children,
}: {
  messages: Messages;
  regional: RegionalOptions;
  children: React.ReactNode;
}) {
  const value = React.useMemo<I18nValue>(
    () => ({
      locale: regional.locale,
      t: createTranslator(messages),
      format: createFormatters(regional),
    }),
    [messages, regional],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

function useI18n(): I18nValue {
  const value = React.useContext(I18nContext);
  if (!value) throw new Error("useI18n tem de ser usado dentro de <I18nProvider>.");
  return value;
}

/** Função de tradução do idioma activo. */
export function useT(): Translator {
  return useI18n().t;
}

/** Formatadores de moeda, números e datas da clínica. */
export function useFormat(): Formatters {
  return useI18n().format;
}

export function useLocale(): Locale {
  return useI18n().locale;
}
