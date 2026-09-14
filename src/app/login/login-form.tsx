"use client";
import Link from "next/link";
import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { loginAction } from "@/server/auth-actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
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
    </form>
  );
}
