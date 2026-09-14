import type { LucideIcon } from "lucide-react";
import { CircleDashed } from "lucide-react";
import { getTranslator } from "@/i18n/server";

export function DashboardSection({
  title,
  description,
  icon: Icon,
  children,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3" aria-labelledby={`section-${title.replaceAll(" ", "-").toLowerCase()}`}>
      <div className="flex items-start gap-3 pb-1">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-muted text-primary">
          <Icon className="size-4" aria-hidden />
        </span>
        <div>
          <h2 id={`section-${title.replaceAll(" ", "-").toLowerCase()}`} className="text-base font-semibold tracking-[-0.01em]">{title}</h2>
          <p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

export async function DataGap({ labels }: { labels: string[] }) {
  const t = await getTranslator();
  return (
    <div className="flex items-start gap-2 rounded-[14px] bg-fill-subtle px-3.5 py-3 text-[12px] text-muted-foreground">
      <CircleDashed className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <p><span className="font-medium text-foreground">{t("common.noStructuredData")}</span> {labels.join(", ")}.</p>
    </div>
  );
}
