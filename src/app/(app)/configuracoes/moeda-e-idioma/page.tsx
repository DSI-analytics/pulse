import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { intlLocale, SUPPORTED_CURRENCIES } from "@/lib/format";
import { SettingsHeader } from "@/components/settings/settings-header";
import { RegionalForm } from "@/components/settings/regional-form";
import { isLocale } from "@/i18n/config";
import { getTranslator, getUiContext } from "@/i18n/server";

export async function generateMetadata() {
  const t = await getTranslator();
  return { title: t("settings.sections.regional.title") };
}

export default async function MoedaIdiomaPage() {
  const user = await requirePermission("settings.manage");
  const { locale } = await getUiContext();
  const clinic = await prisma.clinic.findUniqueOrThrow({
    where: { id: user.clinicId },
    select: { currency: true, locale: true },
  });

  // Nomes das moedas no idioma de quem está a ver ("Metical moçambicano").
  const names = new Intl.DisplayNames([intlLocale(locale)], { type: "currency" });
  const codes = Array.from(new Set<string>([...SUPPORTED_CURRENCIES, clinic.currency]));
  const currencies = codes.map((code) => {
    const name = names.of(code) ?? code;
    return { code, label: `${name.charAt(0).toLocaleUpperCase(intlLocale(locale))}${name.slice(1)} (${code})` };
  });

  return (
    <>
      <SettingsHeader section="regional" />
      {/* A chave remonta o formulário depois de guardar: o estado local dos
          selects volta a reflectir os valores gravados. */}
      <RegionalForm
        key={`${clinic.currency}-${clinic.locale}`}
        currency={clinic.currency}
        locale={isLocale(clinic.locale) ? clinic.locale : "pt"}
        currencies={currencies}
      />
    </>
  );
}
