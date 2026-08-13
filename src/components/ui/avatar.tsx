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
      style={color ? { backgroundColor: `${color}1a`, color } : undefined}
      aria-hidden
    >
      {toInitials(name)}
    </span>
  );
}
