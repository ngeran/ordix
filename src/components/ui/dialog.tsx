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
        "m-auto w-[calc(100vw-2rem)] rounded-2xl border border-border bg-surface p-0 text-on-surface shadow-pop backdrop:backdrop-blur-sm",
        wide ? "max-w-2xl" : "max-w-md"
      )}
    >
      <div className="animate-fade-scale-in">
        {/* -- Header -- */}
        <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-4">
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
        <div className="scrollbar-thin max-h-[65vh] overflow-y-auto px-5 py-4">
          {children}
        </div>

        {/* -- Footer -- */}
        {footer && (
          <div className="flex flex-wrap justify-end gap-2 border-t border-border px-5 py-4">
            {footer}
          </div>
        )}
      </div>
    </dialog>
  );
}
