"use client";

// ============================================================
// SECTION: Imports
// ============================================================

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

export function ToastViewport() {
  const toasts = useToastStore((state) => state.toasts);
  const dismiss = useToastStore((state) => state.dismiss);

  if (toasts.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-3 z-50 flex flex-col items-center gap-2 px-3"
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
