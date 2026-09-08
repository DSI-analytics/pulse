"use client";

import * as React from "react";
import { Eye, EyeOff, KeyRound, Loader2, Save } from "lucide-react";
import { changeOwnPassword, updateOwnProfile, type AccountActionState } from "@/server/account-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function AccountSettings({ name, email }: { name: string; email: string }) {
  const [profileState, profileAction, profilePending] = React.useActionState(updateOwnProfile, null as AccountActionState);
  const [passwordState, passwordAction, passwordPending] = React.useActionState(changeOwnPassword, null as AccountActionState);
  const passwordForm = React.useRef<HTMLFormElement>(null);

  React.useEffect(() => {
    if (passwordState?.ok) passwordForm.current?.reset();
  }, [passwordState]);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <form action={profileAction} className="rounded-lg border border-border bg-card p-5 shadow-sm">
        <div className="mb-5">
          <h2 className="text-base font-semibold">Dados pessoais</h2>
          <p className="mt-1 text-[13px] text-muted-foreground">Informação usada para identificar a sua conta.</p>
        </div>
        <div className="space-y-4">
          <div><Label htmlFor="account-name">Nome completo</Label><Input id="account-name" name="name" className="mt-1.5" defaultValue={name} autoComplete="name" required /></div>
          <div><Label htmlFor="account-email">Email</Label><Input id="account-email" name="email" type="email" className="mt-1.5" defaultValue={email} autoComplete="email" required /></div>
          <ActionMessage state={profileState} />
          <Button type="submit" disabled={profilePending}>{profilePending ? <Loader2 className="animate-spin" /> : <Save />} Guardar alterações</Button>
        </div>
      </form>

      <form ref={passwordForm} action={passwordAction} className="rounded-lg border border-border bg-card p-5 shadow-sm">
        <div className="mb-5">
          <h2 className="text-base font-semibold">Segurança</h2>
          <p className="mt-1 text-[13px] text-muted-foreground">Altere a palavra-passe da sua conta.</p>
        </div>
        <div className="space-y-4">
          <PasswordField id="current-password" name="currentPassword" label="Palavra-passe atual" autoComplete="current-password" />
          <PasswordField id="new-password" name="newPassword" label="Nova palavra-passe" autoComplete="new-password" minLength={8} />
          <PasswordField id="confirm-password" name="confirmPassword" label="Confirmar nova palavra-passe" autoComplete="new-password" minLength={8} />
          <ActionMessage state={passwordState} />
          <Button type="submit" disabled={passwordPending}>{passwordPending ? <Loader2 className="animate-spin" /> : <KeyRound />} Alterar palavra-passe</Button>
        </div>
      </form>
    </div>
  );
}

function PasswordField({ id, name, label, autoComplete, minLength }: {
  id: string; name: string; label: string; autoComplete: string; minLength?: number;
}) {
  const [visible, setVisible] = React.useState(false);
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <div className="relative mt-1.5">
        <Input id={id} name={name} type={visible ? "text" : "password"} autoComplete={autoComplete} minLength={minLength} className="pr-10" required />
        <button type="button" onClick={() => setVisible((value) => !value)} className="absolute right-0 top-0 flex size-9 items-center justify-center text-muted-foreground hover:text-foreground" aria-label={visible ? `Ocultar ${label.toLowerCase()}` : `Mostrar ${label.toLowerCase()}`} title={visible ? "Ocultar" : "Mostrar"}>
          {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
    </div>
  );
}

function ActionMessage({ state }: { state: AccountActionState }) {
  if (!state) return null;
  return <p role="status" className={cn("rounded-md px-3 py-2 text-[13px] font-medium", state.ok ? "bg-success-muted text-success" : "bg-danger-muted text-danger")}>{state.message}</p>;
}
