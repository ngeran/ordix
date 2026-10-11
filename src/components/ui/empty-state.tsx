// ============================================================
// SECTION: Empty state
// ------------------------------------------------------------
// Icon + headline + hint for empty lists/boards — consistent
// across orders, prep, stock, catalog.
// ============================================================

import type { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  hint?: string;
}

export function EmptyState({ icon: Icon, title, hint }: EmptyStateProps) {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <div className="rounded-2xl bg-surface-container p-4">
        <Icon className="h-8 w-8 text-on-surface-muted" aria-hidden />
      </div>
      <p className="mt-2 font-medium text-on-surface">{title}</p>
      {hint && <p className="text-sm text-on-surface-muted">{hint}</p>}
    </div>
  );
}
