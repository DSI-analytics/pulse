"use client";
import { useSyncExternalStore, useTransition } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/client";
import { setThemePreference } from "@/server/settings-actions";

const DARK_QUERY = "(prefers-color-scheme: dark)";

/** O tema efectivo agora: explícito na conta ou, em "sistema", o do dispositivo. */
function isDarkNow(): boolean {
  const root = document.documentElement;
  if (root.dataset.theme === "system") return window.matchMedia(DARK_QUERY).matches;
  return root.classList.contains("dark");
}

/** Reage a mudanças no <html> (Aparência, este botão) e no tema do sistema. */
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme"] });
  const media = window.matchMedia(DARK_QUERY);
  media.addEventListener("change", onChange);
  return () => {
    observer.disconnect();
    media.removeEventListener("change", onChange);
  };
}

/**
 * Alterna claro/escuro e guarda a escolha na conta (as opções completas,
 * incluindo "Sistema", estão em Configurações › Aparência).
 */
export function ThemeToggle() {
  const t = useT();
  const dark = useSyncExternalStore(subscribe, isDarkNow, () => false);
  const [, startTransition] = useTransition();

  function toggle() {
    const next = !isDarkNow();
    const root = document.documentElement;
    root.classList.toggle("dark", next);
    root.dataset.theme = next ? "dark" : "light";
    startTransition(() => setThemePreference(next ? "DARK" : "LIGHT"));
  }

  return (
    <Button variant="ghost" size="icon" onClick={toggle} aria-label={t("theme.toggle")} title={t("theme.toggle")}>
      {dark ? <Moon className="size-[18px]" /> : <Sun className="size-[18px]" />}
    </Button>
  );
}
