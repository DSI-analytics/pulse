import Image from "next/image";
import { cn } from "@/lib/utils";

export function PulsoLogo({
  className,
  priority = false,
}: {
  className?: string;
  priority?: boolean;
}) {
  return (
    <Image
      src="/pulso-logo.gif"
      alt="Pulso"
      width={678}
      height={158}
      unoptimized
      priority={priority}
      sizes="(max-width: 640px) 144px, 176px"
      className={cn("h-auto object-contain", className)}
    />
  );
}
