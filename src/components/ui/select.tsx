"use client";

// ============================================================
// SECTION: Imports
// ============================================================

import { forwardRef } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

// ============================================================
// SECTION: Select
// ------------------------------------------------------------
// Native <select> on purpose: the OS picker is the best touch
// experience on phones/tablets (wheel/overlay UI) and needs no
// focus-trap plumbing. Styled to match the other inputs.
// ============================================================

export const Select = forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => {
  return (
    <div className="relative">
      <select
        ref={ref}
        className={cn(
          "h-12 w-full appearance-none rounded-xl border border-border bg-surface px-4 pr-11 text-[15px] text-on-surface",
          "focus:border-primary focus:outline-none",
          className
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-on-surface-muted"
        aria-hidden
      />
    </div>
  );
});
Select.displayName = "Select";
