"use client";
import Link from "next/link";
import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { loginAction } from "@/server/auth-actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { PulseMark } from "@/components/pulse-mark";
import { useT } from "@/i18n/client";

export function LoginForm() {
  const t = useT();
  const [state, action, pending] = useActionState(loginAction, null as { error?: string } | null);

  return (
    <form action={action} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="email">{t("auth.login.email")}</Label>
        <Input id="email" name="email" type="email" autoComplete="username" placeholder={t("auth.login.emailPlaceholder")} required />
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">{t("auth.login.password")}</Label>
          <Link href="/recuperar-senha" className="text-xs font-medium text-primary hover:underline">{t("auth.login.forgotPassword")}</Link>
        </div>
        <Input id="password" name="password" type="password" autoComplete="current-password" placeholder="••••••••" required />
      </div>
      {state?.error && (
        <p className="rounded-md bg-danger-muted px-3 py-2 text-[13px] font-medium text-danger">{state.error}</p>
      )}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending && <Loader2 className="size-4 animate-spin" />}
        {t("auth.login.submit")}
      </Button>
      {pending && (
        <div
          role="status"
          aria-live="polite"
          className="animate-auth-cover fixed inset-0 z-[200] flex items-center justify-center bg-background p-6"
        >
          <div className="glass-strong animate-sheet flex min-w-52 flex-col items-center rounded-[28px] px-8 py-7 text-center">
            <div className="flex size-14 items-center justify-center rounded-[18px] bg-primary shadow-glow">
              <PulseMark className="size-8 text-primary-foreground" />
            </div>
            <p className="mt-4 font-display text-lg font-semibold">Pulso</p>
            <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin text-primary" aria-hidden />
              {t("common.loading")}
            </p>
          </div>
        </div>
      )}
    </form>
  );
}
