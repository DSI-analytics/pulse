import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Botões em cápsula com cores sólidas e nítidas.
 *
 * - Estados de hover e desactivado trocam para tons SÓLIDOS — nunca opacidade
 *   nem filtros (`brightness`), que degradam a nitidez das letras.
 * - O brilho neon é uma sombra por trás do botão, não um efeito sobre o texto.
 */
const buttonVariants = cva(
  "press inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium antialiased focus-visible:outline-none disabled:pointer-events-none disabled:text-subtle-foreground disabled:shadow-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-glow hover:bg-primary-hover disabled:bg-fill-strong",
        secondary: "border border-border bg-fill text-foreground hover:border-border-strong hover:bg-fill-strong disabled:bg-fill-subtle",
        ghost: "text-muted-foreground hover:bg-fill hover:text-foreground",
        outline: "border border-border-strong text-foreground hover:bg-fill disabled:border-border",
        danger: "bg-danger text-danger-foreground shadow-glow-danger hover:bg-danger-hover disabled:bg-fill-strong",
        link: "rounded-md text-primary underline-offset-4 hover:underline active:translate-y-0",
      },
      size: {
        default: "h-10 px-[18px]",
        sm: "h-8 px-3.5 text-[13px]",
        lg: "h-12 px-6 text-[15px]",
        icon: "size-10",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  ),
);
Button.displayName = "Button";

export { buttonVariants };
