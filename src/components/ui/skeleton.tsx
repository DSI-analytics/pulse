import { cn } from "@/lib/utils";

/** Placeholder de carregamento com brilho a percorrer, interpolado em OKLCH. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "rounded-lg bg-[linear-gradient(90deg_in_oklch,var(--fill)_0%,var(--fill-strong)_50%,var(--fill)_100%)] bg-[length:200%_100%] motion-safe:animate-[shimmer_1.6s_ease-in-out_infinite]",
        className,
      )}
    />
  );
}
