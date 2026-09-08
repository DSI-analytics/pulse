import type { LucideIcon } from "lucide-react";
import { CircleDashed } from "lucide-react";

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
      <div className="flex items-start gap-3 border-b border-border pb-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-surface-2 text-primary">
          <Icon className="size-4" aria-hidden />
        </span>
        <div>
          <h2 id={`section-${title.replaceAll(" ", "-").toLowerCase()}`} className="text-base font-semibold">{title}</h2>
          <p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

export function DataGap({ labels }: { labels: string[] }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-dashed border-border-strong bg-surface-2 px-3 py-2.5 text-[12px] text-muted-foreground">
      <CircleDashed className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <p><span className="font-medium text-foreground">Sem dados estruturados:</span> {labels.join(", ")}.</p>
    </div>
  );
}
