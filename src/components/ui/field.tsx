"use client";

// ============================================================
// SECTION: Imports
// ============================================================

import { cn } from "@/lib/utils";

// ============================================================
// SECTION: Field wrapper
// ------------------------------------------------------------
// Label + control + hint/error line. Keeps every form screen
// visually identical and wires htmlFor automatically.
// ============================================================

interface FieldProps {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
}

export function Field({ label, htmlFor, hint, error, children, className }: FieldProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label
        htmlFor={htmlFor}
        className="block text-sm font-medium text-on-surface-muted"
      >
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-sm text-error" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-on-surface-muted">{hint}</p>
      ) : null}
    </div>
  );
}
