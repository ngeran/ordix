"use client";

// ============================================================
// SECTION: Imports
// ============================================================

import Link from "next/link";
import { useAppSettings } from "@/stores/settings-store";
import {
  ArrowRight,
  ClipboardList,
  Factory,
  Lock,
  Monitor,
  ShoppingCart,
  type LucideIcon,
} from "lucide-react";
import type { OrderSummary } from "@/types";
import { usePolling } from "@/lib/use-polling";
import { useT, type MessageKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";

// ============================================================
// SECTION: Home launcher
// ------------------------------------------------------------
// Design rules for 50+ / first-time users:
//   - The three numbered steps ARE the workflow: take the order
//     → production makes it → front desk closes it
//   - HUGE hit areas (whole tile is the button)
//   - A live counter on each step says if work is waiting there
//   - Orders + Wallboard sit below as secondary tiles
// Admin pages live in the sidebar only (not on Home).
// ============================================================

interface StepTile {
  href: string;
  step: number;
  labelKey: MessageKey;
  hintKey: MessageKey;
  icon: LucideIcon;
  bubbleClass: string;
  count?: (orders: OrderSummary[]) => number;
  countKey?: MessageKey;
}

const STEP_TILES: StepTile[] = [
  {
    href: "/order",
    step: 1,
    labelKey: "home.newOrder",
    hintKey: "home.newOrderHint",
    icon: ShoppingCart,
    bubbleClass: "bg-primary text-on-primary",
  },
  {
    href: "/production",
    step: 2,
    labelKey: "home.production",
    hintKey: "home.productionHint",
    icon: Factory,
    bubbleClass: "bg-amber-500 text-white",
    count: (orders) =>
      orders.filter((o) => o.status === "placed" || o.status === "in_production").length,
    countKey: "home.active",
  },
  {
    href: "/cashier",
    step: 3,
    labelKey: "home.cashier",
    hintKey: "home.cashierHint",
    icon: Lock,
    bubbleClass: "bg-emerald-500 text-white",
    count: (orders) => orders.filter((o) => o.status === "production_complete").length,
    countKey: "home.ready",
  },
];

export function HomeScreen() {
  const t = useT();
  const { features } = useAppSettings();
  const { data: activeOrders } = usePolling<OrderSummary[]>(
    "/api/orders?scope=active",
    { intervalMs: 15_000 }
  );
  const orders = activeOrders ?? [];

  return (
    <div className="mx-auto flex min-h-full w-full max-w-7xl flex-col justify-center px-4 py-6 short:py-2 sm:px-6 lg:py-10">
      {/* One friendly question — not a title full of jargon */}
      <div className="text-center">
        <h1 className="text-3xl font-bold short:text-xl sm:text-4xl short:sm:text-2xl">{t("home.title")}</h1>
        <p className="mt-2 text-lg text-on-surface-muted short:hidden">{t("home.subtitle")}</p>
      </div>

      {/* ============================================================
          SECTION: The three workflow steps (giant tiles)
          ============================================================ */}
      <ol className="mt-8 grid gap-4 short:mt-2 short:grid-cols-3 short:gap-3 lg:grid-cols-3 landscape:max-lg:grid-cols-3">
        {STEP_TILES.map((tile, index) => {
          const Icon = tile.icon;
          const count = tile.count?.(orders) ?? 0;
          return (
            <li key={tile.href} className="relative">
              <Link
                href={tile.href}
                className={cn(
                  "group flex h-full items-center gap-5 rounded-3xl border-2 border-border bg-surface p-5 shadow-card transition-all hover:border-primary hover:shadow-pop active:scale-[0.98] lg:flex-col lg:items-start lg:p-6 md:p-5 landscape:max-lg:flex-col landscape:max-lg:items-start",
                  // Tiles grow with the viewport height (capped) so big tablets
                  // are filled; short landscape goes back to compact rows.
                  // Portrait below lg: full-width ROWS (3 columns squeezed the labels)
                  "md:max-lg:portrait:min-h-[clamp(7rem,17dvh,13rem)] lg:min-h-[clamp(14rem,40dvh,34rem)] lg:justify-between landscape:max-lg:min-h-[clamp(12rem,40dvh,30rem)] landscape:max-lg:justify-between",
                  "short:min-h-0 short:flex-row short:items-center short:justify-start short:gap-3 short:p-3"
                )}
              >
                <div className="flex shrink-0 items-start max-md:w-auto">
                  <span
                    aria-hidden
                    className={cn(
                      "flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl short:h-12 short:w-12 [@media(min-height:900px)]:lg:h-24 [@media(min-height:900px)]:lg:w-24",
                      "short:[&_svg]:h-7 short:[&_svg]:w-7 [@media(min-height:900px)]:lg:[&_svg]:h-14 [@media(min-height:900px)]:lg:[&_svg]:w-14",
                      tile.bubbleClass
                    )}
                  >
                    <Icon className="h-11 w-11" strokeWidth={2.2} />
                  </span>
                </div>
                <span className="min-w-0">
                  <span className="block text-sm font-bold uppercase tracking-wider text-primary">
                    {t("home.step", { n: tile.step })}
                  </span>
                  <span className="block text-xl font-bold leading-tight lg:text-2xl [@media(min-height:900px)]:lg:text-3xl">
                    {t(tile.labelKey)}
                  </span>
                  <span className="mt-1 block text-sm text-on-surface-muted short:hidden lg:text-base">
                    {t(tile.hintKey)}
                  </span>
                  {count > 0 && tile.countKey && (
                    <span className="mt-2 inline-block rounded-full bg-error px-3 py-1 text-sm font-bold text-white ">
                      {t(tile.countKey, { count })}
                    </span>
                  )}
                </span>
              </Link>
              {/* Arrow between steps (wide layouts) */}
              {index < STEP_TILES.length - 1 && (
                <span
                  aria-hidden
                  className="absolute -right-3.5 top-1/2 z-10 hidden h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background text-on-surface-muted lg:flex landscape:flex"
                >
                  <ArrowRight className="h-4 w-4" />
                </span>
              )}
            </li>
          );
        })}
      </ol>

      {/* ============================================================
          SECTION: Secondary tiles — look things up / big screen
          ============================================================ */}
      <div className={cn("mt-4 grid gap-4 short:mt-3 short:gap-3", features.displayBoard && "sm:grid-cols-2")}>
        <SecondaryTile
          href="/orders"
          icon={ClipboardList}
          bubbleClass="bg-sky-500 text-white"
          label={t("home.orders")}
          hint={t("home.ordersHint")}
          badge={orders.length > 0 ? t("home.active", { count: orders.length }) : null}
        />
        {features.displayBoard && (
          <SecondaryTile
            href="/display"
            icon={Monitor}
            bubbleClass="bg-teal-500 text-white"
            label={t("home.display")}
            hint={t("home.displayHint")}
            badge={null}
          />
        )}
      </div>
    </div>
  );
}

// ============================================================
// SECTION: Secondary tile (smaller, horizontal)
// ============================================================

function SecondaryTile({
  href,
  icon: Icon,
  bubbleClass,
  label,
  hint,
  badge,
}: {
  href: string;
  icon: LucideIcon;
  bubbleClass: string;
  label: string;
  hint: string;
  badge: string | null;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-4 rounded-3xl border-2 border-border bg-surface p-4 shadow-card transition-all hover:border-primary hover:shadow-pop active:scale-[0.98] short:p-2.5 md:min-h-[clamp(5rem,12dvh,9rem)]"
    >
      <span
        aria-hidden
        className={cn("flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl short:h-11 short:w-11", bubbleClass)}
      >
        <Icon className="h-8 w-8" strokeWidth={2.2} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xl font-bold leading-tight hyphens-auto [overflow-wrap:anywhere]">{label}</span>
        <span className="block text-sm text-on-surface-muted [overflow-wrap:anywhere]">{hint}</span>
        {/* Under the text so the label keeps the full column width */}
        {badge && (
          <span className="mt-1.5 inline-block rounded-full bg-surface-container-high px-3 py-1 text-sm font-bold">
            {badge}
          </span>
        )}
      </span>
    </Link>
  );
}
