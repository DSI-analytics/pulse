import type { Metadata } from "next";
import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { getTranslator } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslator();
  return { title: t("noAccess.title") };
}

export default async function SemAcessoPage() {
  const t = await getTranslator();
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-6 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-danger-muted text-danger">
        <ShieldAlert className="size-7" />
      </div>
      <div>
        <h1 className="font-display text-2xl font-semibold">{t("noAccess.title")}</h1>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">{t("noAccess.body")}</p>
      </div>
      <Link href="/" className={buttonVariants({ variant: "secondary" })}>
        {t("noAccess.back")}
      </Link>
    </main>
  );
}
