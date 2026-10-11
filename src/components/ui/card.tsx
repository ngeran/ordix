// ============================================================
// SECTION: Card
// ------------------------------------------------------------
// The standard surface container used across every screen.
// ============================================================

import { cn } from "@/lib/utils";

interface CardProps {
  children: React.ReactNode;
  className?: string;
}

export function Card({ children, className }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-surface shadow-card",
        className
      )}
    >
      {children}
    </div>
  );
}
