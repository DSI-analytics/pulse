import { requireUser } from "@/lib/auth";
import { SettingsHeader } from "@/components/settings/settings-header";
import { AppearanceForm } from "@/components/settings/appearance-form";
import { getTranslator, getUiContext } from "@/i18n/server";

export async function generateMetadata() {
  const t = await getTranslator();
  return { title: t("settings.sections.appearance.title") };
}

export default async function AparenciaPage() {
  await requireUser();
  const { preferences, clinicLocale } = await getUiContext();

  return (
    <>
      <SettingsHeader section="appearance" />
      <AppearanceForm initial={preferences} clinicLocale={clinicLocale} />
    </>
  );
}
