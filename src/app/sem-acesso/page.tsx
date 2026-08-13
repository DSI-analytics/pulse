import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

export default function SemAcessoPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-6 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-danger-muted text-danger">
        <ShieldAlert className="size-7" />
      </div>
      <div>
        <h1 className="font-display text-2xl font-semibold">Sem acesso</h1>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          O seu perfil não tem permissão para ver esta secção. Contacte o administrador da clínica.
        </p>
      </div>
      <Link href="/" className={buttonVariants({ variant: "secondary" })}>
        Voltar ao painel
      </Link>
    </main>
  );
}
