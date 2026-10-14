"use client";

// ============================================================
// SECTION: Imports
// ============================================================

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  Clock,
  Hammer,
  LogOut,
  PackageCheck,
  Sparkles,
  WifiOff,
  type LucideIcon,
} from "lucide-react";
import type { OrderSummary } from "@/types";
import { STATUS_META, summaryProgress } from "@/lib/order-status";
import { usePolling } from "@/lib/use-polling";
import { useLocale, useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { FullscreenToggle } from "@/components/layout/fullscreen-toggle";
import { formatAge } from "@/components/orders/order-visuals";

// ============================================================
// SECTION: Wallboard (/display)
// ------------------------------------------------------------
// A read-only, glance-from-across-the-room screen for TVs and
// mounted tablets. Four lanes that mirror the workflow:
//   NEW            ← placed
//   IN PRODUCTION  ← in_production (with % of items done)
//   READY FOR PICKUP ← production_complete (highlighted)
//   CLOSED TODAY   ← completed today (by completedAt)
//
// Design rules: huge type, high contrast, no interaction needed,
// NEVER scrolls on a big screen — each lane measures itself and
// shows as many cards as fit, then "+N more". Works in portrait
// (2×2) and landscape (4 across). Age chips turn amber past
// 30 min and red past 60 (not for finished lanes).
// ============================================================

const AGE_WARN_MIN = 30;
const AGE_HOT_MIN = 60;

/** Fixed card heights (rem) so each lane can compute how many fit. */
const CARD_REM = 7;
const CLOSED_CARD_REM = 3.75;
/** Compact variants — used when a lane is too short for ~3 full cards. */
const COMPACT_CARD_REM = 4;
const COMPACT_CLOSED_REM = 2.75;
/** Slim "+N more" footer line. */
const MORE_REM = 1.75;
const GAP_REM = 0.625;
/** Show at least this many orders per lane before switching to compact cards. */
const MIN_FULL_CARDS = 3;

// Lane grid: 4 across only when each lane gets ~300px+ (xl; a 1024-1180 wide
// tablet truncated names and order numbers) or on a short landscape screen,
// which uses compact cards; otherwise 2×2. Shared by the counters strip and the lanes.
const LANE_GRID =
  "sm:grid-cols-2 short:landscape:grid-cols-4 xl:grid-cols-4 xl:portrait:grid-cols-2";

type LaneKey = "new" | "making" | "ready" | "closed";

interface Lane {
  key: LaneKey;
  label: string;
  icon: LucideIcon;
  accent: string;
  text: string;
  orders: OrderSummary[];
}

function isToday(date: Date | string | null): boolean {
  if (!date) return false;
  return new Date(date).toDateString() === new Date().toDateString();
}

export function StatusBoard() {
  const t = useT();
  const locale = useLocale();

  const { data: activeOrders, isStale: activeStale } = usePolling<OrderSummary[]>(
    "/api/orders?scope=active",
    { intervalMs: 5_000 }
  );
  const { data: closedOrders, isStale: closedStale } = usePolling<OrderSummary[]>(
    "/api/orders?scope=history&status=completed",
    { intervalMs: 15_000 }
  );

  // -- Wall clock: re-render every 15 s (also refreshes the ages) --
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(timer);
  }, []);

  const byStatus = (status: OrderSummary["status"]) =>
    (activeOrders ?? []).filter((order) => order.status === status);

  const lanes: Lane[] = [
    {
      key: "new",
      label: STATUS_META.placed[locale],
      icon: Sparkles,
      accent: "bg-sky-500",
      text: "text-sky-500 dark:text-sky-400",
      orders: byStatus("placed"),
    },
    {
      key: "making",
      label: STATUS_META.in_production[locale],
      icon: Hammer,
      accent: "bg-amber-500",
      text: "text-amber-600 dark:text-amber-400",
      orders: byStatus("in_production"),
    },
    {
      key: "ready",
      label: STATUS_META.production_complete[locale],
      icon: PackageCheck,
      accent: "bg-emerald-500",
      text: "text-emerald-600 dark:text-emerald-400",
      // Longest-waiting pickup first.
      orders: byStatus("production_complete").sort(
        (a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()
      ),
    },
    {
      key: "closed",
      label: t("cashier.paidToday"),
      icon: CheckCircle2,
      accent: "bg-primary",
      text: "text-primary",
      orders: (closedOrders ?? [])
        .filter((order) => isToday(order.completedAt))
        .sort(
          (a, b) =>
            new Date(b.completedAt ?? 0).getTime() - new Date(a.completedAt ?? 0).getTime()
        ),
    },
  ];

  const isStale = activeStale || closedStale;
  const intlLocale = locale === "el" ? "el-GR" : "en-GB";

  return (
    <div className="flex h-app flex-col gap-3 overflow-y-auto bg-background p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] pt-[max(0.75rem,env(safe-area-inset-top))] short:gap-2 short:p-2 sm:overflow-hidden sm:p-5 short:sm:p-2 2xl:gap-5 2xl:p-8">
      {/* ============================================================
          SECTION: Header — brand, live state, clock, controls
          ============================================================ */}
      <header className="flex shrink-0 items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-xl font-black text-on-primary 2xl:h-14 2xl:w-14 2xl:text-2xl"
          >
            O
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold tracking-tight sm:text-3xl 2xl:text-4xl">
              {t("display.title")}
            </h1>
            {isStale ? (
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-warning">
                <WifiOff className="h-4 w-4" aria-hidden />
                {t("orders.staleData")}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-success">
                <span aria-hidden className="h-2 w-2 animate-pulse rounded-full bg-success" />
                {t("production.live")}
              </span>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3 sm:gap-5 short:gap-2">
          {now && (
            <div className="text-right">
              <p className="whitespace-nowrap font-mono text-3xl font-bold leading-none tabular-nums max-sm:text-xl short:text-2xl sm:text-3xl lg:text-4xl 2xl:text-6xl">
                {now.toLocaleTimeString(intlLocale, { hour: "2-digit", minute: "2-digit" })}
              </p>
              <p className="mt-1 hidden whitespace-nowrap text-sm text-on-surface-muted sm:block short:hidden 2xl:text-base">
                {now.toLocaleDateString(intlLocale, { weekday: "long", day: "numeric", month: "long" })}
              </p>
            </div>
          )}
          <div className="flex flex-col gap-1 short:flex-row short:gap-0 opacity-50 transition-opacity hover:opacity-100 focus-within:opacity-100">
            <FullscreenToggle />
            <Link
              href="/home"
              aria-label={t("display.exit")}
              title={t("display.exit")}
              className="flex h-12 w-12 items-center justify-center rounded-xl text-on-surface hover:bg-surface-container-low"
            >
              <LogOut className="h-5 w-5" />
            </Link>
          </div>
        </div>
      </header>

      {/* ============================================================
          SECTION: Counters strip
          ============================================================ */}
      {/* Short / low screens: lane headers already carry the counts. */}
      <div className={cn("grid shrink-0 grid-cols-2 gap-2 short:hidden [@media(max-height:840px)]:hidden sm:gap-3 2xl:gap-5", LANE_GRID)}>
        {lanes.map((lane) => {
          const Icon = lane.icon;
          return (
            <div
              key={lane.key}
              className={cn(
                "flex items-center gap-3 rounded-2xl border border-border bg-surface px-3 py-2.5 2xl:px-5 2xl:py-4",
                lane.key === "ready" && lane.orders.length > 0 && "border-emerald-500/60 bg-emerald-500/10"
              )}
            >
              <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white 2xl:h-14 2xl:w-14", lane.accent)}>
                <Icon className="h-6 w-6 2xl:h-8 2xl:w-8" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-mono text-3xl font-bold leading-none tabular-nums 2xl:text-5xl">
                  {activeOrders === null ? "–" : lane.orders.length}
                </p>
                <p className={cn("mt-0.5 line-clamp-2 break-words text-xs font-bold uppercase leading-tight tracking-wide 2xl:text-sm", lane.text)}>
                  {lane.label}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* ============================================================
          SECTION: The four lanes (2×2 portrait, 4 across wide landscape)
          ============================================================ */}
      <main className={cn("grid min-h-0 flex-1 grid-cols-1 gap-3 2xl:gap-5", LANE_GRID)}>
        {lanes.map((lane) => (
          <LaneColumn key={lane.key} lane={lane} />
        ))}
      </main>
    </div>
  );
}

// ============================================================
// SECTION: Lane column — measures itself, shows what fits
// ============================================================

/**
 * How many orders fit in the lane body, and whether they must be compact.
 * Prefers full cards while ≥ MIN_FULL_CARDS fit (or all orders do); else
 * compact cards. When not everything fits, room for the slim footer is
 * reserved. Phones in portrait scroll instead (∞, never compact).
 */
function useFitCount(total: number, fullRem: number, compactRem: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState({ count: Number.POSITIVE_INFINITY, compact: false });

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => {
      if (!window.matchMedia("(min-width: 640px)").matches) {
        setFit({ count: Number.POSITIVE_INFINITY, compact: false });
        return;
      }
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
      const style = getComputedStyle(element);
      const height = element.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
      const gap = GAP_REM * rem;
      const count = (cardRem: number) => {
        const card = cardRem * rem;
        const all = Math.floor((height + gap) / (card + gap));
        if (total <= all) return total;
        return Math.max(1, Math.floor((height - MORE_REM * rem) / (card + gap)));
      };
      const full = count(fullRem);
      if (full >= Math.min(total, MIN_FULL_CARDS)) setFit({ count: full, compact: false });
      else setFit({ count: count(compactRem), compact: true });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [total, fullRem, compactRem]);

  return [ref, fit] as const;
}

function LaneColumn({ lane }: { lane: Lane }) {
  const t = useT();
  const closed = lane.key === "closed";
  const [ref, fit] = useFitCount(
    lane.orders.length,
    closed ? CLOSED_CARD_REM : CARD_REM,
    closed ? COMPACT_CLOSED_REM : COMPACT_CARD_REM
  );

  const shown = lane.orders.slice(0, fit.count);
  const hidden = lane.orders.length - shown.length;
  const Icon = lane.icon;

  return (
    <section
      aria-label={lane.label}
      className={cn(
        "flex min-h-64 flex-col overflow-hidden rounded-2xl border bg-surface sm:min-h-0",
        lane.key === "ready" ? "border-emerald-500/50" : "border-border"
      )}
    >
      <div className={cn("h-1.5 shrink-0", lane.accent)} aria-hidden />
      <h2 className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2 short:py-1.5 lg:px-4 lg:py-2.5">
        <Icon className={cn("h-5 w-5 shrink-0 2xl:h-7 2xl:w-7", lane.text)} aria-hidden />
        {/* Wraps to 2 lines instead of truncating (long Greek labels) */}
        <span className={cn("line-clamp-2 min-w-0 break-words text-sm font-bold uppercase leading-tight tracking-wide sm:text-base xl:text-lg 2xl:text-2xl", lane.text)}>
          {lane.label}
        </span>
        <span className="ml-auto shrink-0 rounded-full bg-surface-container px-2.5 py-0.5 font-mono text-base font-bold 2xl:text-xl">
          {lane.orders.length}
        </span>
      </h2>

      <div ref={ref} className="flex min-h-0 flex-1 flex-col overflow-hidden p-2.5 short:p-2">
        {lane.orders.length === 0 ? (
          <p className="flex h-full min-h-24 items-center justify-center text-3xl text-on-surface-muted/40">—</p>
        ) : (
          <>
            <ul className="flex flex-col" style={{ gap: `${GAP_REM}rem` }}>
              {shown.map((order) =>
                closed ? (
                  <ClosedCard key={order.id} order={order} compact={fit.compact} />
                ) : (
                  <BoardCard key={order.id} order={order} lane={lane.key} compact={fit.compact} />
                )
              )}
            </ul>
            {hidden > 0 && (
              <p
                className="mt-auto flex shrink-0 items-center justify-center text-sm font-bold text-on-surface-muted"
                style={{ height: `${MORE_REM}rem` }}
              >
                {t("display.more", { count: hidden })}
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}

// ============================================================
// SECTION: Board card — readable from across the room
// ============================================================

function BoardCard({ order, lane, compact }: { order: OrderSummary; lane: LaneKey; compact: boolean }) {
  const t = useT();
  const progress = summaryProgress(order);
  // New / in production: age since placed. Ready: time waiting for pickup.
  const since = lane === "ready" ? order.updatedAt : order.placedAt;
  const ageMinutes = Math.max(0, Math.round((Date.now() - new Date(since).getTime()) / 60_000));
  const hot = lane !== "ready" && ageMinutes >= AGE_HOT_MIN;
  const warm = lane !== "ready" && ageMinutes >= AGE_WARN_MIN;

  const ageClass =
    lane === "ready"
      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
      : hot
        ? "bg-error-soft text-error"
        : warm
          ? "bg-warning-soft text-warning"
          : "bg-surface-container text-on-surface-muted";
  const borderClass =
    lane === "ready"
      ? "border-emerald-500/60 bg-emerald-500/5"
      : hot
        ? "border-error"
        : warm
          ? "border-warning"
          : "border-border";

  // Compact: name + age on line 1, number (+ % when making) on line 2.
  if (compact) {
    return (
      <li
        className={cn("flex flex-col justify-center gap-0.5 rounded-xl border-2 bg-surface-container-lowest px-2.5", borderClass)}
        style={{ height: `${COMPACT_CARD_REM}rem` }}
      >
        <div className="flex items-center justify-between gap-2">
          <p className="min-w-0 truncate text-base font-bold leading-tight">
            {order.customerName ?? order.orderNumber}
          </p>
          <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold", ageClass)}>
            <Clock className="h-3 w-3" aria-hidden />
            {formatAge(since)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <p className="min-w-0 truncate whitespace-nowrap font-mono text-xs text-on-surface-muted">{order.orderNumber}</p>
          {lane === "making" && (
            <span className="shrink-0 font-mono text-sm font-bold tabular-nums">{progress.pct}%</span>
          )}
        </div>
      </li>
    );
  }

  return (
    <li
      className={cn(
        "flex flex-col justify-between rounded-xl border-2 bg-surface-container-lowest px-3.5 py-2.5",
        borderClass
      )}
      style={{ height: `${CARD_REM}rem` }}
    >
      {/* Age chip rides on the number line so the name gets the full width */}
      <div className="min-w-0">
        <p className="truncate text-xl font-bold leading-tight 2xl:text-2xl">
          {order.customerName ?? order.orderNumber}
        </p>
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <p className="min-w-0 truncate whitespace-nowrap font-mono text-sm text-on-surface-muted">{order.orderNumber}</p>
          <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-sm font-bold", ageClass)}>
            <Clock className="h-3.5 w-3.5" aria-hidden />
            {formatAge(since)}
          </span>
        </div>
      </div>

      {lane === "making" ? (
        <div className="flex items-center gap-2.5">
          <div className="flex h-3 flex-1 overflow-hidden rounded-full bg-surface-container-highest">
            <div className="bg-success transition-[width] duration-700" style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }} />
            <div className="bg-warning transition-[width] duration-700" style={{ width: `${(progress.making / Math.max(1, progress.total)) * 100}%` }} />
          </div>
          <span className="shrink-0 font-mono text-lg font-bold tabular-nums">{progress.pct}%</span>
        </div>
      ) : (
        <p className="text-sm font-medium text-on-surface-muted">
          {order.itemCount} {t("common.items")} · {order.totalUnits} {t("common.units")}
        </p>
      )}
    </li>
  );
}

function ClosedCard({ order, compact }: { order: OrderSummary; compact: boolean }) {
  const locale = useLocale();
  return (
    <li
      className="flex items-center gap-2.5 rounded-xl border border-border bg-surface-container-lowest px-3"
      style={{ height: `${compact ? COMPACT_CLOSED_REM : CLOSED_CARD_REM}rem` }}
    >
      <CheckCircle2 className="h-5 w-5 shrink-0 text-success" aria-hidden />
      <span className="min-w-0 flex-1 truncate font-semibold">
        {order.customerName ?? order.orderNumber}
      </span>
      <span className={cn("shrink-0 font-mono text-sm text-on-surface-muted", compact && "text-xs")}>
        {order.completedAt
          ? new Date(order.completedAt).toLocaleTimeString(locale === "el" ? "el-GR" : "en-GB", {
              hour: "2-digit",
              minute: "2-digit",
            })
          : ""}
      </span>
    </li>
  );
}
