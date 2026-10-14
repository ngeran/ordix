"use client";

// ============================================================
// SECTION: Imports
// ============================================================

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

// ============================================================
// SECTION: Dialog (modal)
// ------------------------------------------------------------
// Built on the native <dialog> element: browser-managed focus
// trap, Esc-to-close and top-layer stacking for free — no
// accessibility plumbing to get wrong. Controlled via `open`;
// closes on backdrop click, Esc or the X button.
//
// Sizing: the dialog is a flex column capped to the VISIBLE
// viewport (--vvh, published by startViewportTracking — iOS keeps
// dvh unchanged when the keyboard opens). Header and footer stay
// put; only the body scrolls, so Save is always reachable even on
// a phone in landscape. With the keyboard up it docks to the top
// so the focused field isn't hidden behind the keyboard.
// ============================================================

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  /** Sticky bottom action area (buttons). */
  footer?: React.ReactNode;
  /** Wider content (forms with two columns). */
  wide?: boolean;
}

export function Dialog({ open, onClose, title, children, footer, wide }: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  // Sync React state → native dialog API (showModal/close).
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  // "Cancel" fires on Esc; prevent default and route through
  // onClose so parent state stays the single source of truth.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handleCancel = (event: Event) => {
      event.preventDefault();
      onClose();
    };
    dialog.addEventListener("cancel", handleCancel);
    return () => dialog.removeEventListener("cancel", handleCancel);
  }, [onClose]);

  // Backdrop click (click on the dialog padding outside the panel).
  const handleBackdropClick = (event: React.MouseEvent<HTMLDialogElement>) => {
    if (event.target === dialogRef.current) onClose();
  };

  return (
    <dialog
      ref={dialogRef}
      onClick={handleBackdropClick}
      aria-label={title}
      className={cn(
        "m-auto max-h-[calc(var(--vvh,100dvh)-1.5rem)] w-[calc(100vw-1.5rem-env(safe-area-inset-left)-env(safe-area-inset-right))] overflow-hidden rounded-2xl border border-border bg-surface p-0 text-on-surface shadow-pop backdrop:backdrop-blur-sm",
        "open:flex open:flex-col kbd-open:mt-3 kbd-open:mb-auto",
        wide ? "max-w-2xl" : "max-w-md"
      )}
    >
      <div className="flex min-h-0 flex-1 animate-fade-scale-in flex-col">
        {/* -- Header -- */}
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-border px-5 py-4 short:py-2.5">
          <h2 className="text-lg font-semibold">{title}</h2>
          <Button
            variant="ghost"
            size="iconSm"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* -- Body -- */}
        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 short:py-3">
          {children}
        </div>

        {/* -- Footer -- */}
        {footer && (
          <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-border px-5 py-4 short:py-2.5">
            {footer}
          </div>
        )}
      </div>
    </dialog>
  );
}
