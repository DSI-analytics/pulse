import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { getTranslator } from "@/i18n/server";
import type { SettingsSectionId } from "@/app/(app)/configuracoes/sections";

/** Cabeçalho das subpáginas: regresso ao menu das Configurações + título. */
export async function SettingsHeader({ section, actions }: { section: SettingsSectionId; actions?: React.ReactNode }) {
  const t = await getTranslator();
  return (
    <div className="space-y-2">
      <Link
        href="/configuracoes"
        className="press -ml-1.5 inline-flex h-8 items-center gap-0.5 rounded-full pl-1 pr-3 text-sm font-medium text-primary outline-none hover:bg-fill focus-visible:shadow-[0_0_0_3px_var(--primary-muted)]"
      >
        <ChevronLeft className="size-[18px]" aria-hidden />
        {t("settings.backToHub")}
      </Link>
      <PageHeader
        title={t(`settings.sections.${section}.title`)}
        description={t(`settings.sections.${section}.description`)}
        actions={actions}
      />
    </div>
  );
}
