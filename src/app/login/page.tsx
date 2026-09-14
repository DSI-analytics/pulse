import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { LoginForm } from "./login-form";
import { PulseMark } from "@/components/pulse-mark";
import { getTranslator } from "@/i18n/server";

// O template raiz já acrescenta " · Pulso" — antes o separador lia "Entrar · Pulso · Pulso".
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslator();
  return { title: t("auth.login.title") };
}

const DEMO = [
  { role: "CLINIC_ADMIN", email: "admin@clinicamarianu.mz" },
  { role: "RECEPTIONIST", email: "rececao@clinicamarianu.mz" },
  { role: "DOCTOR", email: "medico@clinicamarianu.mz" },
  { role: "FINANCE", email: "financeiro@clinicamarianu.mz" },
] as const;

export default async function LoginPage() {
  if (await getSession()) redirect("/");
  const t = await getTranslator();

  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      {/* Painel de marca: gradiente vivo interpolado em OKLCH, sem desfoque. */}
      <div className="relative m-3 hidden flex-col justify-between overflow-hidden rounded-[32px] bg-[linear-gradient(135deg_in_oklch,oklch(46%_0.14_150),oklch(42%_0.17_262))] p-10 text-[oklch(100%_0_0)] antialiased lg:flex">
        {/* Anéis nítidos de 1px em cores saturadas: iluminação geométrica, sem desfoque. */}
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -right-24 -top-24 size-[26rem] rounded-full border border-[oklch(70%_0.17_150)]" />
          <div className="absolute -right-10 -top-10 size-[18rem] rounded-full border border-[oklch(82%_0.2_148)]" />
          <div className="absolute -bottom-40 -left-24 size-[30rem] rounded-full border border-[oklch(66%_0.15_258)]" />
          <div className="absolute bottom-24 right-16 size-2 rounded-full bg-[oklch(90%_0.21_148)] shadow-[0_0_0_4px_oklch(90%_0.21_148/0.3)]" />
        </div>

        <div className="relative flex items-center gap-2.5">
          <div className="flex size-10 items-center justify-center rounded-[13px] border border-[oklch(74%_0.17_150)] bg-[oklch(34%_0.1_155)]">
            <PulseMark className="size-6 text-[oklch(92%_0.18_148)]" />
          </div>
          <span className="font-display text-xl font-bold tracking-[-0.015em]">Pulso</span>
        </div>
        <div className="relative max-w-md space-y-4">
          <h1 className="font-display text-[38px] font-bold leading-[1.08] tracking-[-0.03em]">
            {t("auth.login.heroTitle")}
          </h1>
          <p className="text-[15px] leading-relaxed text-[oklch(96%_0.03_150)]">
            {t("auth.login.heroBody")}
          </p>
          <PulseMark className="h-10 w-56 text-[oklch(88%_0.21_148)]" line />
        </div>
        <p className="relative text-sm text-[oklch(92%_0.05_150)]">Maputo · MZN · Africa/Maputo</p>
      </div>

      {/* Formulário */}
      <div className="flex items-center justify-center p-4 sm:p-6">
        <div className="animate-sheet w-full max-w-sm space-y-3">
          <div className="glass-strong rounded-[28px] p-7 sm:p-8">
            <div className="mb-6 flex items-center gap-2.5 lg:hidden">
              <div className="flex size-10 items-center justify-center rounded-[13px] bg-primary shadow-glow">
                <PulseMark className="size-6 text-primary-foreground" />
              </div>
              <span className="font-display text-xl font-bold tracking-[-0.015em]">Pulso</span>
            </div>
            <h2 className="font-display text-[26px] font-bold tracking-[-0.025em]">{t("auth.login.title")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("auth.login.subtitle")}</p>

            <div className="mt-6">
              <LoginForm />
            </div>
          </div>

          <div className="glass-thin rounded-[22px] px-5 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-subtle-foreground">
              {t("auth.login.demoTitle")}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("auth.login.demoPassword")} <span className="font-mono font-medium text-foreground">pulso123</span>
            </p>
            <ul className="mt-2.5 space-y-1.5">
              {DEMO.map((d) => (
                <li key={d.email} className="flex items-center justify-between gap-3 text-[13px]">
                  <span className="text-muted-foreground">{t(`roles.${d.role}`)}</span>
                  <span className="truncate font-mono text-foreground">{d.email}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </main>
  );
}
