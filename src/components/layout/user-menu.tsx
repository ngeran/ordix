"use client";

// ============================================================
// SECTION: Imports
// ============================================================

import { signOut } from "next-auth/react";
import { LogOut, ChevronDown } from "lucide-react";
import type { OrdixSessionUser } from "@/types";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";

// ============================================================
// SECTION: User menu (header)
// ------------------------------------------------------------
// <details>-based dropdown: natively accessible (Enter/Space to
// open, Esc via browser, closes on outside click with a little
// JS) and unbreakable on touch devices.
// ============================================================

export function UserMenu({ user }: { user: OrdixSessionUser | null }) {
  const t = useT();

  if (!user) return null;

  return (
    <details className="relative group">
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

      <div
        className="absolute right-0 top-14 z-40 w-56 rounded-xl border border-border bg-surface p-2 shadow-pop"
        onMouseLeave={(event) => {
          // Close when the pointer leaves — details stays open otherwise.
          (event.currentTarget.parentElement as HTMLDetailsElement).open = false;
        }}
      >
        <div className="border-b border-border px-3 pb-2 pt-1">
          <p className="truncate text-sm font-semibold">{user.name ?? "—"}</p>
          <p className="truncate text-xs text-on-surface-muted">
            {user.email} · {user.role}
          </p>
        </div>
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
