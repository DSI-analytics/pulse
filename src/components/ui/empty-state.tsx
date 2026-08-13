import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border-strong px-6 py-12 text-center",
        className,
      )}
    >
      {Icon && (
        <div className="flex size-11 items-center justify-center rounded-full bg-surface-2 text-muted-foreground">
          <Icon className="size-5" />
        </div>
      )}
      <div className="space-y-1">
        <p className="font-medium text-foreground">{title}</p>
        {description && <p className="mx-auto max-w-sm text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}
