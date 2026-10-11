"use client";

// ============================================================
// SECTION: Imports
// ============================================================

import { forwardRef } from "react";
import { cn } from "@/lib/utils";

// ============================================================
// SECTION: Multiline text area (order notes, product descriptions)
// ============================================================

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => {
  return (
    <textarea
      ref={ref}
      className={cn(
        "min-h-24 w-full rounded-xl border border-border bg-surface px-4 py-3 text-[15px] text-on-surface placeholder:text-on-surface-muted/70",
        "focus:border-primary focus:outline-none",
        "aria-invalid:border-error aria-invalid:bg-error-soft/30",
        className
      )}
      {...props}
    />
  );
});
Textarea.displayName = "Textarea";
