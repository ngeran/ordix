"use client";

// ============================================================
// SECTION: Imports
// ============================================================

import {
  Ban,
  CheckCircle2,
  Circle,
  Factory,
  Hammer,
  Lock,
  PackageCheck,
  Pause,
  type LucideIcon,
} from "lucide-react";
import type { OrderStatus } from "@/db/schema";
import type { ProductionProgress } from "@/lib/order-status";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

// ============================================================
// SECTION: Shared order visuals
// ------------------------------------------------------------
// The SAME bar, item pill and "what happens next" banner on the
// Orders list, order detail, Production, Closure and Wallboard,
// so an order looks identical wherever someone meets it.
// Colors: gray = not started, amber = being made, green = done.
// ============================================================

/** "26m" / "1h 13m" / "2d 3h" — compact age for cards and boards. */
export function formatAge(since: Date | string | null): string {
  if (!since) return "—";
  const minutes = Math.max(
    0,
    Math.floor((Date.now() - new Date(since).getTime()) / 60_000)
  );
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

// ============================================================
// SECTION: Progress bar (segmented) + caption
// ============================================================

export function ProgressBar({
  progress,
  size = "md",
  showCaption = true,
  className,
}: {
  progress: ProductionProgress;
  size?: "sm" | "md" | "lg";
  showCaption?: boolean;
  className?: string;
}) {
  const t = useT();
  const total = Math.max(1, progress.total);
  const donePct = (progress.done / total) * 100;
  const makingPct = (progress.making / total) * 100;
  const caption = t("orders.progress", { done: progress.done, count: progress.total });

  return (
    <div className={className}>
      {showCaption && (
        <div className="mb-1 flex items-baseline justify-between gap-2">
          <span
            className={cn(
              "font-medium text-on-surface-muted",
              size === "lg" ? "text-base" : "text-xs"
            )}
          >
            {caption}
          </span>
          <span
            className={cn(
              "font-mono font-bold tabular-nums",
              progress.allDone ? "text-success" : "text-on-surface",
              size === "lg" ? "text-2xl" : "text-sm"
            )}
          >
            {t("progress.pct", { pct: progress.pct })}
          </span>
        </div>
      )}
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={progress.total}
        aria-valuenow={progress.done}
        aria-label={caption}
        className={cn(
          "flex w-full overflow-hidden rounded-full bg-surface-container-highest",
          size === "sm" ? "h-1.5" : size === "md" ? "h-2.5" : "h-4"
        )}
      >
        <div
          className="bg-success transition-[width] duration-500"
          style={{ width: `${donePct}%` }}
        />
        <div
          className="bg-warning transition-[width] duration-500"
          style={{ width: `${makingPct}%` }}
        />
      </div>
    </div>
  );
}

// ============================================================
// SECTION: Count legend (Not started · Being made · Done)
// ============================================================

export function ProgressLegend({
  progress,
  className,
}: {
  progress: ProductionProgress;
  className?: string;
}) {
  const t = useT();
  const rows: Array<{ label: string; value: number; dot: string }> = [
    { label: t("detail.awaitingProduction"), value: progress.waiting, dot: "bg-outline" },
    { label: t("detail.inProduction"), value: progress.making, dot: "bg-warning" },
    { label: t("detail.produced"), value: progress.done, dot: "bg-success" },
  ];
  return (
    <ul className={cn("grid grid-cols-3 gap-2", className)}>
      {rows.map((row) => (
        <li
          key={row.label}
          className="rounded-xl bg-surface-container px-3 py-2 text-center"
        >
          <span className="block font-mono text-2xl font-bold tabular-nums">
            {row.value}
          </span>
          <span className="flex items-center justify-center gap-1.5 text-xs text-on-surface-muted">
            <span aria-hidden className={cn("h-2 w-2 rounded-full", row.dot)} />
            {row.label}
          </span>
        </li>
      ))}
    </ul>
  );
}

// ============================================================
// SECTION: Item state pill (Not started / Being made / Done)
// ============================================================

const ITEM_STATE: Record<
  string,
  { icon: LucideIcon; className: string; key: "detail.awaitingProduction" | "detail.inProduction" | "detail.produced" }
> = {
  pending: {
    icon: Circle,
    className: "bg-surface-container-high text-on-surface-muted",
    key: "detail.awaitingProduction",
  },
  in_production: {
    icon: Hammer,
    className: "bg-warning-soft text-warning",
    key: "detail.inProduction",
  },
  completed: {
    icon: CheckCircle2,
    className: "bg-success-soft text-success",
    key: "detail.produced",
  },
};

export function ItemStatePill({
  state,
  className,
}: {
  state: string;
  className?: string;
}) {
  const t = useT();
  const meta = ITEM_STATE[state] ?? ITEM_STATE.pending;
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
        meta.className,
        className
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {t(meta.key)}
    </span>
  );
}

// ============================================================
// SECTION: "What happens next" — status + who acts, in words
// ------------------------------------------------------------
// The answer to "where is my order and whose turn is it?",
// derived from the order status AND its items (so an
// in-production order with every item done says so).
// ============================================================

interface NextStep {
  icon: LucideIcon;
  title: string;
  who: string;
  tone: "info" | "warning" | "success" | "ready" | "muted" | "error";
}

export function useNextStep(
  status: OrderStatus,
  progress: ProductionProgress
): NextStep {
  const t = useT();
  switch (status) {
    case "placed":
      return { icon: Factory, title: t("next.placed"), who: t("next.placedWho"), tone: "info" };
    case "in_production":
      return progress.allDone
        ? { icon: PackageCheck, title: t("next.allDone"), who: t("next.allDoneWho"), tone: "success" }
        : {
            icon: Hammer,
            title: t("next.making", { done: progress.done, total: progress.total }),
            who: t("next.makingWho"),
            tone: "warning",
          };
    case "production_complete":
      return { icon: PackageCheck, title: t("next.ready"), who: t("next.readyWho"), tone: "ready" };
    case "completed":
      return { icon: Lock, title: t("next.closed"), who: t("next.closedWho"), tone: "muted" };
    case "on_hold":
      return { icon: Pause, title: t("next.hold"), who: t("next.holdWho"), tone: "warning" };
    case "cancelled":
      return { icon: Ban, title: t("next.cancelled"), who: t("next.cancelledWho"), tone: "error" };
    default:
      return { icon: Circle, title: t("next.legacy"), who: "", tone: "muted" };
  }
}

const TONE_CLASS: Record<NextStep["tone"], string> = {
  info: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  warning: "border-warning/30 bg-warning-soft text-warning",
  success: "border-success/40 bg-success-soft text-success",
  ready: "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300",
  muted: "border-border bg-surface-container text-on-surface-muted",
  error: "border-error/30 bg-error-soft text-error",
};

export function NextStepBanner({
  status,
  progress,
  className,
}: {
  status: OrderStatus;
  progress: ProductionProgress;
  className?: string;
}) {
  const t = useT();
  const step = useNextStep(status, progress);
  const Icon = step.icon;
  return (
    <div
      className={cn(
        "flex items-center gap-4 rounded-2xl border px-4 py-3.5",
        TONE_CLASS[step.tone],
        className
      )}
      role="status"
    >
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-current/10">
        <Icon className="h-7 w-7" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-wider opacity-80">
          {t("next.label")}
        </p>
        <p className="text-lg font-bold leading-tight">{step.title}</p>
        {step.who && <p className="mt-0.5 text-sm text-on-surface">{step.who}</p>}
      </div>
    </div>
  );
}
