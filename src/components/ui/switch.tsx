"use client";

// ============================================================
// SECTION: Switch (toggle)
// ------------------------------------------------------------
// Accessible switch pattern: a real <button role="switch"> at
// 48px touch height, animated thumb, labeled by `aria-label`.
// ============================================================

import { cn } from "@/lib/utils";

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  "aria-label": string;
  disabled?: boolean;
}

export function Switch({ checked, onChange, disabled, ...aria }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      disabled={disabled}
      className={cn(
        "relative h-8 w-14 shrink-0 rounded-full transition-colors disabled:opacity-50",
        checked ? "bg-primary" : "bg-surface-container-highest"
      )}
      {...aria}
    >
      <span
        aria-hidden
        className={cn(
          "absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-transform",
          checked ? "translate-x-7" : "translate-x-1"
        )}
      />
    </button>
  );
}
