import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { LoginForm } from "./login-form";
import { PulseMark } from "@/components/pulse-mark";

export const metadata: Metadata = { title: "Entrar · Pulso" };

const DEMO = [
  { role: "Administrador", email: "admin@clinicamarianu.mz" },
  { role: "Rececionista", email: "rececao@clinicamarianu.mz" },
  { role: "Médico", email: "medico@clinicamarianu.mz" },
  { role: "Financeiro", email: "financeiro@clinicamarianu.mz" },
];

export default async function LoginPage() {
  if (await getSession()) redirect("/");

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      {/* Brand panel */}
      <div className="relative hidden flex-col justify-between bg-primary p-10 text-primary-foreground lg:flex">
        <div className="flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-lg bg-white/15">
            <PulseMark className="size-6 text-white" />
          </div>
          <span className="font-display text-xl font-bold">Pulso</span>
        </div>
        <div className="max-w-md space-y-4">
          <h1 className="font-display text-3xl font-bold leading-tight">
            O pulso da sua clínica, em tempo real.
          </h1>
          <p className="text-primary-foreground/80">
            Marcações, ocupação médica, receitas, stock e recebimentos — uma só plataforma,
            pensada para clínicas em Moçambique.
          </p>
          <PulseMark className="h-10 w-56 text-white/40" line />
        </div>
        <p className="text-sm text-primary-foreground/60">Maputo · MZN · Africa/Maputo</p>
      </div>

      {/* Form */}
      <div className="flex items-center justify-center bg-background p-6">
        <div className="w-full max-w-sm">
          <div className="mb-6 flex items-center gap-2.5 lg:hidden">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary">
              <PulseMark className="size-6 text-white" />
            </div>
            <span className="font-display text-xl font-bold">Pulso</span>
          </div>
          <h2 className="font-display text-2xl font-semibold">Entrar</h2>
          <p className="mt-1 text-sm text-muted-foreground">Aceda à gestão da sua clínica.</p>

          <div className="mt-6">
            <LoginForm />
          </div>

          <div className="mt-8 rounded-lg border border-dashed border-border-strong p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-subtle-foreground">
              Contas de demonstração
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Palavra-passe: <span className="font-mono font-medium text-foreground">pulso123</span>
            </p>
            <ul className="mt-2 space-y-1">
              {DEMO.map((d) => (
                <li key={d.email} className="flex items-center justify-between text-[13px]">
                  <span className="text-muted-foreground">{d.role}</span>
                  <span className="font-mono text-foreground">{d.email}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </main>
  );
}
