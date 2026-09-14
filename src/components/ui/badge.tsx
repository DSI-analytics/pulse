import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/** Etiquetas tonais em cápsula, com um contorno interno quase invisível. */
const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset transition-colors",
  {
    variants: {
      variant: {
        default: "bg-primary-muted text-primary ring-primary-edge",
        neutral: "bg-fill text-muted-foreground ring-border",
        success: "bg-success-muted text-success ring-success-edge",
        warning: "bg-warning-muted text-warning ring-warning-edge",
        danger: "bg-danger-muted text-danger ring-danger-edge",
        info: "bg-info-muted text-info ring-info-edge",
        outline: "text-muted-foreground ring-border-strong",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { badgeVariants };
