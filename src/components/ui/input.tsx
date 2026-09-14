import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Campos preenchidos com aresta sólida de 1px. O foco troca a aresta para a cor
 * da marca e acrescenta um halo SÓLIDO (`primary-muted`) — nítido, sem desfoque.
 * Desactivado: tons sólidos mais suaves, nunca opacidade sobre o texto.
 */
export const fieldClasses = cn(
  "w-full rounded-[12px] border border-input bg-fill text-sm text-foreground antialiased",
  "transition-[background-color,border-color,box-shadow] duration-200 ease-out",
  "placeholder:text-subtle-foreground hover:border-border-strong",
  "focus-visible:border-primary focus-visible:bg-surface focus-visible:outline-none",
  "focus-visible:shadow-[0_0_0_3px_var(--primary-muted)]",
  "disabled:cursor-not-allowed disabled:bg-fill-subtle disabled:text-subtle-foreground",
  "aria-[invalid=true]:border-danger",
);

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cn(fieldClasses, "flex h-10 px-3.5 py-1", className)} {...props} />
  ),
);
Input.displayName = "Input";
