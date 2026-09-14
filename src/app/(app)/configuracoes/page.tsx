import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { PageHeader } from "@/components/page-header";
import { getTranslator } from "@/i18n/server";
import { SETTINGS_SECTIONS } from "./sections";

export async function generateMetadata() {
  const t = await getTranslator();
  return { title: t("settings.title") };
}

/**
 * Menu das Configurações: um botão por área. Só aparecem as áreas que o perfil
 * pode gerir — "Aparência" e "Minha conta" estão disponíveis para todos.
 */
export default async function ConfiguracoesPage() {
  const user = await requireUser();
  const t = await getTranslator();

  const visible = SETTINGS_SECTIONS.filter((section) => !section.permission || can(user.role, section.permission));
  const groups = (["personal", "clinic"] as const)
    .map((group) => ({ group, sections: visible.filter((section) => section.group === group) }))
    .filter(({ sections }) => sections.length > 0);

  return (
    <>
      <PageHeader eyebrow={t("nav.groups.system")} title={t("settings.title")} description={t("settings.description")} />

      {groups.map(({ group, sections }) => (
        <section key={group} aria-labelledby={`settings-group-${group}`} className="space-y-2.5">
          <h2
            id={`settings-group-${group}`}
            className="px-1 text-[12px] font-semibold uppercase tracking-[0.08em] text-subtle-foreground"
          >
            {t(`settings.groups.${group}`)}
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {sections.map(({ id, href, icon: Icon }) => (
              <li key={id}>
                <Link
                  href={href}
                  className="surface-card press group flex h-full items-center gap-3.5 rounded-xl p-4 antialiased outline-none transition-[box-shadow,border-color] hover:shadow-card-hover hover:[--card-border:var(--primary-edge)] focus-visible:shadow-[0_0_0_3px_var(--primary-muted)] focus-visible:[--card-border:var(--primary)]"
                >
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-[13px] border border-primary-edge bg-primary-muted text-primary">
                    <Icon className="size-[22px]" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-display text-[15px] font-semibold leading-tight text-foreground">
                      {t(`settings.sections.${id}.title`)}
                    </span>
                    <span className="mt-1 block text-[13px] leading-snug text-muted-foreground">
                      {t(`settings.sections.${id}.description`)}
                    </span>
                  </span>
                  <ChevronRight
                    className="size-[18px] shrink-0 text-subtle-foreground transition-transform duration-300 ease-[var(--ease-spring)] group-hover:translate-x-0.5 group-hover:text-primary"
                    aria-hidden
                  />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}
