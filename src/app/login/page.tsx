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

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ motivo?: string }>;
}) {
  if (await getSession()) redirect("/");
  const t = await getTranslator();
  const idle = (await searchParams).motivo === "inatividade";

  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      {/* Painel de marca: gradiente vivo interpolado em OKLCH, sem desfoque. */}
      <div className="relative m-3 hidden flex-col justify-between overflow-hidden rounded-[32px] bg-[linear-gradient(135deg_in_oklch,oklch(46%_0.18_250),oklch(38%_0.17_275))] p-10 text-[oklch(100%_0_0)] antialiased lg:flex">
        {/* Anéis nítidos de 1px em cores saturadas: iluminação geométrica, sem desfoque. */}
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -right-24 -top-24 size-[26rem] rounded-full border border-[oklch(72%_0.17_245)]" />
          <div className="absolute -right-10 -top-10 size-[18rem] rounded-full border border-[oklch(84%_0.16_240)]" />
          <div className="absolute -bottom-40 -left-24 size-[30rem] rounded-full border border-[oklch(68%_0.16_275)]" />
          <div className="absolute bottom-24 right-16 size-2 rounded-full bg-[oklch(88%_0.17_235)] shadow-[0_0_0_4px_oklch(88%_0.17_235/0.3)]" />
        </div>

        <div className="relative max-w-md space-y-32">
          <h1 className="font-display text-[38px] font-bold leading-[1.08] tracking-[-0.03em]">
            {t("auth.login.heroTitle")}
          </h1>
          <p className="text-[15px] leading-relaxed text-[oklch(96%_0.03_245)]">
            {t("auth.login.heroBody")}
          </p>
          <PulseMark className="h-10 w-56 text-[oklch(88%_0.17_235)]" line animated />
        </div>
        <p className="relative text-sm text-[oklch(92%_0.05_245)]">Maputo · MZN · Africa/Maputo</p>
      </div>

      {/* Formulário */}
      <div className="flex items-center justify-center p-4 sm:p-6">
        <div className="animate-sheet w-full max-w-sm">
          <div className="glass-strong rounded-[28px] p-7 sm:p-8">
            <h2 className="font-display text-[26px] font-bold tracking-[-0.025em]">{t("auth.login.title")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("auth.login.subtitle")}</p>

            <div className="mt-6">
              {idle && (
                <p className="mb-4 rounded-[12px] border border-warning-edge bg-warning-muted px-3 py-2.5 text-[13px] font-medium text-warning antialiased">
                  {t("auth.login.idleNotice")}
                </p>
              )}
              <LoginForm />
            </div>
          </div>

        </div>
      </div>
    </main>
  );
}
