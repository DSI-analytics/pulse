import type { Metadata } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/toast";
import { I18nProvider } from "@/i18n/client";
import { getTranslator, getUiContext } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslator();
  return {
    title: { default: t("common.appTitle"), template: "%s · Pulso" },
    description: t("common.appDescription"),
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Idioma, tema, tamanho do texto e movimento vêm da conta (no servidor):
  // o HTML já chega com os atributos certos, sem script nem "flash" de tema.
  const { locale, preferences, messages, regional } = await getUiContext();

  return (
    <html
      lang={locale}
      className={preferences.theme === "DARK" ? "dark" : undefined}
      data-theme={preferences.theme.toLowerCase()}
      data-text-size={preferences.textSize.toLowerCase()}
      data-motion={preferences.reduceMotion ? "reduce" : undefined}
      suppressHydrationWarning
    >
      <body className="antialiased">
        <I18nProvider messages={messages} regional={regional}>
          <ToastProvider>{children}</ToastProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
