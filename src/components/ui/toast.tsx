"use client";

// ============================================================
// SECTION: Imports
// ============================================================

import { useEffect, useRef } from "react";
import { CheckCircle2, Info, TriangleAlert, XCircle } from "lucide-react";
import { useToastStore, type ToastKind } from "@/stores/toast-store";
import { cn } from "@/lib/utils";

// ============================================================
// SECTION: Toast viewport
// ------------------------------------------------------------
// Single mount point in the root layout. Renders the toast
// store's queue fixed at the top; tap to dismiss. Icons + accent
// colors per kind, aria-live for screen readers.
// ============================================================

const KIND_STYLES: Record<ToastKind, { border: string; icon: React.ReactNode }> = {
  success: {
    border: "border-l-success",
    icon: <CheckCircle2 className="h-5 w-5 text-success" aria-hidden />,
  },
  error: {
    border: "border-l-error",
    icon: <XCircle className="h-5 w-5 text-error" aria-hidden />,
  },
  warning: {
    border: "border-l-warning",
    icon: <TriangleAlert className="h-5 w-5 text-warning" aria-hidden />,
  },
  info: {
    border: "border-l-info",
    icon: <Info className="h-5 w-5 text-info" aria-hidden />,
  },
};

// Open modal <dialog>s live in the browser's TOP LAYER, above any
// z-index — toasts raised from inside a dialog (save errors…) used
// to render behind its backdrop. The viewport is therefore a manual
// popover (also top layer), re-shown on every change so it stacks
// above the most recently opened dialog. Without popover support
// (Safari < 17) it degrades to the plain fixed z-50 layer.
export function ToastViewport() {
  const toasts = useToastStore((state) => state.toasts);
  const dismiss = useToastStore((state) => state.dismiss);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof el.showPopover !== "function") return;
    if (el.matches(":popover-open")) el.hidePopover();
    if (toasts.length > 0) el.showPopover();
  }, [toasts]);

  return (
    <div
      ref={ref}
      popover="manual"
      className={cn(
        // Reset the UA popover box (centered, bordered, opaque).
        "pointer-events-none fixed inset-x-0 bottom-auto top-[max(0.75rem,env(safe-area-inset-top))] z-50 m-0 flex w-auto flex-col items-center gap-2 overflow-visible border-0 bg-transparent p-0",
        "px-[max(0.75rem,env(safe-area-inset-left))]",
        toasts.length === 0 && "hidden"
      )}
      aria-live="polite"
      role="status"
    >
      {toasts.map((toast) => (
        <button
          key={toast.id}
          onClick={() => dismiss(toast.id)}
          className={cn(
            "animate-slide-down pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-xl border border-border border-l-4 bg-surface px-4 py-3 text-left text-sm shadow-pop",
            KIND_STYLES[toast.kind].border
          )}
        >
          {KIND_STYLES[toast.kind].icon}
          <span className="flex-1 text-on-surface">{toast.text}</span>
        </button>
      ))}
    </div>
  );
}
