"use client";

import * as React from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import type { TextSizePreference, ThemePreference } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { FormStatus, SettingRow } from "@/components/settings/form-status";
import { isLocale, LOCALE_AUTONYM, LOCALES, type Locale } from "@/i18n/config";
import { useT } from "@/i18n/client";
import { updateAppearance, type SettingsActionState } from "@/server/settings-actions";

interface Preferences {
  theme: ThemePreference;
  textSize: TextSizePreference;
  reduceMotion: boolean;
  locale: Locale | null;
}

/** Aplica as preferências ao <html> já, antes da resposta do servidor. */
function applyToDocument(preferences: Preferences) {
  const root = document.documentElement;
  root.classList.toggle("dark", preferences.theme === "DARK");
  root.dataset.theme = preferences.theme.toLowerCase();
  root.dataset.textSize = preferences.textSize.toLowerCase();
  if (preferences.reduceMotion) root.dataset.motion = "reduce";
  else delete root.dataset.motion;
}

/**
 * Preferências pessoais — como nos Ajustes do iOS, cada alteração aplica-se e
 * guarda-se de imediato (sem botão "Guardar").
 */
export function AppearanceForm({ initial, clinicLocale }: { initial: Preferences; clinicLocale: Locale }) {
  const t = useT();
  const [preferences, setPreferences] = React.useState(initial);
  const [status, setStatus] = React.useState<SettingsActionState>(null);
  const [pending, startTransition] = React.useTransition();

  function update(patch: Partial<Preferences>) {
    const next = { ...preferences, ...patch };
    setPreferences(next);
    applyToDocument(next);
    startTransition(async () => {
      setStatus(await updateAppearance(next));
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <Card>
        <CardContent className="divide-y divide-border p-5">
          <SettingRow label={t("settings.appearance.themeLabel")} hint={t("settings.appearance.themeHint")}>
            <SegmentedControl
              label={t("settings.appearance.themeLabel")}
              value={preferences.theme}
              onChange={(theme) => update({ theme })}
              options={[
                { value: "SYSTEM", label: t("settings.appearance.themes.SYSTEM"), icon: <Monitor className="size-3.5" aria-hidden /> },
                { value: "LIGHT", label: t("settings.appearance.themes.LIGHT"), icon: <Sun className="size-3.5" aria-hidden /> },
                { value: "DARK", label: t("settings.appearance.themes.DARK"), icon: <Moon className="size-3.5" aria-hidden /> },
              ]}
            />
          </SettingRow>

          <SettingRow
            label={t("settings.appearance.languageLabel")}
            hint={t("settings.appearance.languageHint")}
            htmlFor="appearance-language"
          >
            <Select
              id="appearance-language"
              className="w-full sm:w-64"
              value={preferences.locale ?? ""}
              disabled={pending}
              onChange={(event) => update({ locale: isLocale(event.target.value) ? event.target.value : null })}
            >
              <option value="">
                {t("settings.appearance.languageClinicDefault", { language: LOCALE_AUTONYM[clinicLocale] })}
              </option>
              {LOCALES.map((locale) => (
                <option key={locale} value={locale} lang={locale}>
                  {LOCALE_AUTONYM[locale]}
                </option>
              ))}
            </Select>
          </SettingRow>

          <SettingRow label={t("settings.appearance.textSizeLabel")}>
            <SegmentedControl
              label={t("settings.appearance.textSizeLabel")}
              value={preferences.textSize}
              onChange={(textSize) => update({ textSize })}
              options={[
                { value: "NORMAL", label: t("settings.appearance.textSizes.NORMAL") },
                { value: "LARGE", label: t("settings.appearance.textSizes.LARGE") },
              ]}
            />
          </SettingRow>

          <SettingRow
            label={t("settings.appearance.motionLabel")}
            hint={t("settings.appearance.motionHint")}
            htmlFor="appearance-motion"
            hintId="appearance-motion-hint"
          >
            <Switch
              id="appearance-motion"
              checked={preferences.reduceMotion}
              onCheckedChange={(reduceMotion) => update({ reduceMotion })}
              aria-describedby="appearance-motion-hint"
            />
          </SettingRow>

          {status && (
            <div className="pt-4">
              <FormStatus state={status} />
            </div>
          )}
        </CardContent>
      </Card>

      <Card aria-label={t("settings.appearance.preview")}>
        <CardContent className="space-y-3 p-5">
          <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-subtle-foreground">
            {t("settings.appearance.preview")}
          </p>
          <p className="font-display text-xl font-semibold tracking-[-0.015em]">Pulso</p>
          <p className="text-sm text-muted-foreground">{t("settings.appearance.previewText")}</p>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button type="button" tabIndex={-1}>{t("common.save")}</Button>
            <Button type="button" variant="secondary" tabIndex={-1}>{t("common.cancel")}</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
