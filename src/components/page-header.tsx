import { cn } from "@/lib/utils";

/** Título grande, ao estilo "large title" do iOS: forte, curto, com ar à volta. */
export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
  className,
}: {
  title: string;
  description?: string;
  eyebrow?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-x-4 gap-y-3 pt-1", className)}>
      <div className="min-w-0">
        {eyebrow && (
          <p className="mb-1.5 text-[12px] font-medium uppercase tracking-[0.08em] text-primary">{eyebrow}</p>
        )}
        <h1 className="font-display text-[28px] font-bold leading-[1.1] tracking-[-0.025em] sm:text-[32px]">{title}</h1>
        {description && <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
