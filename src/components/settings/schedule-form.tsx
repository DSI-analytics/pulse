"use client";

import * as React from "react";
import { BellRing, CalendarClock, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { FormStatus, SettingRow } from "@/components/settings/form-status";
import { useFormat, useLocale, useT } from "@/i18n/client";
import { updateScheduleSettings, type SettingsActionState } from "@/server/settings-actions";

interface ScheduleValues {
  defaultSlotMinutes: number;
  defaultConsultationFee: number;
  lowStockLeadDays: number;
  expiryWarningDays: number;
  receivableOverdueDays: number;
}

/** Campo numérico com unidade à direita ("min", "dias", "MZN"). */
function UnitInput({ id, name, unit, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { id: string; name: string; unit: string }) {
  return (
    <div className="relative w-full sm:w-48">
      <Input id={id} name={name} className="pr-14 text-right tabular" {...props} />
      <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[13px] font-medium text-subtle-foreground">
        {unit}
      </span>
    </div>
  );
}

export function ScheduleForm({ values }: { values: ScheduleValues }) {
  const t = useT();
  const locale = useLocale();
  const { currency } = useFormat();
  const [state, action, pending] = React.useActionState(updateScheduleSettings, null as SettingsActionState);

  // Valor editável sem símbolo, com o separador decimal do idioma ("1500,00").
  const fee = (values.defaultConsultationFee / 100).toFixed(2);
  const feeText = locale === "pt" ? fee.replace(".", ",") : fee;
  const days = t("settings.schedule.days");

  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center gap-2.5 space-y-0">
            <CalendarClock className="size-[18px] text-primary" aria-hidden />
            <CardTitle>{t("settings.schedule.agenda")}</CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-border pt-0">
            <SettingRow label={t("settings.schedule.slotMinutes")} hint={t("settings.schedule.slotMinutesHint")} htmlFor="slot-minutes">
              <UnitInput id="slot-minutes" name="defaultSlotMinutes" type="number" min={5} max={240} step={5} required
                defaultValue={values.defaultSlotMinutes} unit={t("settings.schedule.minutes")} />
            </SettingRow>
            <SettingRow label={t("settings.schedule.consultationFee")} hint={t("settings.schedule.consultationFeeHint")} htmlFor="consultation-fee">
              <UnitInput id="consultation-fee" name="defaultConsultationFee" inputMode="decimal" required
                defaultValue={feeText} unit={currency} />
            </SettingRow>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center gap-2.5 space-y-0">
            <BellRing className="size-[18px] text-primary" aria-hidden />
            <CardTitle>{t("settings.schedule.alerts")}</CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-border pt-0">
            <SettingRow label={t("settings.schedule.lowStockLeadDays")} hint={t("settings.schedule.lowStockLeadDaysHint")} htmlFor="low-stock-days">
              <UnitInput id="low-stock-days" name="lowStockLeadDays" type="number" min={1} max={365} required
                defaultValue={values.lowStockLeadDays} unit={days} />
            </SettingRow>
            <SettingRow label={t("settings.schedule.expiryWarningDays")} hint={t("settings.schedule.expiryWarningDaysHint")} htmlFor="expiry-days">
              <UnitInput id="expiry-days" name="expiryWarningDays" type="number" min={1} max={365} required
                defaultValue={values.expiryWarningDays} unit={days} />
            </SettingRow>
            <SettingRow label={t("settings.schedule.receivableOverdueDays")} hint={t("settings.schedule.receivableOverdueDaysHint")} htmlFor="overdue-days">
              <UnitInput id="overdue-days" name="receivableOverdueDays" type="number" min={1} max={365} required
                defaultValue={values.receivableOverdueDays} unit={days} />
            </SettingRow>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <FormStatus state={state} className="sm:flex-1" />
        <Button type="submit" disabled={pending} className="sm:ml-auto">
          {pending ? <Loader2 className="animate-spin" /> : <Save />}
          {pending ? t("common.saving") : t("common.save")}
        </Button>
      </div>
    </form>
  );
}
