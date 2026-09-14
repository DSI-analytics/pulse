import { cn } from "@/lib/utils";
import { PulseMark } from "@/components/pulse-mark";

/** Compact, branded processing indicator used in place of a rotating spinner. */
export function ProcessingPulse({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-flex h-4 w-8 shrink-0 items-center", className)}
    >
      <PulseMark className="!h-full !w-full" line animated />
    </span>
  );
}
