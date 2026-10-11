// ============================================================
// SECTION: Loading spinner & full-area pending state
// ============================================================

import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function Spinner({ className }: { className?: string }) {
  return (
    <Loader2
      className={cn("h-6 w-6 animate-spin text-primary", className)}
      aria-hidden
    />
  );
}

/** Centered spinner filling its container (boards, lists). */
export function LoadingArea({ label = "Loading…" }: { label?: string }) {
  return (
    <div
      className="flex min-h-48 flex-col items-center justify-center gap-3 text-on-surface-muted"
      role="status"
      aria-live="polite"
    >
      <Spinner className="h-8 w-8" />
      <span className="text-sm">{label}</span>
    </div>
  );
}
