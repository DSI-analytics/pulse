"use client";

import * as React from "react";
import Image from "next/image";
import { Check, Save } from "lucide-react";
import { ProcessingPulse } from "@/components/processing-pulse";
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
  currencies: { code: string; label: string; flag: string | null }[];
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
          <fieldset className="pb-5" aria-describedby="regional-currency-hint">
            <legend className="text-sm font-semibold text-foreground antialiased">
              {t("settings.regional.currencyLabel")}
            </legend>
            <p id="regional-currency-hint" className="mt-0.5 text-[13px] text-muted-foreground antialiased">
              {t("settings.regional.currencyHint")}
            </p>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {currencies.map((option) => {
                const selected = selectedCurrency === option.code;
                return (
                  <label
                    key={option.code}
                    htmlFor={`regional-currency-${option.code}`}
                    className={[
                      "press relative flex min-w-0 cursor-pointer items-center gap-3 rounded-[16px] border p-3 antialiased transition-[background-color,border-color,box-shadow] duration-200",
                      selected
                        ? "border-primary-edge bg-primary-muted shadow-glow"
                        : "border-border bg-surface hover:border-border-strong hover:bg-fill-subtle",
                      pending ? "cursor-wait" : "",
                    ].join(" ")}
                  >
                    <input
                      id={`regional-currency-${option.code}`}
                      type="radio"
                      name="currency"
                      value={option.code}
                      checked={selected}
                      disabled={pending}
                      onChange={() => setSelectedCurrency(option.code)}
                      className="sr-only"
                    />
                    <span className="flex h-9 w-12 shrink-0 items-center justify-center overflow-hidden rounded-[8px] border border-border-strong bg-surface">
                      {option.flag ? (
                        <Image
                          src={option.flag}
                          alt=""
                          width={48}
                          height={32}
                          unoptimized
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="font-mono text-[11px] font-semibold text-muted-foreground">{option.code}</span>
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold text-foreground">{option.label}</span>
                      <span className="mt-0.5 block font-mono text-[11px] font-semibold tracking-[0.08em] text-muted-foreground">
                        {option.code}
                      </span>
                    </span>
                    <span
                      aria-hidden
                      className={[
                        "flex size-5 shrink-0 items-center justify-center rounded-full border",
                        selected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border-strong bg-surface text-surface",
                      ].join(" ")}
                    >
                      {selected && <Check className="size-3.5" />}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

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
              {pending ? <ProcessingPulse /> : <Save />}
              {pending ? t("common.saving") : t("common.save")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
