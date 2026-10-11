"use client";

// ============================================================
// SECTION: Imports
// ============================================================

import { forwardRef } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// ============================================================
// SECTION: Button
// ------------------------------------------------------------
// Touch-first sizes: even `sm` keeps a 40px height, `md` is the
// 48px minimum for warehouse gloves/touches, `xl` for the POS
// primary actions. Variants cover every screen's needs.
// ============================================================

const buttonVariants = cva(
  // Base: inline-flex centering, weight, transition, disabled state
  "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-xl font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-primary text-on-primary hover:bg-primary-strong",
        secondary:
          "bg-surface-container-high text-on-surface hover:bg-surface-container-highest",
        outline:
          "border border-border bg-surface text-on-surface hover:bg-surface-container-low",
        ghost:
          "text-on-surface hover:bg-surface-container-low",
        danger: "bg-error text-white hover:opacity-90",
        success: "bg-success text-white hover:opacity-90",
      },
      size: {
        sm: "h-10 min-w-10 px-3 text-sm",
        md: "h-12 min-w-12 px-4 text-[15px]",
        lg: "h-14 min-w-14 px-6 text-base",
        xl: "h-16 min-w-16 px-8 text-lg",
        icon: "h-12 w-12",
        iconSm: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /** Shows a spinner and blocks interaction while true. */
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading, disabled, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        disabled={disabled || loading}
        {...props}
      >
        {loading && <Loader2 className="h-5 w-5 animate-spin" aria-hidden />}
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";
