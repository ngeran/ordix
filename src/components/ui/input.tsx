"use client";

// ============================================================
// SECTION: Imports
// ============================================================

import { forwardRef } from "react";
import { cn } from "@/lib/utils";

// ============================================================
// SECTION: Text input
// ------------------------------------------------------------
// 48px tall by default (touch target rule), muted-label styling
// handled by <Field>; invalid state via aria-invalid.
// ============================================================

export const Input = forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => {
  return (
    <input
      ref={ref}
      className={cn(
        "h-12 w-full rounded-xl border border-border bg-surface px-4 text-[15px] text-on-surface placeholder:text-on-surface-muted/70",
        "focus:border-primary focus:outline-none",
        "aria-invalid:border-error aria-invalid:bg-error-soft/30",
        className
      )}
      {...props}
    />
  );
});
Input.displayName = "Input";
