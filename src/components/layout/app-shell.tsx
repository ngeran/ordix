"use client";

// ============================================================
// SECTION: Imports
// ============================================================

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Banknote,
  Boxes,
  ClipboardList,
  FolderTree,
  Factory,
  Home,
  Package,
  ShoppingCart,
} from "lucide-react";
import type { OrdixSessionUser } from "@/types";
import { useCartStore } from "@/stores/cart-store";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { flushOutbox, refreshPendingCount } from "@/lib/offline-outbox";
import { useSyncStore } from "@/stores/sync-store";
import { LowStockBell } from "@/components/layout/low-stock-bell";
import { SyncIndicator } from "@/components/layout/sync-indicator";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { LocaleToggle } from "@/components/locale-toggle";
import { UserMenu } from "@/components/layout/user-menu";
import { InstallAppButton } from "@/components/layout/install-pwa";

// ============================================================
// SECTION: Navigation definition
// ------------------------------------------------------------
// Main routes for everyone; admin routes render only for the
// admin role. `icon` shows in both the sidebar and bottom bar.
// ============================================================

interface NavItem {
  href: string;
  labelKey:
    | "nav.home"
    | "nav.order"
    | "nav.orders"
    | "nav.production"
    | "nav.cashier"
    | "nav.products"
    | "nav.categories"
    | "nav.stock";
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
}

const NAV_MAIN: NavItem[] = [
  { href: "/home", labelKey: "nav.home", icon: Home },
  { href: "/order", labelKey: "nav.order", icon: ShoppingCart },
  { href: "/orders", labelKey: "nav.orders", icon: ClipboardList },
  { href: "/production", labelKey: "nav.production", icon: Factory },
  { href: "/cashier", labelKey: "nav.cashier", icon: Banknote },
];

const NAV_ADMIN: NavItem[] = [
  { href: "/admin/products", labelKey: "nav.products", icon: Package },
  { href: "/admin/categories", labelKey: "nav.categories", icon: FolderTree },
  { href: "/admin/stock", labelKey: "nav.stock", icon: Boxes },
];

// ============================================================
// SECTION: App shell
// ------------------------------------------------------------
// One wrapper around every page:
//   - /login renders bare (no chrome)
//   - desktop ≥ lg: fixed left sidebar
//   - phone/tablet: sticky top header + bottom tab bar
//   - rehydrates the cart store after mount (SSR always rendered
//     an empty ticket, so first client render must match)
// ============================================================

export function AppShell({
  user,
  children,
}: {
  user: OrdixSessionUser | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const t = useT();

  // Cart persistence: pull the localStorage draft into the store.
  useEffect(() => {
    useCartStore.persist.rehydrate();
  }, []);

  // ============================================================
  // SECTION: Offline sync lifecycle
  // ------------------------------------------------------------
  // Flush the IndexedDB outbox when connectivity returns, on app
  // launch (queue may hold mutations from a previous session),
  // and every 30 s while items are pending. The outbox itself is
  // single-flusher (Web Locks), so multiple tabs are safe.
  // ============================================================
  useEffect(() => {
    useSyncStore.getState().setOnline(navigator.onLine);
    void refreshPendingCount();

    const handleOnline = () => {
      useSyncStore.getState().setOnline(true);
      void flushOutbox();
    };
    const handleOffline = () => useSyncStore.getState().setOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Catch-up flush shortly after mount (auth cookie settled).
    const launchFlush = setTimeout(() => void flushOutbox(), 2_000);
    // Retry loop while anything is queued (e.g. flaky warehouse Wi-Fi).
    const retryInterval = setInterval(() => {
      if (useSyncStore.getState().pending > 0 && navigator.onLine) {
        void flushOutbox();
      }
    }, 30_000);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      clearTimeout(launchFlush);
      clearInterval(retryInterval);
    };
  }, []);

  const isAdmin = user?.role === "admin";

  // -- Bare layouts: login (focus) and /display (wall board must
  //    fill the tablet screen with no navigation chrome) --
  if (pathname === "/login" || pathname === "/display") {
    return <>{children}</>;
  }

  const mainNav = NAV_MAIN;
  const adminNav = isAdmin ? NAV_ADMIN : [];

  const navLinkClasses = (href: string) => {
    const isActive = pathname === href || pathname.startsWith(href + "/");
    return cn(
      "flex items-center gap-3 rounded-xl px-4 py-3 text-[15px] font-medium transition-colors",
      isActive
        ? "bg-primary-soft text-primary"
        : "text-on-surface-muted hover:bg-surface-container-low hover:text-on-surface"
    );
  };

  return (
    <div className="min-h-dvh">
      {/* ============================================================
          SECTION: Desktop sidebar (lg+)
          ============================================================ */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-border bg-surface px-3 py-4 lg:flex">
        <Link href="/order" className="mb-6 flex items-center gap-2 px-3">
          <BrandMark />
          <span className="text-xl font-bold tracking-tight">Ordix</span>
        </Link>

        <nav className="space-y-1" aria-label={t("app.name")}>
          {mainNav.map((item) => (
            <NavLink key={item.href} item={item} className={navLinkClasses(item.href)} label={t(item.labelKey)} />
          ))}
          {adminNav.length > 0 && (
            <>
              <p className="px-4 pb-1 pt-4 text-xs font-semibold uppercase tracking-wider text-on-surface-muted">
                {t("nav.adminSection")}
              </p>
              {adminNav.map((item) => (
                <NavLink key={item.href} item={item} className={navLinkClasses(item.href)} label={t(item.labelKey)} />
              ))}
            </>
          )}
        </nav>

        <div className="mt-auto px-1">
          <InstallAppButton className="w-full" />
        </div>
      </aside>

      {/* ============================================================
          SECTION: Top header (all sizes)
          ============================================================ */}
      <header className="sticky top-0 z-20 border-b border-border bg-surface/90 backdrop-blur lg:pl-60">
        <div className="flex h-14 items-center justify-between gap-2 px-3 sm:px-5">
          {/* Mobile brand (sidebar covers desktop) */}
          <Link href="/order" className="flex items-center gap-2 lg:hidden">
            <BrandMark />
            <span className="text-lg font-bold">Ordix</span>
          </Link>
          <div className="hidden lg:block" />

          <div className="flex items-center gap-1">
            <SyncIndicator />
            {isAdmin && <LowStockBell />}
            <InstallAppButton className="hidden sm:inline-flex" variant="compact" />
            <LocaleToggle />
            <ThemeToggle />
            <UserMenu user={user} />
          </div>
        </div>
      </header>

      {/* ============================================================
          SECTION: Page content
          ============================================================ */}
      <main className="pb-20 lg:pb-6 lg:pl-60">
        {children}
      </main>

      {/* ============================================================
          SECTION: Bottom tab bar (mobile / tablet)
          ============================================================ */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
        aria-label="Main navigation"
      >
        <div className="grid grid-cols-5">
          {mainNav.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex h-16 flex-col items-center justify-center gap-0.5 text-xs font-medium",
                  isActive ? "text-primary" : "text-on-surface-muted"
                )}
              >
                <Icon className="h-6 w-6" />
                {t(item.labelKey)}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

// ============================================================
// SECTION: Internal helpers
// ============================================================

function NavLink({
  item,
  className,
  label,
}: {
  item: NavItem;
  className: string;
  label: string;
}) {
  const Icon = item.icon;
  return (
    <Link href={item.href} className={className}>
      <Icon className="h-5 w-5 shrink-0" />
      {label}
    </Link>
  );
}

/** Square brand glyph — "O" box, pure CSS, no asset needed. */
function BrandMark() {
  return (
    <span
      aria-hidden
      className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary font-black text-on-primary"
    >
      O
    </span>
  );
}
