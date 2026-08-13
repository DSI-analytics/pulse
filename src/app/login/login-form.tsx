"use client";
import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { loginAction } from "@/server/auth-actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, null as { error?: string } | null);

  return (
    <form action={action} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="username" placeholder="voce@clinica.mz" required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">Palavra-passe</Label>
        <Input id="password" name="password" type="password" autoComplete="current-password" placeholder="••••••••" required />
      </div>
      {state?.error && (
        <p className="rounded-md bg-danger-muted px-3 py-2 text-[13px] font-medium text-danger">{state.error}</p>
      )}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending && <Loader2 className="size-4 animate-spin" />}
        Entrar
      </Button>
    </form>
  );
}
