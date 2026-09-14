import { ProcessingPulse } from "@/components/processing-pulse";
import { PulsoLogo } from "@/components/pulso-logo";

/** Neutral shell shown while the server validates an existing session. */
export default function LoginLoading() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-6">
      <div role="status" aria-label="Pulso" className="glass-strong animate-sheet flex min-w-52 flex-col items-center rounded-[28px] px-8 py-7 text-center">
        <PulsoLogo className="w-40" priority />
        <ProcessingPulse className="mt-3 h-5 w-10 text-primary" />
      </div>
    </main>
  );
}
