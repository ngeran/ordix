"use client";

// ============================================================
// SECTION: Imports
// ============================================================

import Link from "next/link";
import {
  ChefHat,
  ClipboardList,
  Monitor,
  Package,
  ShoppingCart,
  type LucideIcon,
} from "lucide-react";
import { useT } from "@/lib/i18n";

// ============================================================
// SECTION: Home launcher
// ------------------------------------------------------------
// Design rules for 50+ / first-time users:
//   - FEW choices (3–4 tiles, not a menu tree)
//   - HUGE hit areas (whole tile is the button)
//   - Icon + short label + one-line hint — no jargon
//   - One column on phones, two on tablets, three on desktop
// Admin tiles render smaller in their own row, only for admins.
// ============================================================

interface HomeTile {
  href: string;
  labelKey: "home.newOrder" | "home.orders" | "home.prep" | "home.display";
  hintKey: "home.newOrderHint" | "home.ordersHint" | "home.prepHint" | "home.displayHint";
  icon: LucideIcon;
  /** Tailwind classes coloring the icon bubble per action. */
  bubbleClass: string;
}

const MAIN_TILES: HomeTile[] = [
  {
    href: "/order",
    labelKey: "home.newOrder",
    hintKey: "home.newOrderHint",
    icon: ShoppingCart,
    bubbleClass: "bg-primary text-on-primary",
  },
  {
    href: "/orders",
    labelKey: "home.orders",
    hintKey: "home.ordersHint",
    icon: ClipboardList,
    bubbleClass: "bg-sky-500 text-white",
  },
  {
    href: "/prep",
    labelKey: "home.prep",
    hintKey: "home.prepHint",
    icon: ChefHat,
    bubbleClass: "bg-amber-500 text-white",
  },
  {
    href: "/display",
    labelKey: "home.display",
    hintKey: "home.displayHint",
    icon: Monitor,
    bubbleClass: "bg-teal-500 text-white",
  },
];

export function HomeScreen({ isAdmin }: { isAdmin: boolean }) {
  const t = useT();

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      {/* One friendly question — not a title full of jargon */}
      <h1 className="text-center text-3xl font-bold sm:text-4xl">{t("home.title")}</h1>
      <p className="mt-2 text-center text-lg text-on-surface-muted">{t("home.subtitle")}</p>

      {/* -- Giant action tiles -- */}
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {MAIN_TILES.map((tile) => {
          const Icon = tile.icon;
          return (
            <Link
              key={tile.href}
              href={tile.href}
              className="flex items-center gap-5 rounded-3xl border-2 border-border bg-surface p-6 shadow-card transition-all hover:border-primary hover:shadow-pop active:scale-[0.98]"
            >
              <span
                aria-hidden
                className={`flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl ${tile.bubbleClass}`}
              >
                <Icon className="h-11 w-11" strokeWidth={2.2} />
              </span>
              <span className="min-w-0">
                <span className="block text-2xl font-bold leading-tight">{t(tile.labelKey)}</span>
                <span className="mt-1 block text-base text-on-surface-muted">{t(tile.hintKey)}</span>
              </span>
            </Link>
          );
        })}
      </div>

      {/* -- Admin area (smaller, separate, only for admins) -- */}
      {isAdmin && (
        <>
          <h2 className="mt-10 text-center text-sm font-semibold uppercase tracking-wider text-on-surface-muted">
            {t("nav.adminSection")}
          </h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <AdminTile href="/admin/products" icon={Package} label={t("nav.products")} />
            <AdminTile href="/admin/categories" icon={ClipboardList} label={t("nav.categories")} />
            <AdminTile href="/admin/stock" icon={ChefHat} label={t("nav.stock")} />
          </div>
        </>
      )}
    </div>
  );
}

// ============================================================
// SECTION: Admin tile (secondary size)
// ============================================================

function AdminTile({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-center gap-3 rounded-2xl border border-border bg-surface px-4 py-5 text-lg font-semibold shadow-card transition-all hover:border-primary active:scale-[0.98]"
    >
      <Icon className="h-6 w-6 text-primary" aria-hidden />
      {label}
    </Link>
  );
}
