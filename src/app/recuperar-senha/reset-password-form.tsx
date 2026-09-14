"use client";
import Link from "next/link";
import { useActionState } from "react";
import { CheckCircle2, Loader2, Mail, ShieldCheck } from "lucide-react";
import {
  confirmPasswordReset,
  requestPasswordReset,
  type ConfirmResetState,
  type RequestResetState,
} from "@/server/password-reset-actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button, buttonVariants } from "@/components/ui/button";
import { useT } from "@/i18n/client";

export function ResetPasswordForm() {
  const t = useT();
  const [requestState, requestAction, requesting] = useActionState(requestPasswordReset, null as RequestResetState);
  const [confirmState, confirmAction, confirming] = useActionState(confirmPasswordReset, null as ConfirmResetState);

  if (confirmState?.status === "reset") {
    return (
      <div className="space-y-5 text-center">
        <span className="mx-auto flex size-11 items-center justify-center rounded-full bg-success-muted text-success">
          <CheckCircle2 className="size-5" />
        </span>
        <div>
          <h2 className="font-display text-xl font-semibold">{t("auth.reset.doneTitle")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("auth.reset.doneBody")}</p>
        </div>
        <Link href="/login" className={buttonVariants({ className: "w-full" })}>{t("auth.reset.backToLogin")}</Link>
      </div>
    );
  }

  if (requestState?.status === "sent" && requestState.email) {
    // Sem valores, `t` devolve o texto com "{email}" intacto: parte-se aí para pôr o email a negrito.
    const [sentBefore, sentAfter = ""] = t("auth.reset.codeSent").split("{email}");
    return (
      <form action={confirmAction} className="space-y-4">
        <input type="hidden" name="email" value={requestState.email} />
        <div className="rounded-md bg-info-muted px-3 py-2.5 text-[13px] text-info">
          {sentBefore}<strong>{requestState.email}</strong>{sentAfter}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="reset-code">{t("auth.reset.code")}</Label>
          <Input id="reset-code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} placeholder="000000" className="text-center font-mono text-lg tabular" required autoFocus />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="new-password">{t("auth.reset.newPassword")}</Label>
          <Input id="new-password" name="password" type="password" autoComplete="new-password" minLength={8} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirm-password">{t("auth.reset.confirmPassword")}</Label>
          <Input id="confirm-password" name="passwordConfirmation" type="password" autoComplete="new-password" minLength={8} required />
        </div>
        {confirmState?.error && <p className="rounded-md bg-danger-muted px-3 py-2 text-[13px] font-medium text-danger">{confirmState.error}</p>}
        <Button type="submit" className="w-full" disabled={confirming}>
          {confirming ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
          {t("auth.reset.confirmSubmit")}
        </Button>
        <div className="flex items-center justify-between text-[13px]">
          <Link href="/recuperar-senha" className="text-primary hover:underline">{t("auth.reset.otherEmail")}</Link>
          <Link href="/login" className="text-muted-foreground hover:text-foreground">{t("auth.reset.backToLogin")}</Link>
        </div>
      </form>
    );
  }

  return (
    <form action={requestAction} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="recovery-email">{t("auth.reset.accountEmail")}</Label>
        <Input id="recovery-email" name="email" type="email" autoComplete="email" placeholder={t("auth.login.emailPlaceholder")} required autoFocus />
      </div>
      {requestState?.error && <p className="rounded-md bg-danger-muted px-3 py-2 text-[13px] font-medium text-danger">{requestState.error}</p>}
      <Button type="submit" className="w-full" disabled={requesting}>
        {requesting ? <Loader2 className="animate-spin" /> : <Mail />}
        {t("auth.reset.sendCode")}
      </Button>
      <Link href="/login" className="block text-center text-[13px] text-muted-foreground hover:text-foreground">{t("auth.reset.backToLogin")}</Link>
    </form>
  );
}
