import { Loader2 } from "lucide-react";
import { PulseMark } from "@/components/pulse-mark";

/** Neutral shell shown while the server validates an existing session. */
export default function LoginLoading() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-6">
      <div role="status" aria-label="Pulso" className="glass-strong animate-sheet flex min-w-52 flex-col items-center rounded-[28px] px-8 py-7 text-center">
        <div className="flex size-14 items-center justify-center rounded-[18px] bg-primary shadow-glow">
          <PulseMark className="size-8 text-primary-foreground" />
        </div>
        <p className="mt-4 font-display text-lg font-semibold">Pulso</p>
        <Loader2 className="mt-3 size-5 animate-spin text-primary" aria-hidden />
      </div>
    </main>
  );
}
