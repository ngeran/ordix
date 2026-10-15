"use client";

// ============================================================
// SECTION: Imports
// ============================================================

import { useEffect, useRef } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { LogOut, ChevronDown } from "lucide-react";
import type { OrdixSessionUser } from "@/types";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { ROLE_LABEL } from "@/lib/roles";
import { Button } from "@/components/ui/button";
import type { NavItem } from "@/components/layout/app-shell";

// ============================================================
// SECTION: User menu (header)
// ------------------------------------------------------------
// <details>-based dropdown: natively accessible (Enter/Space to
// open, Esc via browser, closes on outside click with a little
// JS) and unbreakable on touch devices. Also hosts the admin
// links (empty list for staff) — reachable on phones too.
// ============================================================

export function UserMenu({
  user,
  adminItems,
  isActive,
  quickControls,
}: {
  user: OrdixSessionUser | null;
  adminItems: NavItem[];
  isActive: (href: string) => boolean;
  /** Language / theme / fullscreen buttons — shown here on phones,
   *  where the header has no room for them. */
  quickControls?: React.ReactNode;
}) {
  const t = useT();
  const ref = useRef<HTMLDetailsElement>(null);

  const close = () => {
    if (ref.current) ref.current.open = false;
  };

  // Outside tap/click and Esc close it (<details> has neither built
  // in; closing on mouseleave misfired with trackpads and pencils).
  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (ref.current?.open && !ref.current.contains(event.target as Node)) {
        close();
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && ref.current?.open) {
        close();
        ref.current.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  if (!user) return null;

  return (
    <details ref={ref} className="relative group">
      <summary
        className="flex h-12 cursor-pointer list-none items-center gap-1.5 rounded-xl px-2 hover:bg-surface-container-low [&::-webkit-details-marker]:hidden"
        aria-label={`Account: ${user.name ?? user.email}`}
      >
        {/* Avatar initial */}
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-soft text-sm font-bold text-primary">
          {(user.name ?? user.email ?? "?").charAt(0).toUpperCase()}
        </span>
        <ChevronDown className="h-4 w-4 text-on-surface-muted" aria-hidden />
      </summary>

      {/* Capped to the visible height: on a phone in landscape the
          admin links + sign out would otherwise run off-screen. */}
      <div className="scrollbar-thin absolute right-0 top-14 z-40 max-h-[calc(var(--vvh,100dvh)-4.5rem-env(safe-area-inset-top))] w-60 overflow-y-auto overscroll-contain rounded-xl border border-border bg-surface p-2 shadow-pop">
        <div className="border-b border-border px-3 pb-2 pt-1">
          <p className="truncate text-sm font-semibold">{user.name ?? "—"}</p>
          <p className="truncate text-xs text-on-surface-muted">
            {user.username ? `@${user.username}` : user.email} · {t(ROLE_LABEL[user.role])}
          </p>
        </div>

        {quickControls && (
          <div className="flex items-center justify-around border-b border-border py-1 sm:hidden">
            {quickControls}
          </div>
        )}

        {adminItems.length > 0 && (
          <nav className="border-b border-border py-1" aria-label={t("nav.adminSection")}>
            <p className="px-3 pb-1 pt-1.5 text-xs font-semibold uppercase tracking-wider text-on-surface-muted">
              {t("nav.adminSection")}
            </p>
            {adminItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={close}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors",
                    active
                      ? "bg-primary-soft text-primary"
                      : "text-on-surface hover:bg-surface-container-low"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {t(item.labelKey)}
                </Link>
              );
            })}
          </nav>
        )}

        <Button
          variant="ghost"
          className="mt-1 w-full justify-start"
          onClick={() => signOut({ redirectTo: "/login" })}
        >
          <LogOut className="h-4 w-4" />
          {t("nav.signOut")}
        </Button>
      </div>
    </details>
  );
}
