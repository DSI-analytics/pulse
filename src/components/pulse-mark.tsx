import { cn } from "@/lib/utils";

/** The Pulso identity mark — an ECG heartbeat. `line` renders a wide banner variant. */
export function PulseMark({ className, line = false }: { className?: string; line?: boolean }) {
  if (line) {
    return (
      <svg viewBox="0 0 220 40" fill="none" className={cn(className)} aria-hidden>
        <path
          d="M0 20 H44 l6-13 8 26 6-19 4 9 H120 l6 6 6-20 6 29 5-11 H220"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" className={cn(className)} aria-hidden>
      <path
        d="M2 12h4l2-6 4 12 2.5-8 1.5 2H22"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
