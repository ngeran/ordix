// ============================================================
// SECTION: Badge
// ------------------------------------------------------------
// Tiny presentational pill. Status badges pass their colors via
// className from STATUS_META; stock badges use the variants.
// ============================================================

import { cn } from "@/lib/utils";

interface BadgeProps {
  children: React.ReactNode;
  className?: string;
  /** Optional leading dot (status chips). */
  dot?: string; // Tailwind bg-* class for the dot
}

export function Badge({ children, className, dot }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold",
        className
      )}
    >
      {dot && <span className={cn("h-2 w-2 rounded-full", dot)} aria-hidden />}
      {children}
    </span>
  );
}
