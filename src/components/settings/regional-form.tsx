"use client";

import * as React from "react";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { FormStatus, SettingRow } from "@/components/settings/form-status";
import { createFormatters } from "@/lib/format";
import { LOCALE_AUTONYM, LOCALES, type Locale } from "@/i18n/config";
import { useFormat, useT } from "@/i18n/client";
import { updateRegionalSettings, type SettingsActionState } from "@/server/settings-actions";

export function RegionalForm({
  currency,
  locale,
  currencies,
}: {
  currency: string;
  locale: Locale;
  currencies: { code: string; label: string }[];
}) {
  const t = useT();
  const { timeZone } = useFormat();
  const [state, action, pending] = React.useActionState(updateRegionalSettings, null as SettingsActionState);
  const [selectedCurrency, setSelectedCurrency] = React.useState(currency);
  const [selectedLocale, setSelectedLocale] = React.useState<Locale>(locale);

  // Data fixa: "agora" difere entre o HTML do servidor e a hidratação.
  const example = React.useMemo(() => {
    const format = createFormatters({ locale: selectedLocale, currency: selectedCurrency, timeZone });
    const sample = new Date("2026-03-15T12:30:00Z");
    return `${format.moneyExact(150_050)} · ${format.dateMedium(sample)} · ${format.time(sample)}`;
  }, [selectedCurrency, selectedLocale, timeZone]);

  return (
    <form action={action}>
      <Card>
        <CardContent className="divide-y divide-border p-5">
          <SettingRow label={t("settings.regional.currencyLabel")} hint={t("settings.regional.currencyHint")} htmlFor="regional-currency">
            <Select
              id="regional-currency"
              name="currency"
              className="w-full sm:w-72"
              value={selectedCurrency}
              onChange={(event) => setSelectedCurrency(event.target.value)}
            >
              {currencies.map((option) => (
                <option key={option.code} value={option.code}>{option.label}</option>
              ))}
            </Select>
          </SettingRow>

          <SettingRow label={t("settings.regional.localeLabel")} hint={t("settings.regional.localeHint")} htmlFor="regional-locale">
            <Select
              id="regional-locale"
              name="locale"
              className="w-full sm:w-72"
              value={selectedLocale}
              onChange={(event) => setSelectedLocale(event.target.value as Locale)}
            >
              {LOCALES.map((option) => (
                <option key={option} value={option} lang={option}>{LOCALE_AUTONYM[option]}</option>
              ))}
            </Select>
          </SettingRow>

          <SettingRow label={t("settings.regional.example")}>
            <p className="rounded-lg border border-border bg-fill-subtle px-3 py-2 text-sm font-medium tabular text-foreground" aria-live="polite">
              {example}
            </p>
          </SettingRow>

          <div className="flex flex-col gap-3 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <FormStatus state={state} className="sm:flex-1" />
            <Button type="submit" disabled={pending} className="sm:ml-auto">
              {pending ? <Loader2 className="animate-spin" /> : <Save />}
              {pending ? t("common.saving") : t("common.save")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
