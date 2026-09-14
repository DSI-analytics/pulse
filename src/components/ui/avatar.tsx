import { cn } from "@/lib/utils";
import { initials as toInitials } from "@/lib/utils";

interface AvatarProps {
  name: string;
  className?: string;
  color?: string;
}

export function Avatar({ name, className, color }: AvatarProps) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full text-xs font-semibold",
        "size-8 bg-primary-muted text-primary",
        className,
      )}
      // color-mix funciona com qualquer formato de cor (HEX antigo ou OKLCH) e
      // mistura em OKLCH: fundo com 14% da cor sobre o cartão e texto puxado
      // para o primeiro plano, para manter contraste ≥ 4,5:1 nos dois temas.
      style={
        color
          ? {
              backgroundColor: `color-mix(in oklch, ${color} 14%, var(--card))`,
              color: `color-mix(in oklch, ${color} 62%, var(--foreground))`,
            }
          : undefined
      }
      aria-hidden
    >
      {toInitials(name)}
    </span>
  );
}
