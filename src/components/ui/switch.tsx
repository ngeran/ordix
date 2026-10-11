"use client";

// ============================================================
// SECTION: Switch (toggle)
// ------------------------------------------------------------
// Accessible switch pattern: a real <button role="switch"> with
// an animated thumb. Geometry is chosen so the thumb ALWAYS
// stays inside the track with an even inset on both sides:
//   track 48×28 (w-12 h-7), thumb 20×20 (h-5 w-5), inset 4px
//   → checked:   left 4 + travel 20 + thumb 20 + right 4 = 48
//   → unchecked: left 4 + thumb 20 + right 24
// (The earlier version let the thumb land flush with the track
// edge, which read as a rendering glitch on high-DPR tablets.)
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
        "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:opacity-50",
        checked ? "bg-primary" : "bg-surface-container-highest"
      )}
      {...aria}
    >
      <span
        aria-hidden
        className={cn(
          "absolute left-1 h-5 w-5 rounded-full bg-white shadow transition-transform duration-150",
          checked ? "translate-x-5" : "translate-x-0"
        )}
      />
    </button>
  );
}
