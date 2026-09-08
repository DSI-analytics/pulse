import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { PulseMark } from "@/components/pulse-mark";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = { title: "Recuperar palavra-passe · Pulso" };

export default async function RecoverPasswordPage() {
  if (await getSession()) redirect("/");

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm">
        <div className="mb-7 flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary">
            <PulseMark className="size-6 text-white" />
          </span>
          <span className="font-display text-xl font-bold">Pulso</span>
        </div>
        <div className="mb-6">
          <h1 className="font-display text-2xl font-semibold">Recuperar palavra-passe</h1>
          <p className="mt-1 text-sm text-muted-foreground">Receba um código de confirmação no email associado à conta.</p>
        </div>
        <ResetPasswordForm />
      </div>
    </main>
  );
}
