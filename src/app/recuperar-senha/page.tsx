import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { PulsoLogo } from "@/components/pulso-logo";
import { getTranslator } from "@/i18n/server";
import { ResetPasswordForm } from "./reset-password-form";

// O template raiz já acrescenta " · Pulso".
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslator();
  return { title: t("auth.reset.title") };
}

export default async function RecoverPasswordPage() {
  if (await getSession()) redirect("/");
  const t = await getTranslator();

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm">
        <PulsoLogo className="mb-7 w-36" priority />
        <div className="mb-6">
          <h1 className="font-display text-2xl font-semibold">{t("auth.reset.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("auth.reset.description")}</p>
        </div>
        <ResetPasswordForm />
      </div>
    </main>
  );
}
