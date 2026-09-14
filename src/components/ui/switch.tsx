"use client";

import { cn } from "@/lib/utils";

/** Interruptor acessível (role="switch"). Trilho sólido com aresta de 1px. */
export function Switch({
  checked,
  onCheckedChange,
  id,
  disabled,
  "aria-describedby": describedBy,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  id?: string;
  disabled?: boolean;
  "aria-describedby"?: string;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-describedby={describedBy}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border outline-none transition-colors duration-200 focus-visible:shadow-[0_0_0_3px_var(--primary-muted)] disabled:cursor-not-allowed",
        checked ? "border-primary bg-primary shadow-glow" : "border-input bg-fill-strong",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "block size-[22px] rounded-full border border-border-strong bg-card shadow-card transition-transform duration-300 ease-[var(--ease-spring)]",
          checked ? "translate-x-[21px]" : "translate-x-[2px]",
        )}
      />
    </button>
  );
}
