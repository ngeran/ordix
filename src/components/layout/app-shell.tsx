"use client";

// ============================================================
// SECTION: Imports
// ============================================================

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ClipboardList,
  Factory,
  FileUp,
  FolderTree,
  Home,
  Lock,
  Monitor,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  ShoppingCart,
  UserRound,
  UsersRound,
} from "lucide-react";
import type { OrdixSessionUser, OrderSummary } from "@/types";
import { useCartStore } from "@/stores/cart-store";
import { cn } from "@/lib/utils";
import { applyLocale, seedLocale, useT, type Locale, type MessageKey } from "@/lib/i18n";
import { businessName, type AppSettings } from "@/lib/settings";
import { useSettingsStore } from "@/stores/settings-store";
import { usePolling } from "@/lib/use-polling";
import { flushOutbox, refreshPendingCount } from "@/lib/offline-outbox";
import { useSyncStore } from "@/stores/sync-store";
import { SyncIndicator } from "@/components/layout/sync-indicator";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { LocaleToggle } from "@/components/locale-toggle";
import { UserMenu } from "@/components/layout/user-menu";
import { hasAdminAccess } from "@/lib/roles";
import { InstallAppButton, registerServiceWorker } from "@/components/layout/install-pwa";
import { startViewportTracking } from "@/lib/use-viewport-tracking";
import { FullscreenToggle } from "@/components/layout/fullscreen-toggle";

// ============================================================
// SECTION: Navigation definition
// ------------------------------------------------------------
// Main routes follow the order's journey (take → make → close);
// admin routes render only for the admin role, inside the avatar
// menu (not the sidebar) so daily staff see a short nav. `badge` names the
// live counter shown next to the link (work waiting there).
// ============================================================

type BadgeKind = "production" | "closure";

export interface NavItem {
  href: string;
  labelKey: MessageKey;
  /** Bottom tab bar label when the full one won't fit (~75px a tab). */
  shortKey?: MessageKey;
  icon: React.ComponentType<{ className?: string }>;
  badge?: BadgeKind;
}

const NAV_MAIN: NavItem[] = [
  { href: "/home", labelKey: "nav.home", icon: Home },
  { href: "/order", labelKey: "nav.order", shortKey: "nav.orderShort", icon: ShoppingCart },
  { href: "/orders", labelKey: "nav.orders", icon: ClipboardList },
  { href: "/production", labelKey: "nav.production", icon: Factory, badge: "production" },
  { href: "/cashier", labelKey: "nav.cashier", icon: Lock, badge: "closure" },
];

const NAV_EXTRA: NavItem[] = [
  { href: "/display", labelKey: "nav.display", icon: Monitor },
];

const NAV_ADMIN: NavItem[] = [
  { href: "/admin/products", labelKey: "nav.products", icon: Package },
  { href: "/admin/categories", labelKey: "nav.categories", icon: FolderTree },
  { href: "/admin/customers", labelKey: "nav.customers", icon: UserRound },
  { href: "/admin/import", labelKey: "nav.import", icon: FileUp },
  { href: "/admin/users", labelKey: "nav.users", icon: UsersRound },
  { href: "/admin/settings", labelKey: "nav.settings", icon: Settings },
];

// ============================================================
// SECTION: Sidebar collapse (pre-paint, no React state flash)
// ------------------------------------------------------------
// The root layout's inline script sets <html data-sidebar=…>
// before first paint; the `sidebar-collapsed:` Tailwind variant
// keys off it. Toggling only flips the attribute + localStorage.
// ============================================================

const SIDEBAR_KEY = "ordix-sidebar";

function useSidebarCollapsed(): [boolean, () => void] {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(document.documentElement.dataset.sidebar === "collapsed");
  }, []);

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    if (next) document.documentElement.dataset.sidebar = "collapsed";
    else delete document.documentElement.dataset.sidebar;
    try {
      localStorage.setItem(SIDEBAR_KEY, next ? "collapsed" : "expanded");
    } catch {
      // storage unavailable — preference just won't persist
    }
  };

  return [collapsed, toggle];
}

// ============================================================
// SECTION: App shell
// ------------------------------------------------------------
// One wrapper around every page, filling the whole viewport:
//   - /login and /display render bare (no chrome)
//   - md+ (tablets, landscape phones, desktop): left sidebar,
//     collapsible to an icon rail (with captions — touch screens
//     never show the `title` tooltips)
//   - short landscape phones narrower than md (`rail:`): the
//     icon rail too — top bar + bottom tabs would eat a third of
//     the ~375px height
//   - phones in portrait: top header + bottom tab bar (hidden
//     while the on-screen keyboard is up)
//   - md+: <main> pads for the home indicator (iPad / landscape
//     iPhone); on phones the tab bar already does
//   - <main> is the ONLY scroll container, so full-height
//     screens (order entry, boards) can use `h-full`
// ============================================================

export function AppShell({
  user,
  settings,
  locale,
  children,
}: {
  user: OrdixSessionUser | null;
  /** Server-read app settings (admin → Settings). */
  settings: AppSettings;
  /** Language resolved on the server (settings + device cookie). */
  locale: Locale;
  children: React.ReactNode;
}) {
  // Seed settings + default language BEFORE anything renders, on
  // the server and the client alike, so the first paint already
  // honors them (and both sides render identical markup).
  useState(() => {
    useSettingsStore.setState({ settings });
    seedLocale(locale);
  });

  const pathname = usePathname();
  const t = useT();
  const [collapsed, toggleCollapsed] = useSidebarCollapsed();

  // Bare = no chrome: sign-in, wall display, printable order sheets.
  const isBare =
    pathname === "/login" || pathname === "/display" || /^\/orders\/[^/]+\/print$/.test(pathname);

  // An admin saved new settings (router.refresh re-rendered the
  // layout with the new document): apply them without a reload.
  useEffect(() => {
    useSettingsStore.getState().setSettings(settings);
    applyLocale(settings.language);
  }, [settings]);

  // Keyboard-aware sizing (--vvh, data-kbd) and the offline shell —
  // on every route, bare ones (/login, /display) included.
  useEffect(() => startViewportTracking(), []);
  useEffect(() => registerServiceWorker(), []);

  // Persisted cart draft: pulled from localStorage after mount so
  // SSR and the first client render match.
  useEffect(() => {
    void useCartStore.persist.rehydrate();
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

  // -- Live work counters for the nav badges --
  const { data: activeOrders } = usePolling<OrderSummary[]>(
    "/api/orders?scope=active",
    { intervalMs: 15_000, enabled: !isBare && user !== null }
  );
  const badgeCounts: Record<BadgeKind, number> = {
    production: (activeOrders ?? []).filter(
      (order) => order.status === "placed" || order.status === "in_production"
    ).length,
    closure: (activeOrders ?? []).filter(
      (order) => order.status === "production_complete"
    ).length,
  };

  if (isBare) {
    return <>{children}</>;
  }

  const adminNav = hasAdminAccess(user?.role) ? NAV_ADMIN : [];
  const { features } = settings;
  const extraNav = NAV_EXTRA.filter(
    (item) => item.href !== "/display" || features.displayBoard
  );
  const brand = businessName(settings);
  const quickControls =
    features.fullscreenButton || settings.language.allowSwitch || settings.theme.mode === "user" ? (
      <>
        {features.fullscreenButton && <FullscreenToggle />}
        {settings.language.allowSwitch && <LocaleToggle />}
        {settings.theme.mode === "user" && <ThemeToggle />}
      </>
    ) : null;
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");
  const current = [...NAV_MAIN, ...extraNav, ...adminNav].find((item) =>
    isActive(item.href)
  );

  return (
    <div className="flex h-app overflow-hidden">
      {/* ============================================================
          SECTION: Sidebar (md+) — full or icon rail
          ============================================================ */}
      <aside
        className={cn(
          "hidden w-60 shrink-0 flex-col border-r border-border bg-surface pb-[max(1rem,env(safe-area-inset-bottom))] pl-[env(safe-area-inset-left)] pt-[max(1rem,env(safe-area-inset-top))] transition-[width] duration-200 md:flex rail:flex",
          "sidebar-collapsed:w-[4.75rem] rail:w-[4.75rem] rail:pt-[max(0.5rem,env(safe-area-inset-top))]"
        )}
      >
        {/* Brand + collapse toggle. Toggle lives up top (not the
            bottom corner) so it's easy to find and never sits under
            floating overlays; in the rail it stacks below the logo. */}
        <div className="mb-5 flex items-center justify-between gap-2 px-2.5 short:mb-2 sidebar-collapsed:flex-col sidebar-collapsed:gap-3 rail:flex-col">
          <Link href="/home" className="flex min-w-0 items-center gap-2.5 px-1.5 sidebar-collapsed:px-0 rail:px-0">
            <BrandMark name={brand} logoUrl={settings.business.logoUrl} />
            <span className="truncate text-xl font-bold tracking-tight sidebar-collapsed:hidden rail:hidden">
              {brand}
            </span>
          </Link>
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-expanded={!collapsed}
            aria-label={collapsed ? t("nav.expand") : t("nav.collapse")}
            title={collapsed ? t("nav.expand") : t("nav.collapse")}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-on-surface-muted transition-colors hover:bg-surface-container-low hover:text-on-surface rail:hidden"
          >
            {collapsed ? (
              <PanelLeftOpen className="h-5 w-5" />
            ) : (
              <PanelLeftClose className="h-5 w-5" />
            )}
          </button>
        </div>

        <nav
          className="scrollbar-thin min-h-0 flex-1 space-y-1 overflow-y-auto px-2.5 sidebar-collapsed:px-1"
          aria-label={t("app.name")}
        >
          {NAV_MAIN.map((item) => (
            <SideLink
              key={item.href}
              item={item}
              label={t(item.labelKey)}
              active={isActive(item.href)}
              badge={item.badge ? badgeCounts[item.badge] : 0}
            />
          ))}

          {extraNav.length > 0 && <div className="my-3 border-t border-border" />}
          {extraNav.map((item) => (
            <SideLink
              key={item.href}
              item={item}
              label={t(item.labelKey)}
              active={isActive(item.href)}
              badge={0}
            />
          ))}

        </nav>

        <div className="mt-3 px-2.5 sidebar-collapsed:hidden rail:hidden">
          {features.installApp && (
            <InstallAppButton className="w-full sidebar-collapsed:hidden" />
          )}
        </div>
      </aside>

      {/* ============================================================
          SECTION: Header + page + bottom bar column
          ============================================================ */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="relative z-30 shrink-0 border-b border-border bg-surface/95 pr-[env(safe-area-inset-right)] pt-[env(safe-area-inset-top)] backdrop-blur">
          <div className="flex h-14 items-center justify-between gap-2 px-3 short:h-12 sm:px-5">
            {/* Where am I? — brand on phones, page name everywhere */}
            <div className="flex min-w-0 items-center gap-2.5">
              <Link href="/home" className="md:hidden rail:hidden" aria-label={t("nav.home")}>
                <BrandMark name={brand} logoUrl={settings.business.logoUrl} />
              </Link>
              {current && (
                <h1 className="flex min-w-0 items-center gap-2 truncate text-lg font-bold">
                  <current.icon className="hidden h-5 w-5 shrink-0 text-primary md:block" />
                  <span className="truncate">{t(current.labelKey)}</span>
                </h1>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-0.5">
              <SyncIndicator />
              {features.installApp && (
                <InstallAppButton className="hidden sm:inline-flex md:hidden" variant="compact" />
              )}
              {/* Phones: these move into the avatar menu (no room). */}
              <div className="hidden items-center gap-0.5 sm:flex">{quickControls}</div>
              <UserMenu
                user={user}
                adminItems={adminNav}
                isActive={isActive}
                quickControls={quickControls}
              />
            </div>
          </div>
        </header>

        {/* ============================================================
            SECTION: Page content (the single scroll container)
            ============================================================ */}
        <main
          id="app-main"
          className="scrollbar-thin relative min-h-0 flex-1 overflow-y-auto pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] md:pb-[env(safe-area-inset-bottom)] md:pl-0 rail:pb-[env(safe-area-inset-bottom)] rail:pl-0"
        >
          {children}
        </main>

        {/* ============================================================
            SECTION: Bottom tab bar (phones in portrait)
            ============================================================ */}
        <nav
          className="shrink-0 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] md:hidden rail:hidden kbd-open:hidden"
          aria-label={t("app.name")}
        >
          <div className="grid grid-cols-5">
            {NAV_MAIN.map((item) => {
              const active = isActive(item.href);
              const Icon = item.icon;
              const count = item.badge ? badgeCounts[item.badge] : 0;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex h-16 flex-col items-center justify-center gap-0.5 text-[0.68rem] font-semibold",
                    active ? "text-primary" : "text-on-surface-muted"
                  )}
                >
                  <span
                    className={cn(
                      "relative flex h-8 w-14 items-center justify-center rounded-full transition-colors",
                      active && "bg-primary-soft"
                    )}
                  >
                    <Icon className="h-6 w-6" />
                    {count > 0 && <CountBubble count={count} className="absolute -right-1 -top-1" />}
                  </span>
                  <span className="max-w-full truncate px-1">{t(item.shortKey ?? item.labelKey)}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}

// ============================================================
// SECTION: Internal helpers
// ============================================================

function SideLink({
  item,
  label,
  active,
  badge,
}: {
  item: NavItem;
  label: string;
  active: boolean;
  badge: number;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      title={label}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex h-12 items-center gap-3 rounded-xl px-3.5 text-[15px] font-medium transition-colors",
        // Collapsed rail: icon over a small caption; short screens and
        // the forced landscape rail: icon only (height is precious).
        "sidebar-collapsed:h-auto sidebar-collapsed:min-h-14 sidebar-collapsed:flex-col sidebar-collapsed:justify-center sidebar-collapsed:gap-1 sidebar-collapsed:px-0 sidebar-collapsed:py-1.5",
        "short:sidebar-collapsed:h-12 short:sidebar-collapsed:min-h-0 short:sidebar-collapsed:py-0 rail:h-12 rail:justify-center rail:px-0",
        active
          ? "bg-primary-soft text-primary"
          : "text-on-surface-muted hover:bg-surface-container-low hover:text-on-surface"
      )}
    >
      <Icon className="h-5 w-5 shrink-0" />
      <span className="min-w-0 flex-1 truncate sidebar-collapsed:hidden rail:hidden">{label}</span>
      {/* Rail caption: up to 2 lines ("Νέα / παραγγελία") so long Greek
          labels stay readable instead of truncating to "Παραγγ…". */}
      <span className="hidden w-full text-center text-[0.62rem] font-semibold leading-tight [overflow-wrap:anywhere] sidebar-collapsed:line-clamp-2 short:sidebar-collapsed:hidden rail:hidden">
        {label}
      </span>
      {badge > 0 && (
        <CountBubble
          count={badge}
          className="sidebar-collapsed:absolute sidebar-collapsed:right-1 sidebar-collapsed:top-1 rail:absolute rail:right-1 rail:top-1"
        />
      )}
    </Link>
  );
}

/** Small red counter — "work is waiting here". */
function CountBubble({ count, className }: { count: number; className?: string }) {
  return (
    <span
      className={cn(
        "flex h-5 min-w-5 items-center justify-center rounded-full bg-error px-1.5 text-[11px] font-bold leading-none text-white",
        className
      )}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

/** Square brand glyph: the business logo, else its initial in a box. */
export function BrandMark({
  name,
  logoUrl,
  className,
}: {
  name: string;
  logoUrl: string | null;
  className?: string;
}) {
  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- inline data URL, nothing to optimize
      <img
        src={logoUrl}
        alt=""
        aria-hidden
        className={cn("h-9 w-9 shrink-0 rounded-xl object-contain", className)}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-lg font-black text-on-primary",
        className
      )}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}
