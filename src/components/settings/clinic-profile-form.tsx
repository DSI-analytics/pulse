"use client";

import * as React from "react";
import { Save } from "lucide-react";
import { ProcessingPulse } from "@/components/processing-pulse";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { FormStatus } from "@/components/settings/form-status";
import { useT } from "@/i18n/client";
import { updateClinicProfile, type SettingsActionState } from "@/server/settings-actions";

interface ClinicValues {
  name: string;
  nuit: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string;
  country: string;
  timezone: string;
}

function Field({ id, label, hint, className, children }: { id: string; label: string; hint?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={className}>
      <Label htmlFor={id}>{label}</Label>
      <div className="mt-1.5">{children}</div>
      {hint && <p className="mt-1 text-[12px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function ClinicProfileForm({ clinic, timezones }: { clinic: ClinicValues; timezones: string[] }) {
  const t = useT();
  const [state, action, pending] = React.useActionState(updateClinicProfile, null as SettingsActionState);

  return (
    <form action={action}>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>{t("settings.clinic.identity")}</CardTitle></CardHeader>
          <CardContent className="grid gap-4 pt-0 sm:grid-cols-2">
            <Field id="clinic-name" label={t("settings.clinic.name")} className="sm:col-span-2">
              <Input id="clinic-name" name="name" defaultValue={clinic.name} required minLength={2} maxLength={160} autoComplete="organization" />
            </Field>
            <Field id="clinic-nuit" label={t("settings.clinic.nuit")}>
              <Input id="clinic-nuit" name="nuit" defaultValue={clinic.nuit ?? ""} inputMode="numeric" maxLength={30} />
            </Field>
            <Field id="clinic-timezone" label={t("settings.clinic.timezone")}>
              <Select id="clinic-timezone" name="timezone" defaultValue={clinic.timezone}>
                {timezones.map((zone) => (
                  <option key={zone} value={zone}>{zone.replace(/_/g, " ")}</option>
                ))}
              </Select>
            </Field>
            <p className="-mt-2 text-[12px] text-muted-foreground sm:col-span-2">{t("settings.clinic.timezoneHint")}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>{t("settings.clinic.contacts")}</CardTitle></CardHeader>
          <CardContent className="grid gap-4 pt-0 sm:grid-cols-2">
            <Field id="clinic-phone" label={t("settings.clinic.phone")}>
              <Input id="clinic-phone" name="phone" type="tel" defaultValue={clinic.phone ?? ""} autoComplete="tel" maxLength={40} />
            </Field>
            <Field id="clinic-email" label={t("settings.clinic.email")}>
              <Input id="clinic-email" name="email" type="email" defaultValue={clinic.email ?? ""} autoComplete="email" />
            </Field>
            <Field id="clinic-address" label={t("settings.clinic.address")} className="sm:col-span-2">
              <Input id="clinic-address" name="address" defaultValue={clinic.address ?? ""} autoComplete="street-address" maxLength={240} />
            </Field>
            <Field id="clinic-city" label={t("settings.clinic.city")}>
              <Input id="clinic-city" name="city" defaultValue={clinic.city} autoComplete="address-level2" maxLength={80} />
            </Field>
            <Field id="clinic-country" label={t("settings.clinic.country")}>
              <Input id="clinic-country" name="country" defaultValue={clinic.country} autoComplete="country-name" maxLength={80} />
            </Field>
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <FormStatus state={state} className="sm:flex-1" />
        <Button type="submit" disabled={pending} className="sm:ml-auto">
          {pending ? <ProcessingPulse /> : <Save />}
          {pending ? t("common.saving") : t("common.save")}
        </Button>
      </div>
    </form>
  );
}
